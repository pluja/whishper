import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from starlette.responses import JSONResponse
from classes import ModelSize, Languages
from transcribe import transcribe_file, transcribe_from_filename
import uvicorn
from dotenv import load_dotenv
from backends.wx import WhisperxBackend

app = FastAPI()


@app.post("/transcription/")
async def transcribe_endpoint(
    file: UploadFile = File(None),
    filename: str = None,
    model_size: ModelSize = ModelSize.small,
    language: Languages = Languages.auto,
    device: str = "cpu",
    diarize: bool = False,
):
    # Validate device type
    if device not in ["cpu", "cuda"]:
        raise HTTPException(
            status_code=400, detail="Device must be either 'cpu' or 'cuda'"
        )

    # Transcription process
    if file:
        # Use uploaded file for transcription
        return await transcribe_file(
            file, model_size.value, language.value, device, diarize
        )
    elif filename:
        # Use provided filename for transcription
        return await transcribe_from_filename(
            filename, model_size.value, language.value, device, diarize
        )
    else:
        # No file or filename provided
        raise HTTPException(
            status_code=400, detail="No file uploaded and no filename provided"
        )


@app.get("/healthcheck/")
async def healthcheck():
    # Simple health check endpoint
    return JSONResponse(content={"status": "healthy"})


if __name__ == "__main__":
    load_dotenv()

    print(os.getenv("UPLOAD_DIR"))

    # Preload models specified in the environment variable
    model_list = os.getenv("WHISPER_MODELS", "tiny,base,small").split(",")
    for model in model_list:
        WhisperxBackend(model_size=model).download_model()

    # Start the server
    uvicorn.run(app, host="0.0.0.0", port=8000)
