import pytest
from pydantic import ValidationError

from anysub_worker.models import TranscriptCue, WordToken


def test_cue_rejects_words_outside_its_timing() -> None:
    with pytest.raises(ValidationError, match="contained by its cue"):
        TranscriptCue(
            id="cue-1",
            startUs=1_000,
            endUs=2_000,
            text="Outside",
            words=(WordToken(id="word-1", text="Outside", startUs=900, endUs=1_500),),
        )
