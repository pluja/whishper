from __future__ import annotations

import asyncio
import json
import logging
import random
import signal
from collections.abc import Callable

import httpx
from pydantic import ValidationError

from .client import ApplicationClient
from .config import WorkerSettings
from .errors import describe_error
from .execution import execute_job
from .registry import AdapterRegistry
from .retry import APPLICATION_BACKOFF, Sleep
from .threads import wait_for_abandoned_threads

LOGGER = logging.getLogger(__name__)
SHUTDOWN_SIGNALS = (signal.SIGTERM, signal.SIGINT)
LEASE_POLL_ERRORS = (httpx.HTTPError, ValidationError, json.JSONDecodeError)


async def run_forever(settings: WorkerSettings, registry: AdapterRegistry) -> None:
    client = ApplicationClient(settings, registry)
    LOGGER.info(
        "worker started id=%s adapters=%s",
        client.worker_id,
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


async def poll_forever(
    client: ApplicationClient,
    registry: AdapterRegistry,
    *,
    sleep: Sleep = asyncio.sleep,
    jitter: Callable[[], float] = random.random,
) -> None:
    consecutive_failures = 0
    while True:
        await wait_for_abandoned_threads()
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
