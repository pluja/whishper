import pytest
from fakes import status_error

from anysub_worker.errors import MAX_RESPONSE_DETAIL_CHARS, describe_error


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
