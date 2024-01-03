import numpy as np
from .backend import Backend, Transcription, Segment
import os, math
from tqdm import tqdm  # type: ignore
import uuid
from faster_whisper import WhisperModel, download_model, decode_audio

class FasterWhisperBackend(Backend):
    device: str = "cpu"  # cpu, cuda
    quantization: str = "int8"  # int8, float16
    model: WhisperModel | None = None

    def __init__(self, model_size, device: str = "cpu"):
        self.model_size = model_size
        self.device = device
        self.__post_init__()

    def model_path(self) -> str:
        local_model_path = os.path.join(
            os.environ["WHISPER_MODELS_DIR"], f"faster-whisper-{self.model_size}"
        )

        if os.path.exists(local_model_path):
            return local_model_path
        else:
            raise RuntimeError(f"model not found in {local_model_path}")
        
    def load(self) -> None:
        # Get CPU threads env variable or default to 4
        cpu_threads = int(os.environ.get("CPU_THREADS", 4))
        self.model = WhisperModel(
            self.model_path(), device=self.device, compute_type=self.quantization, cpu_threads=cpu_threads
        )

    def get_model(self) -> None:
        print(f"Downloading model {self.model_size}...")
        local_model_path = os.path.join(os.environ["WHISPER_MODELS_DIR"], f"faster-whisper-{self.model_size}")
        local_model_cache = os.path.join(os.environ["WHISPER_MODELS_DIR"], f"faster-whisper-{self.model_size}", "cache")
        # Check if directory exists
        if not os.path.exists(local_model_path):
            os.makedirs(local_model_path)
        try:
            download_model(self.model_size, output_dir=local_model_path, local_files_only=True, cache_dir=local_model_cache)
            print("Model already cached...")
        except:
            download_model(self.model_size, output_dir=local_model_path, local_files_only=False, cache_dir=local_model_cache)

    def transcribe(
        self, input: np.ndarray, silent: bool = False, language: str = None
    ) -> Transcription:
        """
        Return word level transcription data.
        World level probabities are calculated by ctranslate2.models.Whisper.align
        """
        result: list[Segment] = []
        assert self.model is not None
        segments, info = self.model.transcribe(
            input,
            beam_size=5,
            word_timestamps=True,
            language=language,
        )
        # ps = playback seconds
        with tqdm(
            total=info.duration, unit_scale=True, unit="ps", disable=silent
        ) as pbar:
            for segment in segments:
                if segment.words is None:
                    continue
                id = uuid.uuid4().hex
                segment_extract: Segment = {
                    "id": id,
                    "text": segment.text,
                    "start": segment.start,
                    "end": segment.end,
                    "score": round(math.exp(segment.avg_logprob), 2),
                    "words": [
                        {
                            "start": w.start,
                            "end": w.end,
                            "word": w.word,
                            "score": round(w.probability, 2),
                        }
                        for w in segment.words
                    ],
                }
                result.append(segment_extract)
                if not silent:
                    pbar.update(segment.end - pbar.last_print_n)
        
        text = " ".join([segment["text"] for segment in result])
        text = ' '.join(text.strip().split())
        transcription: Transcription = {
            "text": text,
            "language": info.language,
            "duration": info.duration,
            "segments": result,
        }
        return transcription