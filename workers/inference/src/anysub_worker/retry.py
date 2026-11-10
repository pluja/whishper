from __future__ import annotations

import math
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import httpx

Sleep = Callable[[float], Awaitable[None]]


@dataclass(frozen=True)
class Backoff:
    base_seconds: float
    cap_seconds: float

    def delay_seconds(self, failures: int, jitter: float = 1.0) -> float:
        """Doubles the delay per consecutive failure up to the cap.

        A jitter between 0 and 1 picks a delay between half and all of it, so workers
        that fail together do not retry in lockstep. The default of 1 is the full delay
        with no jitter.
        """
        doublings_to_cap = math.ceil(math.log2(self.cap_seconds / self.base_seconds))
        doublings = min(failures - 1, doublings_to_cap)
        ceiling = min(self.cap_seconds, self.base_seconds * 2**doublings)
        return ceiling * (0.5 + jitter / 2)


APPLICATION_BACKOFF = Backoff(base_seconds=1, cap_seconds=30)


def is_transient(error: Exception) -> bool:
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.is_server_error
    return isinstance(error, httpx.TransportError)


async def retry[Result](
    operation: Callable[[], Awaitable[Result]],
    *,
    attempts: int,
    is_retryable: Callable[[Exception], bool],
    sleep: Sleep,
    on_retry: Callable[[Exception, float], None] | None = None,
    backoff: Backoff = APPLICATION_BACKOFF,
) -> Result:
    failures = 0
    while True:
        try:
            return await operation()
        except Exception as error:
            failures += 1
            if failures >= attempts or not is_retryable(error):
                raise
            delay = backoff.delay_seconds(failures)
            if on_retry is not None:
                on_retry(error, delay)
            await sleep(delay)
