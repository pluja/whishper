from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

LOGGER = logging.getLogger(__name__)
ABANDONED_WAIT_LOG_SECONDS = 60

# Threads cannot be cancelled, so a cancelled job leaves its inference running and holding
# memory. They are process-wide because every adapter shares the same RAM and VRAM.
_abandoned_calls: set[asyncio.Future[Any]] = set()


async def run_in_thread[Result](
    function: Callable[..., Result],
    *args: Any,
    on_abandoned_exit: Callable[[], None] | None = None,
    **kwargs: Any,
) -> Result:
    call = asyncio.ensure_future(asyncio.to_thread(function, *args, **kwargs))
    try:
        return await asyncio.shield(call)
    except asyncio.CancelledError:
        _abandoned_calls.add(call)
        call.add_done_callback(_forget_abandoned_call)
        if on_abandoned_exit is not None:
            call.add_done_callback(lambda _call: on_abandoned_exit())
        raise


def _forget_abandoned_call(call: asyncio.Future[Any]) -> None:
    _abandoned_calls.discard(call)
    if not call.cancelled():
        call.exception()


def has_abandoned_threads() -> bool:
    return bool(_abandoned_calls)


async def wait_for_abandoned_threads() -> None:
    pending = set(_abandoned_calls)
    if not pending:
        return
    LOGGER.warning(
        "waiting for %d abandoned inference call(s) to finish before taking new work",
        len(pending),
    )
    while True:
        _, pending = await asyncio.wait(pending, timeout=ABANDONED_WAIT_LOG_SECONDS)
        if not pending:
            break
        LOGGER.warning("still waiting for %d abandoned inference call(s)", len(pending))
    LOGGER.info("abandoned inference finished")
