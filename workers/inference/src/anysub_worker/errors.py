from __future__ import annotations

import json
import re
from contextlib import suppress
from typing import Any, ClassVar

import httpx

from .models import JobFailure, JobFailureCode, JobLease

MAX_RESPONSE_DETAIL_CHARS = 200
HTML_TAG = re.compile(r"<[^>]*>")


class JobError(RuntimeError):
    """A job failure whose message is safe to show and whose retry policy is explicit."""

    code: ClassVar[JobFailureCode]

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if not hasattr(cls, "code"):
            raise TypeError(f"{cls.__name__} must declare the failure code it reports")

    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


class UnreadableJobError(JobError):
    code = "adapter_unavailable"

    def __init__(self, lease: JobLease) -> None:
        super().__init__(
            "This worker cannot read the job. Update the worker to the version of the "
            "application, then try again.",
            retryable=False,
        )
        self.lease = lease


class LeaseLostError(RuntimeError):
    def __init__(self, job_id: str) -> None:
        super().__init__(f"lease for job {job_id} is no longer active")


def failure_for(error: Exception, fallback_code: JobFailureCode) -> JobFailure:
    if isinstance(error, JobError):
        return JobFailure(code=error.code, message=str(error), retryable=error.retryable)
    if _is_rejected_request(error):
        return JobFailure(code=fallback_code, message=describe_error(error), retryable=False)
    return JobFailure(code=fallback_code, message=describe_error(error), retryable=True)


def _is_rejected_request(error: Exception) -> bool:
    # A conflict is a race with state on the server, so a later attempt can succeed.
    return (
        isinstance(error, httpx.HTTPStatusError)
        and error.response.is_client_error
        and error.response.status_code != httpx.codes.CONFLICT
    )


def describe_error(error: BaseException) -> str:
    if isinstance(error, httpx.HTTPStatusError):
        response = error.response
        status = f"{response.status_code} {response.reason_phrase}".rstrip()
        message = f"{type(error).__name__}: {status}"
        with suppress(httpx.ResponseNotRead):
            detail = _summarize_response_body(response)
            if detail:
                message = f"{message}: {detail}"
        return message
    return f"{type(error).__name__}: {error}" if str(error) else type(error).__name__


def _summarize_response_body(response: httpx.Response) -> str:
    text = response.text
    with suppress(ValueError, RecursionError):
        body = json.loads(text)
        if isinstance(body, dict) and isinstance(body.get("message"), str):
            text = body["message"]
    for line in HTML_TAG.sub(" ", text).splitlines():
        collapsed = " ".join(line.split())
        if collapsed:
            return collapsed[:MAX_RESPONSE_DETAIL_CHARS]
    return ""
