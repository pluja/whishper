import os
import numpy as np
from typing import List, TypedDict, Optional
from faster_whisper import WhisperModel, download_model
import whisperx

# Constants defining the supported Whisper model sizes for easy reference.
SUPPORTED_MODELS = [
    "tiny",
    "tiny.en",
    "small",
    "small.en",
    "base",
    "base.en",
    "medium",
    "medium.en",
    "large-v2",
    "large-v3",
]

# TypedDicts for structured and clear data representation of word and segment data.
WordData = TypedDict(
    "WordData",
    {"word": str, "start": float, "end": float, "score": float, "speaker": str},
)
Segment = TypedDict(
    "Segment",
    {
        "id": str,
        "text": str,
        "start": float,
        "end": float,
        "score": float,
        "words": List[WordData],
    },
)
Transcription = TypedDict(
    "Transcription",
    {"text": str, "language": str, "duration": float, "segments": List[Segment]},
)


class WhisperxBackend:
    def __init__(self, model_size: str, device: str = "cpu", diarize: bool = False):
        # Initialize the backend with the model size and device type (CPU or GPU).
        self.model_size = model_size
        self.device = device
        self.compute_type = "int8" if device == "cpu" else "float16"
        self._validate_model_size()
        self.model_path = self._get_model_path()
        self.model = None
        self.diarize = False
        if (os.getenv("WHISPER_HF_TOKEN", False) != False) and diarize:
            self.diarize = True
            self.diarize_model = whisperx.DiarizationPipeline(
                use_auth_token=os.getenv("WHISPER_HF_TOKEN"), device=device
            )
        elif (os.getenv("WHISPER_HF_TOKEN", False) == False):
            print("WHISPER_HF_TOKEN variable not set. Diarization will not work!")

    def _validate_model_size(self):
        # Check if the provided model size is within the supported models.
        if self.model_size not in SUPPORTED_MODELS:
            raise ValueError(f"model must be one of {SUPPORTED_MODELS}")

    def _get_model_path(self) -> str:
        # Construct the local model path based on the environment variable or default to current directory.
        return os.path.join(
            os.getenv("WHISPER_MODELS_DIR", "/app/wx_models"), f"faster-whisper-{self.model_size.strip()}"
        )

    def load(self) -> None:
        # Load the Whisper model from the local path into memory.
        self.model = whisperx.load_model(
            self.model_size,
            device=self.device,
            compute_type=self.compute_type,
            asr_options={"suppress_numerals": True},
            threads=int(os.getenv("WHISPER_THREADS", 4)),
        )

    def download_model(self) -> None:
        # Download the Whisper model if it is not found in the cache.
        local_model_cache = os.path.join(self.model_path, "cache")
        os.makedirs(self.model_path, exist_ok=True)
        try:
            download_model(
                self.model_size,
                output_dir=self.model_path,
                local_files_only=True,
                cache_dir=local_model_cache,
            )
        except FileNotFoundError:
            download_model(
                self.model_size,
                output_dir=self.model_path,
                local_files_only=False,
                cache_dir=local_model_cache,
            )

    """Perform transcription on the given audio input using the loaded Whisper model."""

    def transcribe(
        self,
        audio: np.ndarray,
        silent: bool = False,
        language: str = None,
        speaker_min: Optional[int] = None,
        speaker_max: Optional[int] = None,
    ) -> Transcription:
        assert self.model is not None, "Model must be loaded before transcription"

        result = self.model.transcribe(audio, language=language)
        language_code = result["language"]

        # Load the alignment model for the detected language.
        model_align, metadata = whisperx.load_align_model(
            language_code=language_code, device=self.device
        )
        # Align the transcription result with the audio input.
        result = whisperx.align(
            result["segments"],
            model_align,
            metadata,
            audio,
            self.device,
            return_char_alignments=False,
        )

        if self.diarize:
            diarize_segments = self.diarize_model(audio, min_speakers=speaker_min, max_speakers=speaker_max)
            result = whisperx.assign_word_speakers(diarize_segments, result)

        # Flatten the list of words from all segments for further processing.
        all_file_words = [
            word for segment in result["segments"] for word in segment["words"]
        ]

        # Split the transcript into segments based on punctuation and word count.
        srt_output = self._split_transcript(all_file_words)

        # Create the final segments with structured data for the transcription.
        result_segments = self._create_segments(srt_output)

        # Combine the text of all segments to form the complete transcription text.
        text = " ".join(segment["text"] for segment in result_segments).strip()

        # Get the duration of the audio from the last segment's end time.
        duration = result_segments[-1]["end"] if result_segments else 0

        # Return the transcription as a structured dictionary.
        return {
            "text": text,
            "language": language_code,
            "duration": duration,
            "segments": result_segments,
        }

    def _split_transcript(
        self, words: List[WordData], max_splits: int = 12
    ) -> List[Segment]:
        # Divide the transcript into manageable segments for easier reading and processing.
        srt_output = []
        line_buffer = []
        for word in words:
            line_buffer.append(word)
            # Check for sentence-ending punctuation and split if necessary.
            if word["word"].endswith((".", "?", "!")) and len(line_buffer) > max_splits:
                srt_output.extend(self._split_line(line_buffer, max_splits))
                line_buffer = []
        # Handle any remaining words that did not reach a punctuation mark.
        if line_buffer:
            srt_output.extend(self._split_line(line_buffer, max_splits))
        return srt_output

    def _split_line(self, words: List[WordData], max_splits: int) -> List[Segment]:
        # Recursive function to split lines at commas or natural pauses.
        if len(words) <= max_splits:
            return [{"words": words}]
        middle = len(words) // 2
        comma_indices = [i for i, word in enumerate(words[:-1]) if "," in word["word"]]
        closest_comma_index = min(
            comma_indices, key=lambda idx: abs(middle - idx), default=None
        )
        if closest_comma_index is None:
            # If no comma is found, look for the largest gap between words.
            window_start = max(0, middle - len(words) // 5)
            window_end = min(len(words), middle + len(words) // 5)
            max_gap_size = 0
            for i in range(window_start, window_end - 1):
                gap_size = words[i + 1]["start"] - words[i]["end"]
                if gap_size > max_gap_size:
                    max_gap_size = gap_size
                    closest_comma_index = i
        closest_comma_index = closest_comma_index or middle
        # Split the words at the chosen comma or gap.
        left_part = words[: closest_comma_index + 1]
        right_part = words[closest_comma_index + 1 :]
        # Recursively split the left and right parts further if needed.
        return self._split_line(left_part, max_splits - 1) + self._split_line(
            right_part, max_splits - 1
        )

    def _create_segments(self, lines: List[Segment]) -> List[Segment]:
        # Generate the final segments with IDs and combined text for the transcription output.
        return [
            {
                "id": str(index),
                "text": " ".join(word["word"] for word in line["words"]),
                "start": line["words"][0]["start"],
                "end": line["words"][-1]["end"],
                "score": 0,  # Placeholder for future implementation of word confidence scores.
                "words": line["words"],
            }
            for index, line in enumerate(lines)
            if line["words"]
        ]
