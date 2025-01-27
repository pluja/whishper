import numpy as np
from .backend import Backend, Transcription, Segment
import os, math
from tqdm import tqdm  # type: ignore
import uuid
from faster_whisper import WhisperModel, download_model
import whisperx

class WhisperxBackend(Backend):
    device: str = "cuda"  # cpu, cuda
    quantization: str = "float16"  # int8, float16
    batch_size: int = 25
    model: WhisperModel | None = None

    def __init__(self, model_size, device: str = "cuda"):
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
        print(f"Loading model: {self.model_path()}, {self.device}, {self.quantization}")
        self.model = whisperx.load_model(
            self.model_path(), device=self.device, compute_type=self.quantization
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

    
    # Splits a line based on commas or word gaps
    def _split_lineIfNeeded(words, max_splits=12):
        # If there are no words or we have no more splits left, return an empty list
        if not words or max_splits <= 0:
            return [{'words': words}]
        
        # If the length of the words is less or equal to n, return the words as they are.
        if len(words) <= 12:
            return [{'words': words}]

        # Find the index of the comma closest to the middle of the line
        middle = len(words) // 2
        comma_indices = [i for i, word in enumerate(words[:-1]) if ',' in word['word']]
        closest_comma_index = min(comma_indices, key=lambda idx: abs(middle - idx), default=None)

        # If there's no comma, find the largest gap among the 20% of words around the center
        if closest_comma_index is None:
            window_start = max(0, middle - len(words) // 5)
            window_end = min(len(words), middle + len(words) // 5)
            max_gap_size = 0
            for i in range(window_start, window_end - 1):
                gap_size = words[i + 1]['start'] - words[i]['end']
                if gap_size > max_gap_size:
                    max_gap_size = gap_size
                    closest_comma_index = i

        # If there's still no suitable split point (no comma and no gap found), split at the middle
        if closest_comma_index is None:
            closest_comma_index = middle

        # Splitting the line at the closest comma or the largest gap
        left_part = words[:closest_comma_index + 1]
        right_part = words[closest_comma_index + 1:]

        # Recursively check if the split parts need further splitting
        split_left_part = WhisperxBackend._split_lineIfNeeded(words=left_part, max_splits=max_splits-1)
        split_right_part = WhisperxBackend._split_lineIfNeeded(words=right_part, max_splits=max_splits-1)

        return split_left_part + split_right_part

    def transcribe(
        self, input: np.ndarray, silent: bool = False, language: str = None
    ) -> Transcription:
        """
        Return word level transcription data.
        World level probabities are calculated by ctranslate2.models.Whisper.align
        """
        print("Transcribing with WhisperX...")
        
        assert self.model is not None
        result = self.model.transcribe(
            input,
            language=language,
        )

        language_code = result["language"]
        print(f"Language code: {language_code}")

        model_align, metadata = whisperx.load_align_model(language_code=language_code, device="cuda")
        result = whisperx.align(result['segments'], model_align, metadata, input, "cuda", return_char_alignments=False)

        all_file_words = []

        #write result_segments to file
        with open("/var/log/whishper/segments.json", "w") as f:
            f.write(str(result))

        for segment in result['segments']:
            for word in segment['words']:
                all_file_words.append(word)

        srt_output = []
        line_buffer = []

        for i, word in enumerate(all_file_words):
            if word.get('start') and word.get('end') is not None:
                word['start'] = round(word['start'], 3)
                word['end'] = round(word['end'], 3)
            else:
                #work backwards to find the start time. this isn't really accurate.
                word['start'] = round(all_file_words[i - 1]['end'] + 0.01, 3) if i > 0 else 0
                word['end'] = round(all_file_words[i - 1]['end'] + 0.01, 3) if i > 0 else 0

        # Post-process to adjust 'end' properties
        for i in range(len(all_file_words) - 1):
            word = all_file_words[i]
            next_word = all_file_words[i + 1]

            # Adjust 'end' considering the 'start' of the next word
            if not ('end' in word):
                word['end'] = round(next_word['start'] - 0.001, 3)
            word['end'] = max(word['end'], round(word['start'] + 0.5, 3))  # Ensure minimum duration
            word['end'] = min(word['end'], round(next_word['start'] - 0.001, 3))  # Ensure not overlapping with next word


        for word in all_file_words:
            line_buffer.append(word)
            
            if word['word'].endswith(('.', '?', '!')):  # Check for sentence-ending punctuation
                if len(line_buffer) > 12:
                    srt_output.extend(WhisperxBackend._split_lineIfNeeded(words=line_buffer, max_splits=12))
                else:
                    srt_output.append({'words': line_buffer})
                line_buffer = []

        # If there are words left in the buffer after the loop, treat as a line
        if line_buffer:
            srt_output.extend(WhisperxBackend._split_lineIfNeeded(words=line_buffer, max_splits=3))

        result_segments = []

        # Store the segments
        for index, line in enumerate(srt_output):
            if len(line['words']) == 0:
                continue
            id = uuid.uuid4().hex
            start = line['words'][0]['start']
            end = line['words'][-1]['end']
            text = " ".join([word['word'] for word in line['words']])
            #score = sum([word['score'] for word in line['words']]) / len(line['words'])
            score = 0
            segment_extract: Segment = {
                "id": id,
                "text": text,
                "start": start,
                "end": end,
                "score": score,
                "words": line['words'],
            }
            result_segments.append(segment_extract)
        
        text = " ".join([segment["text"] for segment in result_segments])
        text = ' '.join(text.strip().split())
        #get duration from last segment
        duration = result_segments[-1]["end"]

        transcription: Transcription = {
            "text": text,
            "language": language_code,
            "duration": duration,
            "segments": result_segments,
        }
        return transcription