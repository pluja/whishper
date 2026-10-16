import httpx
import pytest
from fakes import RecordedSleeps, network_error, status_error

from anysub_worker.retry import APPLICATION_BACKOFF, Backoff, is_transient, retry


@pytest.mark.parametrize(
    ("failures", "jitter", "expected"),
    [(1, 0.0, 0.5), (1, 1.0, 1), (3, 1.0, 4), (6, 1.0, 30), (500, 1.0, 30), (500, 0.0, 15)],
)
def test_backoff_grows_exponentially_up_to_the_cap(
    failures: int, jitter: float, expected: float
) -> None:
    assert APPLICATION_BACKOFF.delay_seconds(failures, jitter) == expected


def test_backoff_reaches_a_cap_that_is_not_a_power_of_two() -> None:
    backoff = Backoff(base_seconds=0.5, cap_seconds=3)

    assert [backoff.delay_seconds(failures) for failures in range(1, 6)] == [0.5, 1, 2, 3, 3]


@pytest.mark.parametrize(
    ("error", "transient"),
    [
        (network_error(), True),
        (status_error(503, "busy"), True),
        (status_error(400, "invalid"), False),
        (status_error(409, "stale"), False),
        (ValueError("bad"), False),
    ],
)
def test_only_server_and_transport_errors_are_transient(error: Exception, transient: bool) -> None:
    assert is_transient(error) is transient


async def test_retry_stops_at_the_first_success() -> None:
    outcomes: list[Exception | None] = [network_error(), network_error(), None]
    sleeps = RecordedSleeps()

    async def operation() -> str:
        outcome = outcomes.pop(0)
        if outcome is not None:
            raise outcome
        return "done"

    result = await retry(operation, attempts=5, is_retryable=is_transient, sleep=sleeps)

    assert result == "done"
    assert sleeps == [1, 2]


async def test_retry_raises_the_last_error_once_attempts_run_out() -> None:
    calls = 0
    sleeps = RecordedSleeps()
    retried: list[float] = []

    async def operation() -> None:
        nonlocal calls
        calls += 1
        raise network_error()

    with pytest.raises(httpx.ConnectError):
        await retry(
            operation,
            attempts=3,
            is_retryable=is_transient,
            sleep=sleeps,
            on_retry=lambda _error, delay: retried.append(delay),
        )

    assert calls == 3
    assert sleeps == retried == [1, 2]


async def test_retry_raises_permanent_errors_immediately() -> None:
    sleeps = RecordedSleeps()

    async def operation() -> None:
        raise status_error(400, "invalid")

    with pytest.raises(httpx.HTTPStatusError):
        await retry(operation, attempts=3, is_retryable=is_transient, sleep=sleeps)

    assert sleeps == []
