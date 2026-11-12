from __future__ import annotations

from importlib import import_module

from anysub_worker.adapter import AdapterExecutionError
from anysub_worker.transcripts.line_length import (
    clean_subtitle_text,
    enforce_max_line_length,
    sorted_timed_words,
    words_within,
)
from anysub_worker.transcripts.segments import WhisperSegment


def split_subtitle_segments(
    segments: list[WhisperSegment],
    *,
    language: str,
    max_line_length: int,
) -> list[WhisperSegment]:
    try:
        processor_module = import_module("whisperx.SubtitlesProcessor")
    except ImportError as cause:
        raise AdapterExecutionError(
            "This WhisperX installation does not provide subtitle segmentation.",
            retryable=False,
        ) from cause

    processor_segments = [_copy_segment(segment) for segment in segments]
    processed = processor_module.SubtitlesProcessor(
        processor_segments,
        lang=language,
        max_line_length=max_line_length,
    ).process_segments(advanced_splitting=True)
    timed_words = sorted_timed_words(
        [word for segment in processor_segments for word in segment.get("words", [])]
    )
    word_starts = [timed.start for timed in timed_words]

    output: list[WhisperSegment] = []
    for subtitle in processed:
        start = float(subtitle["start"])
        end = max(start, float(subtitle["end"]))
        output.extend(
            enforce_max_line_length(
                start,
                end,
                clean_subtitle_text(str(subtitle.get("text") or ""), language),
                words_within(timed_words, word_starts, start, end),
                language=language,
                max_line_length=max_line_length,
            )
        )
    return output


def _copy_segment(source: WhisperSegment) -> WhisperSegment:
    # The processor splits the text only when a segment has no "words" key at all.
    segment = source.copy()
    words = segment.pop("words", None)
    if words:
        segment["words"] = [word.copy() for word in words]
    return segment
