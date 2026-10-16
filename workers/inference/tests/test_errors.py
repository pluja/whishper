import pytest
from fakes import status_error

from anysub_worker.adapter import AdapterExecutionError
from anysub_worker.errors import MAX_RESPONSE_DETAIL_CHARS, JobError, describe_error, failure_for
from anysub_worker.media.errors import MediaPreparationError
from anysub_worker.models import JobFailure
from anysub_worker.registry import AdapterLoadError


@pytest.mark.parametrize(
    ("body", "expected_detail"),
    [
        ('{"message": "artifact too large", "code": 1}', "artifact too large"),
        ("<html><body><h1>Bad Gateway</h1>\n<p>nginx</p></body></html>", "Bad Gateway"),
        ("\n\n  first line  \nsecond", "first line"),
        ("x" * 1000, "x" * MAX_RESPONSE_DETAIL_CHARS),
    ],
)
def test_http_status_errors_never_expose_urls(body: str, expected_detail: str) -> None:
    message = describe_error(status_error(502, body))

    assert message == f"HTTPStatusError: 502 Bad Gateway: {expected_detail}"
    assert "app.test" not in message
    assert "mozilla" not in message


@pytest.mark.parametrize("body", ["9" * 5000, "[" * 100_000])
def test_pathological_json_bodies_do_not_break_error_description(body: str) -> None:
    assert describe_error(status_error(500, body)).startswith("HTTPStatusError: 500 ")


def test_status_without_a_reason_phrase_has_no_trailing_space() -> None:
    assert describe_error(status_error(599, "")) == "HTTPStatusError: 599"


@pytest.mark.parametrize(
    ("error", "message", "retryable"),
    [
        (RuntimeError("disk full"), "RuntimeError: disk full", True),
        (TimeoutError(), "TimeoutError", True),
        (status_error(503, "busy"), "HTTPStatusError: 503 Service Unavailable: busy", True),
        (status_error(422, ""), "HTTPStatusError: 422 Unprocessable Entity", False),
        (status_error(409, "stale"), "HTTPStatusError: 409 Conflict: stale", True),
    ],
)
def test_unexpected_failures_are_described_with_their_type(
    error: Exception, message: str, retryable: bool
) -> None:
    failure = failure_for(error, "media_preparation_error")

    assert failure == JobFailure(
        code="media_preparation_error", message=message, retryable=retryable
    )


@pytest.mark.parametrize(
    ("error", "code", "retryable"),
    [
        (AdapterExecutionError("out of memory", retryable=False), "adapter_error", False),
        (MediaPreparationError("no streams", retryable=True), "media_preparation_error", True),
        (AdapterLoadError("adapter is not installed: x"), "adapter_unavailable", False),
    ],
)
def test_job_errors_report_their_own_code_and_retry_policy(
    error: JobError, code: str, retryable: bool
) -> None:
    assert failure_for(error, "adapter_error") == JobFailure.model_validate(
        {"code": code, "message": str(error), "retryable": retryable}
    )


def test_a_job_error_without_a_failure_code_is_rejected_when_defined() -> None:
    with pytest.raises(TypeError, match="UncodedError must declare"):

        class UncodedError(JobError):
            pass
