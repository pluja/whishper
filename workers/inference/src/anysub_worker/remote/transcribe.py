from __future__ import annotations

import asyncio
from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx

from ..adapter import ProgressReporter, require_shared_media
from ..config import AdapterRuntimeSettings
from ..media.probe import normalize_probe, probe_source
from ..models import (
    REMOTE_ADAPTER_ID,
    RemoteModelAccess,
    TranscriptArtifact,
    TranscriptionRequest,
)
from ..options import MAX_LINE_LENGTH
from ..progress import progress_span
from ..retry import Sleep
from ..timing import us_to_seconds
from ..transcripts.line_length import (
    UNSPACED_LANGUAGES,
    TimedWord,
    clean_subtitle_text,
    enforce_max_line_length,
    join_tokens,
    sorted_timed_words,
    words_within,
)
from ..transcripts.normalize import normalize_segments
from ..transcripts.segments import WhisperSegment, WhisperWord
from ..workspace import WORK_DIRECTORY_PREFIX
from .api import ApiSegment, SpeechApi, VerboseTranscript
from .audio import AudioChunk, prepare_audio_chunks
from .languages import language_code

# Enough parallel requests to finish long media quickly without tripping the
# request rate limits of a typical account.
PARALLEL_REQUESTS = 3
AUDIO_SPAN = (0.0, 0.1)
REQUEST_SPAN = (0.1, 0.95)
UNDETERMINED_LANGUAGE = "und"


async def transcribe_remotely(
    request: TranscriptionRequest,
    access: RemoteModelAccess,
    report: ProgressReporter,
    *,
    runtime: AdapterRuntimeSettings | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
    sleep: Sleep = asyncio.sleep,
) -> TranscriptArtifact:
    settings = runtime if runtime is not None else AdapterRuntimeSettings()
    source = require_shared_media(request.media_path, settings.data_root)
    max_line_length = MAX_LINE_LENGTH.parse(request.options)

    await report(0.0, "Reading the source media")
    probe = normalize_probe(await probe_source(source))
    duration_us = probe.duration_us
    with TemporaryDirectory(prefix=WORK_DIRECTORY_PREFIX) as temporary:
        chunks = await prepare_audio_chunks(
            source,
            duration_us,
            probe.start_us or 0,
            Path(temporary),
            progress_span(report, *AUDIO_SPAN),
        )
        async with httpx.AsyncClient(transport=transport) as client:
            api = SpeechApi(access, client, sleep)
            transcripts = await _transcribe_chunks(
                api, chunks, request.language, progress_span(report, *REQUEST_SPAN)
            )

    await report(REQUEST_SPAN[1], "Building subtitle cues")
    language = request.language or _detected_language(transcripts)
    segments = merge_chunk_transcripts(chunks, transcripts, language, max_line_length)
    return normalize_segments(
        segments,
        language=language,
        duration_us=duration_us,
        metadata={
            "adapter": REMOTE_ADAPTER_ID,
            "provider": access.provider_name,
            "model": access.model,
            "wordTiming": any(transcript.words for transcript in transcripts),
            "parts": len(chunks),
            "maxLineLength": max_line_length,
        },
    )


async def _transcribe_chunks(
    api: SpeechApi,
    chunks: list[AudioChunk],
    language: str | None,
    report: ProgressReporter,
) -> list[VerboseTranscript]:
    limit = asyncio.Semaphore(PARALLEL_REQUESTS)
    # Parts finish together, and their reports must not arrive out of order.
    reporting = asyncio.Lock()
    finished = 0
    total = len(chunks)
    sending = f"Sending audio to {api.access.provider_name}"
    await report(0.0, sending if total == 1 else f"{sending} in {total} parts")

    async def transcribe(chunk: AudioChunk) -> VerboseTranscript:
        nonlocal finished
        async with limit:
            transcript = await api.transcribe(chunk.path, language)
        async with reporting:
            finished += 1
            await report(finished / total, f"Transcribed {finished} of {total} parts")
        return transcript

    # The first failure cancels the other parts. It is raised unwrapped, so the
    # job reports its message and retry policy instead of the ExceptionGroup's.
    try:
        async with asyncio.TaskGroup() as group:
            tasks = [group.create_task(transcribe(chunk)) for chunk in chunks]
    except ExceptionGroup as failures:
        error = failures.exceptions[0]
        raise error from error.__cause__
    return [task.result() for task in tasks]


def merge_chunk_transcripts(
    chunks: list[AudioChunk],
    transcripts: list[VerboseTranscript],
    language: str,
    max_line_length: int,
) -> list[WhisperSegment]:
    """Places each part's segments on the media timeline and splits them into subtitles."""
    output: list[WhisperSegment] = []
    for chunk, transcript in zip(chunks, transcripts, strict=True):
        offset = us_to_seconds(chunk.start_us)
        # A provider may round its last timestamp past the end of the audio it received.
        limit = us_to_seconds(chunk.end_us) if chunk.end_us > chunk.start_us else None
        words = sorted_timed_words(
            [
                _word(word.word, offset + word.start, offset + word.end, limit)
                for word in transcript.words
            ]
        )
        word_starts = [timed.start for timed in words]
        for segment in transcript.segments or _segment_of_all_words(transcript, language):
            start = _bounded(offset + segment.start, limit)
            end = max(start, _bounded(offset + segment.end, limit))
            text = clean_subtitle_text(segment.text, language)
            if not text:
                continue
            segment_words = words_within(words, word_starts, start, end)
            punctuated = with_segment_punctuation(text, segment_words, language)
            if punctuated is None and len(text) > max_line_length:
                # Splitting by bare words would drop the punctuation.
                segment_words = []
            output.extend(
                enforce_max_line_length(
                    start,
                    end,
                    text,
                    punctuated or segment_words,
                    language=language,
                    max_line_length=max_line_length,
                )
            )
    return output


def with_segment_punctuation(
    text: str, words: list[TimedWord], language: str
) -> list[TimedWord] | None:
    """Gives each word its spelling from the segment text, punctuation included.

    Speech APIs list words without punctuation, and a long segment is split
    into subtitles by its words. None means the words do not match the text
    one to one.
    """
    tokens = text.split()
    if (
        not words
        or language in UNSPACED_LANGUAGES
        or len(tokens) != len(words)
        or any(
            _comparable(token) != _comparable(str(timed.word.get("word") or ""))
            for token, timed in zip(tokens, words, strict=True)
        )
    ):
        return None
    return [
        timed._replace(word={**timed.word, "word": token})
        for token, timed in zip(tokens, words, strict=True)
    ]


def _comparable(token: str) -> str:
    return "".join(character for character in token.casefold() if character.isalnum())


# Some servers return word timing without segments. Splitting by line length
# then works from the words alone.
def _segment_of_all_words(transcript: VerboseTranscript, language: str) -> list[ApiSegment]:
    if not transcript.words:
        return []
    return [
        ApiSegment(
            start=transcript.words[0].start,
            end=transcript.words[-1].end,
            text=join_tokens([word.word.strip() for word in transcript.words], language),
        )
    ]


def _word(text: str, start: float, end: float, limit: float | None) -> WhisperWord:
    bounded_start = _bounded(start, limit)
    return {"word": text, "start": bounded_start, "end": max(bounded_start, _bounded(end, limit))}


def _bounded(seconds: float, limit: float | None) -> float:
    seconds = max(0.0, seconds)
    return min(seconds, limit) if limit is not None else seconds


def _detected_language(transcripts: list[VerboseTranscript]) -> str:
    detected = Counter(
        code for transcript in transcripts if (code := language_code(transcript.language))
    )
    return detected.most_common(1)[0][0] if detected else UNDETERMINED_LANGUAGE
