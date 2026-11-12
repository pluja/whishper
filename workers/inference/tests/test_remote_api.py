import json
from pathlib import Path

import httpx
import pytest
from pydantic import SecretStr

from anysub_worker.models import RemoteModelAccess
from anysub_worker.remote import api as remote_api
from anysub_worker.remote.api import REQUEST_ATTEMPTS, RemoteTranscriptionError, SpeechApi

ACCESS = RemoteModelAccess(
    providerName="Groq",
    baseUrl="https://api.groq.test/openai/v1/",
    apiKey=SecretStr("sk-secret-value"),
    model="whisper-large-v3",
)
VERBOSE = {
    "text": "Hello there.",
    "language": "english",
    "duration": 1.5,
    "segments": [{"id": 0, "start": 0.0, "end": 1.5, "text": " Hello there."}],
    "words": [
        {"word": "Hello", "start": 0.0, "end": 0.6},
        {"word": "there.", "start": 0.7, "end": 1.4},
    ],
}


class Sleeps:
    def __init__(self) -> None:
        self.delays: list[float] = []

    async def __call__(self, delay: float) -> None:
        self.delays.append(delay)


def api_with(
    handler: httpx.MockTransport, access: RemoteModelAccess = ACCESS
) -> tuple[SpeechApi, Sleeps]:
    sleeps = Sleeps()
    return SpeechApi(access, httpx.AsyncClient(transport=handler), sleeps), sleeps


@pytest.fixture
def audio(tmp_path: Path) -> Path:
    path = tmp_path / "part-0000.mp3"
    path.write_bytes(b"mp3 bytes")
    return path


def form_fields(request: httpx.Request) -> dict[str, list[str]]:
    body = request.read().decode("latin-1")
    fields: dict[str, list[str]] = {}
    for part in body.split("--" + request.headers["content-type"].split("boundary=")[1]):
        if 'name="' not in part or "filename=" in part:
            continue
        name = part.split('name="')[1].split('"')[0]
        value = part.split("\r\n\r\n", 1)[1].rsplit("\r\n", 1)[0]
        fields.setdefault(name, []).append(value)
    return fields


async def test_requests_word_and_segment_timing_with_the_api_key(audio: Path) -> None:
    seen: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=VERBOSE)

    api, _ = api_with(httpx.MockTransport(respond))

    transcript = await api.transcribe(audio, "en")

    request = seen[0]
    assert str(request.url) == "https://api.groq.test/openai/v1/audio/transcriptions"
    assert request.headers["authorization"] == "Bearer sk-secret-value"
    fields = form_fields(request)
    assert fields["model"] == ["whisper-large-v3"]
    assert fields["response_format"] == ["verbose_json"]
    assert fields["timestamp_granularities[]"] == ["segment", "word"]
    assert fields["language"] == ["en"]
    assert [word.word for word in transcript.words] == ["Hello", "there."]
    assert transcript.segments[0].end == 1.5


async def test_sends_no_authorization_without_a_key(audio: Path) -> None:
    seen: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=VERBOSE)

    keyless = ACCESS.model_copy(update={"api_key": None})
    api, _ = api_with(httpx.MockTransport(respond), keyless)

    await api.transcribe(audio, None)

    assert "authorization" not in seen[0].headers
    assert "language" not in form_fields(seen[0])


async def test_rejected_key_fails_for_good_without_echoing_it(audio: Path) -> None:
    api, _ = api_with(
        httpx.MockTransport(
            lambda request: httpx.Response(
                401, json={"error": {"message": "Invalid API Key", "type": "invalid_request"}}
            )
        )
    )

    with pytest.raises(RemoteTranscriptionError) as raised:
        await api.transcribe(audio, None)

    assert raised.value.retryable is False
    assert "rejected the API key (Invalid API Key)" in str(raised.value)
    assert "sk-secret-value" not in str(raised.value)


async def test_rate_limit_waits_as_the_provider_asks(audio: Path) -> None:
    responses = iter(
        [
            httpx.Response(429, headers={"retry-after": "7"}, json={"error": {"message": "slow"}}),
            httpx.Response(200, json=VERBOSE),
        ]
    )
    api, sleeps = api_with(httpx.MockTransport(lambda request: next(responses)))

    transcript = await api.transcribe(audio, None)

    assert sleeps.delays == [7.0]
    assert transcript.text == "Hello there."


async def test_server_errors_give_up_after_the_attempt_limit(audio: Path) -> None:
    calls = 0

    def respond(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(503, text="<html>Service Unavailable</html>")

    api, sleeps = api_with(httpx.MockTransport(respond))

    with pytest.raises(RemoteTranscriptionError) as raised:
        await api.transcribe(audio, None)

    assert calls == REQUEST_ATTEMPTS
    assert len(sleeps.delays) == REQUEST_ATTEMPTS - 1
    assert raised.value.retryable is False
    assert "HTTP 503" in str(raised.value)


async def test_network_errors_are_retried_then_reported(audio: Path) -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    api, sleeps = api_with(httpx.MockTransport(respond))

    with pytest.raises(RemoteTranscriptionError, match="Could not reach Groq") as raised:
        await api.transcribe(audio, None)

    assert len(sleeps.delays) == REQUEST_ATTEMPTS - 1
    assert raised.value.retryable is False


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(
            400,
            json={
                "error": {
                    "message": "response_format 'verbose_json' is not compatible with "
                    "model 'gpt-4o-transcribe'."
                }
            },
        ),
        httpx.Response(200, json={"text": "Words without any timing."}),
    ],
)
async def test_models_without_timestamps_are_explained(
    audio: Path, response: httpx.Response
) -> None:
    api, _ = api_with(httpx.MockTransport(lambda request: response))

    with pytest.raises(RemoteTranscriptionError, match="does not return timestamps") as raised:
        await api.transcribe(audio, None)

    assert raised.value.retryable is False


async def test_unknown_model_names_the_model(audio: Path) -> None:
    api, _ = api_with(
        httpx.MockTransport(
            lambda request: httpx.Response(404, json={"error": {"message": "model not found"}})
        )
    )

    with pytest.raises(RemoteTranscriptionError, match="no model named whisper-large-v3"):
        await api.transcribe(audio, None)


async def test_unreadable_response_points_at_the_base_url(audio: Path) -> None:
    api, _ = api_with(
        httpx.MockTransport(lambda request: httpx.Response(200, text="<html>login</html>"))
    )

    with pytest.raises(RemoteTranscriptionError, match="did not answer with JSON") as raised:
        await api.transcribe(audio, None)

    assert raised.value.retryable is False


async def test_silent_audio_returns_an_empty_transcript(audio: Path) -> None:
    api, _ = api_with(
        httpx.MockTransport(
            lambda request: httpx.Response(200, content=json.dumps({"text": "", "segments": []}))
        )
    )

    transcript = await api.transcribe(audio, None)

    assert transcript.segments == []


async def test_retry_after_zero_retries_at_once(audio: Path) -> None:
    responses = iter(
        [
            httpx.Response(429, headers={"retry-after": "0"}),
            httpx.Response(200, json=VERBOSE),
        ]
    )
    api, sleeps = api_with(httpx.MockTransport(lambda request: next(responses)))

    await api.transcribe(audio, None)

    assert sleeps.delays == [0.0]


async def test_a_read_timeout_is_not_sent_again(audio: Path) -> None:
    calls = 0

    def respond(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ReadTimeout("timed out", request=request)

    api, _ = api_with(httpx.MockTransport(respond))

    with pytest.raises(
        RemoteTranscriptionError, match="did not answer within 10 minutes"
    ) as raised:
        await api.transcribe(audio, None)

    assert calls == 1
    assert raised.value.retryable is False


async def test_an_echoed_key_is_hidden_from_the_message(audio: Path) -> None:
    api, _ = api_with(
        httpx.MockTransport(
            lambda request: httpx.Response(
                400, json={"error": {"message": "Unknown key sk-secret-value for this route"}}
            )
        )
    )

    with pytest.raises(RemoteTranscriptionError) as raised:
        await api.transcribe(audio, None)

    assert "sk-secret-value" not in str(raised.value)
    assert "[API key]" in str(raised.value)


def test_the_key_never_shows_in_a_printed_lease() -> None:
    assert "sk-secret-value" not in repr(ACCESS)


async def test_reads_a_transcript_with_null_lists_and_string_numbers(audio: Path) -> None:
    body = {
        "duration": "30.0",
        "language": "en",
        "text": " Station is the international part of it.",
        "segments": [
            {
                "id": 0,
                "start": 0.0,
                "end": 2.5,
                "text": " Station is the international part of it.",
                "no_speech_prob": None,
            }
        ],
        "words": None,
    }
    api, _ = api_with(httpx.MockTransport(lambda request: httpx.Response(200, json=body)))

    transcript = await api.transcribe(audio, None)

    assert transcript.duration == 30.0
    assert transcript.words == []
    assert transcript.segments[0].end == 2.5


async def test_an_unexpected_transcript_names_the_field(audio: Path) -> None:
    body = {"text": "Hi", "segments": [{"start": "soon", "end": 1, "text": "Hi"}]}
    api, _ = api_with(httpx.MockTransport(lambda request: httpx.Response(200, json=body)))

    with pytest.raises(RemoteTranscriptionError, match=r"segments\.0\.start") as raised:
        await api.transcribe(audio, None)

    assert raised.value.retryable is False


async def test_an_oversized_answer_is_not_read_whole(
    audio: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(remote_api, "MAX_RESPONSE_BYTES", 1024)
    api, _ = api_with(httpx.MockTransport(lambda request: httpx.Response(200, content=b"x" * 4096)))

    with pytest.raises(RemoteTranscriptionError, match="which is not a transcript"):
        await api.transcribe(audio, None)


async def test_infinite_timestamps_are_refused(audio: Path) -> None:
    body = '{"text": "Hi", "segments": [{"start": 0, "end": Infinity, "text": "Hi"}]}'
    api, _ = api_with(
        httpx.MockTransport(lambda request: httpx.Response(200, content=body.encode()))
    )

    with pytest.raises(RemoteTranscriptionError, match=r"segments\.0\.end"):
        await api.transcribe(audio, None)
