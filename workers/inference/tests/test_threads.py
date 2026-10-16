import asyncio
import logging
import threading

import pytest

from anysub_worker import threads


async def test_waiting_for_abandoned_threads_keeps_reporting_until_they_finish(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(threads, "ABANDONED_WAIT_LOG_SECONDS", 0.01)
    started = threading.Event()
    release = threading.Event()

    def blocking_inference() -> None:
        started.set()
        release.wait(timeout=5)

    task = asyncio.create_task(threads.run_in_thread(blocking_inference))
    await asyncio.to_thread(started.wait, 5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    caplog.set_level(logging.INFO, logger=threads.__name__)
    waiting = asyncio.create_task(threads.wait_for_abandoned_threads())
    async with asyncio.timeout(5):
        while caplog.text.count("still waiting for 1 abandoned") < 2:
            await asyncio.sleep(0.01)
    release.set()
    await asyncio.wait_for(waiting, timeout=5)

    assert "abandoned inference finished" in caplog.text
