from __future__ import annotations

from collections.abc import Awaitable, Callable

MICROSECONDS_PER_SECOND = 1_000_000

Sleep = Callable[[float], Awaitable[None]]


def seconds_to_us(seconds: float) -> int:
    return round(seconds * MICROSECONDS_PER_SECOND)


def us_to_seconds(microseconds: int) -> float:
    return microseconds / MICROSECONDS_PER_SECOND
