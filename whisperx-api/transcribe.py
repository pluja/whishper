import os
import io
import numpy as np
from fastapi import UploadFile
from fastapi import HTTPException
from backends.wx import WhisperxBackend
from faster_whisper import decode_audio
from typing import Optional
from werkzeug.utils import secure_filename

MAX_FILE_SIZE = 150 * 1024 * 1024  # 150MB


def convert_audio(file: io.BytesIO) -> np.ndarray:
    """Convert the uploaded audio file to the required format."""
    # Decode the audio file to the desired format and sampling rate
    return decode_audio(file, split_stereo=False, sampling_rate=16000)


async def transcribe_from_filename(
    filename: str,
    model_size: str,
    language: Optional[str] = None,
    device: str = "cpu",
    diarize: bool = False,
    speaker_min: Optional[int] = None,
    speaker_max: Optional[int] = None,
) -> dict:
    """Transcribe audio from a file saved on the server."""
    filepath = os.path.join(os.environ.get("UPLOAD_DIR", "/app/uploads"), secure_filename(filename))
    # Check if the file exists
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    audio = convert_audio(filepath)
    return await transcribe_audio(audio, model_size, language, device, diarize, speaker_min, speaker_max)


async def transcribe_file(
    file: UploadFile,
    model_size: str,
    language: Optional[str] = None,
    device: str = "cpu",
    diarize: bool = False,
    speaker_min: Optional[int] = None,
    speaker_max: Optional[int] = None,
) -> dict:
    """Transcribe audio from an uploaded file."""
    contents = await file.read()

    # Check if the file size is within the acceptable limit
    if len(contents) < MAX_FILE_SIZE:
        audio = convert_audio(io.BytesIO(contents))
    else:
        # Save the file temporarily if it's too large
        filename = secure_filename(file.filename)
        temp_path = os.path.join(os.environ.get("UPLOAD_DIR", "/app/uploads"), filename)
        with open(temp_path, "wb") as temp_file:
            temp_file.write(contents)

        # Ensure the file was saved successfully
        if not os.path.isfile(temp_path):
            raise HTTPException(status_code=500, detail="Error saving file")

        audio = convert_audio(temp_path)
        os.remove(temp_path)

    # Transcribe the audio content
    return await transcribe_audio(audio, model_size, language, device, diarize, speaker_min, speaker_max)


async def transcribe_audio(
    audio: np.ndarray,
    model_size: str,
    language: Optional[str] = None,
    device: str = "cpu",
    diarize: bool = False,
    speaker_min: Optional[int] = None,
    speaker_max: Optional[int] = None,
) -> dict:
    """Transcribe the given audio using the Whisper model."""
    # Handle the 'auto' language option
    if language == "auto":
        language = None

    # Initialize the Whisper model with the specified parameters
    model = WhisperxBackend(model_size=model_size, device=device, diarize=diarize)
    # Load the model data
    model.download_model()
    model.load()

    # Transcribe the audio and return the result
    # TODO: No language specified?
    return model.transcribe(audio, silent=True, language=language, speaker_min=speaker_min, speaker_max=speaker_max)
