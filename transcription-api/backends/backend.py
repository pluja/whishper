
from typing import Any, Mapping, TypedDict
import numpy as np
from faster_whisper.audio import decode_audio  # type: ignore

SUPPORTED_MODELS = ["tiny", "tiny.en", "small", "small.en", "base", "base.en", "medium", "medium.en", "large-v2", "large-v3"]

WordData = TypedDict(
    "WordData", {"word": str, "start": float | str, "end": float | str, "score": float}
)

Segment = TypedDict(
    "Segment",
    {
        "id": str,
        "text": str,
        "start": float | str,
        "end": float | str,
        "score": float,
        "words": list[WordData],
    },
)

Transcription = TypedDict(
    "Transcription",
    {   
        "text": str,
        "language": str,
        "duration": float,
        "segments": list[Segment],
    },
)

class Backend:
    name: str = "faster-whisper"
    model_size: str

    def __post_init__(self):
        if self.model_size not in self.supported_model_sizes():
            raise ValueError(f"model must be one of {self.supported_model_sizes()}")

    def supported_backends(self):
        """
        This is of not much use as of the moment, If we ever support multiple
        backends this can be utilized.
        """
        return ["faster-whisper"]

    def model_path(self) -> str:
        """
        Returns the local path to the model, error-out if unavailable
        """
        raise NotImplementedError()

    def supported_model_sizes(self) -> list[str]:
        return SUPPORTED_MODELS
    
    def download_model(self):
        raise NotImplementedError()

    def load(self):
        raise NotImplementedError()

    def transcribe(self, input: np.ndarray) -> list[Segment]:
        """
        This should return word level transcription data.
        """
        raise NotImplementedError()