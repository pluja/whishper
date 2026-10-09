import httpx
import pytest
from support import status_error

from anysub_worker import runner
from anysub_worker.models import JobFailure


@pytest.mark.parametrize(
    ("error", "message", "retryable"),
    [
        (RuntimeError("disk full"), "RuntimeError: disk full", True),
        (TimeoutError(), "TimeoutError", True),
        (status_error(503, "busy"), "HTTPStatusError: 503 Service Unavailable: busy", True),
        (
            status_error(422, ""),
            f"HTTPStatusError: 422 {httpx.codes.UNPROCESSABLE_ENTITY.phrase}",
            False,
        ),
        (status_error(409, "stale"), "HTTPStatusError: 409 Conflict: stale", True),
    ],
)
def test_unexpected_failures_are_described_with_their_type(
    error: Exception, message: str, retryable: bool
) -> None:
    failure = runner._failure_for(error, "media_prepare")

    assert failure == JobFailure(
        code="media_preparation_error", message=message, retryable=retryable
    )


@pytest.mark.parametrize(
    ("body", "expected_detail"),
    [
        ('{"message": "artifact too large", "code": 1}', "artifact too large"),
        ("<html><body><h1>Bad Gateway</h1>\n<p>nginx</p></body></html>", "Bad Gateway"),
        ("\n\n  first line  \nsecond", "first line"),
        ("x" * 1000, "x" * runner.MAX_RESPONSE_DETAIL_CHARS),
    ],
)
def test_http_status_errors_never_expose_urls(body: str, expected_detail: str) -> None:
    message = runner.describe_error(status_error(502, body))

    assert message == f"HTTPStatusError: 502 Bad Gateway: {expected_detail}"
    assert "app.test" not in message
    assert "mozilla" not in message


@pytest.mark.parametrize("body", ["9" * 5000, "[" * 100_000])
def test_pathological_json_bodies_do_not_break_error_description(body: str) -> None:
    assert runner.describe_error(status_error(500, body)).startswith("HTTPStatusError: 500 ")
