from __future__ import annotations

import asyncio
import json
import logging
import random
import signal
from collections.abc import Callable
from typing import Protocol

import httpx
from pydantic import ValidationError

from .client import ApplicationClient
from .config import WorkerSettings
from .errors import describe_error
from .execution import (
    LEASE_HEARTBEAT_SECONDS,
    JobClient,
    execute_job,
    remove_stale_work_directories,
)
from .models import LeaseResponse
from .registry import AdapterRegistry
from .retry import APPLICATION_BACKOFF, Sleep
from .threads import has_abandoned_threads, wait_for_abandoned_threads
from .token import WorkerTokenMissing

LOGGER = logging.getLogger(__name__)
SHUTDOWN_SIGNALS = (signal.SIGTERM, signal.SIGINT)
LEASE_POLL_ERRORS = (
    httpx.HTTPError,
    ValidationError,
    json.JSONDecodeError,
    WorkerTokenMissing,
)
# A worker finishing abandoned inference takes no lease, so it announces itself
# instead to stay visible to the application.
PRESENCE_SECONDS = LEASE_HEARTBEAT_SECONDS


async def run_forever(settings: WorkerSettings, registry: AdapterRegistry) -> None:
    remove_stale_work_directories()
    client = ApplicationClient(settings, registry)
    LOGGER.info(
        "worker started id=%s %s adapters=%s",
        client.worker_id,
        client.hardware_summary,
        ",".join(adapter.manifest.id for adapter in registry.adapters),
    )
    worker = asyncio.current_task()
    stop_requested = False

    def request_stop() -> None:
        nonlocal stop_requested
        if stop_requested or worker is None:
            return
        stop_requested = True
        LOGGER.info("shutdown requested")
        worker.cancel()

    loop = asyncio.get_running_loop()
    for signum in SHUTDOWN_SIGNALS:
        loop.add_signal_handler(signum, request_stop)
    try:
        await poll_forever(client, registry)
    except asyncio.CancelledError:
        if not stop_requested or worker is None:
            raise
        worker.uncancel()
        LOGGER.info("worker stopped")
    finally:
        for signum in SHUTDOWN_SIGNALS:
            loop.remove_signal_handler(signum)
        await client.close()


class LeasingClient(JobClient, Protocol):
    async def lease(self) -> LeaseResponse: ...

    async def announce(self) -> None: ...


async def poll_forever(
    client: LeasingClient,
    registry: AdapterRegistry,
    *,
    sleep: Sleep = asyncio.sleep,
    jitter: Callable[[], float] = random.random,
) -> None:
    consecutive_failures = 0
    while True:
        await _wait_for_abandoned_threads(client)
        try:
            response = await client.lease()
        except LEASE_POLL_ERRORS as error:
            consecutive_failures += 1
            delay = APPLICATION_BACKOFF.delay_seconds(consecutive_failures, jitter())
            LOGGER.warning(
                "lease request failed, retrying in %.1fs: %s", delay, describe_error(error)
            )
            await sleep(delay)
            continue
        if response.lease is None:
            consecutive_failures = 0
            await sleep(response.poll_after_ms / 1000)
            continue
        try:
            await execute_job(client, registry, response.lease)
        except Exception:
            LOGGER.exception("job execution crashed job_id=%s", response.lease.job_id)
            consecutive_failures += 1
            await sleep(APPLICATION_BACKOFF.delay_seconds(consecutive_failures, jitter()))
        else:
            consecutive_failures = 0


async def _wait_for_abandoned_threads(client: LeasingClient) -> None:
    if not has_abandoned_threads():
        return
    waiting = asyncio.ensure_future(wait_for_abandoned_threads())
    try:
        while True:
            try:
                await client.announce()
            except httpx.HTTPError as error:
                LOGGER.warning("presence announcement failed: %s", describe_error(error))
            done, _ = await asyncio.wait([waiting], timeout=PRESENCE_SECONDS)
            if done:
                return
    finally:
        waiting.cancel()
