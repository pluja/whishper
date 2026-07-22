import pytest
from pydantic import ValidationError

from anysub_worker.models import MediaProbeArtifact, MediaRational, TranscriptCue, WordToken


def test_cue_rejects_words_outside_its_timing() -> None:
    with pytest.raises(ValidationError, match="contained by its cue"):
        TranscriptCue(
            id="cue-1",
            startUs=1_000,
            endUs=2_000,
            text="Outside",
            words=(WordToken(id="word-1", text="Outside", startUs=900, endUs=1_500),),
        )


def test_media_probe_rejects_an_invalid_frame_rate() -> None:
    with pytest.raises(ValidationError):
        MediaRational(numerator=24, denominator=0)


def test_media_probe_keeps_integer_microsecond_duration() -> None:
    probe = MediaProbeArtifact(
        durationUs=16_214_000,
        formatNames=("mov", "mp4"),
        seekable=True,
        frameRateMode="constant",
        proxyRecommended=False,
        proxyReasons=(),
        streams=(),
    )

    assert probe.duration_us == 16_214_000
    assert probe.model_dump(by_alias=True)["durationUs"] == 16_214_000
