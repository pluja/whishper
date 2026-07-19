from __future__ import annotations

import asyncio

from anysub_worker.adapter import ProgressReporter
from anysub_worker.models import (
    AdapterCapability,
    AdapterManifest,
    AdapterModel,
    TranscriptArtifact,
    TranscriptCue,
    TranscriptionRequest,
    WordToken,
)


class FakeAdapter:
    """Small deterministic adapter used by development and CI."""

    @property
    def manifest(self) -> AdapterManifest:
        return AdapterManifest(
            id="builtin.fake",
            displayName="Deterministic test adapter",
            version="0.1.0",
            description="Produces a fixed transcript without loading a model.",
            models=(
                AdapterModel(
                    id="fake-v1",
                    displayName="Fake model",
                    capabilities=(AdapterCapability.TRANSCRIBE,),
                    languages="all",
                    optionsSchema={
                        "type": "object",
                        "properties": {
                            "delayMs": {"type": "integer", "minimum": 0, "maximum": 2000}
                        },
                        "additionalProperties": False,
                    },
                ),
            ),
        )

    async def transcribe(
        self, request: TranscriptionRequest, report_progress: ProgressReporter
    ) -> TranscriptArtifact:
        delay_seconds = int(request.options.get("delayMs", 20)) / 1000
        await report_progress(0.1, "Preparing deterministic transcript")
        await asyncio.sleep(delay_seconds)
        await report_progress(0.6, "Normalizing word timestamps")
        await asyncio.sleep(delay_seconds)

        words = (
            WordToken(id="word-1", text="Private", startUs=0, endUs=480_000, confidence=1),
            WordToken(
                id="word-2",
                text="subtitles,",
                startUs=500_000,
                endUs=1_100_000,
                confidence=1,
            ),
            WordToken(id="word-3", text="on", startUs=1_180_000, endUs=1_360_000, confidence=1),
            WordToken(id="word-4", text="your", startUs=1_400_000, endUs=1_650_000, confidence=1),
            WordToken(
                id="word-5",
                text="machine.",
                startUs=1_700_000,
                endUs=2_200_000,
                confidence=1,
            ),
        )
        artifact = TranscriptArtifact(
            language=request.language or "en",
            durationUs=2_500_000,
            cues=(
                TranscriptCue(
                    id="cue-1",
                    startUs=0,
                    endUs=2_300_000,
                    text="Private subtitles, on your machine.",
                    words=words,
                ),
            ),
            metadata={"deterministic": True},
        )
        await report_progress(1, "Transcript ready")
        return artifact
