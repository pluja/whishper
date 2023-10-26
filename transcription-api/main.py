from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File
from models import ModelSize, Languages, DeviceType
from transcribe import transcribe_file, transcribe_from_filename
import uvicorn
import os
from enum import Enum
from typing import Annotated
from backends.fasterwhisper import FasterWhisperBackend

app = FastAPI()
    
@app.post("/transcribe/")
async def transcribe_endpoint(file: UploadFile = File(None),
                              filename: str = None,
                              model_size: ModelSize = ModelSize.small, 
                              language: Languages = Languages.auto,
                              device: str = "cpu"):
    
    if device != "cpu" and device != "cuda":
        return {"detail": "Device must be either cpu or cuda"}
    
    print(f"Transcribing with model {model_size.value} on device {device}...")
    if file is not None:
        # if a file is uploaded, use it
        return await transcribe_file(file, model_size.value, language.value, device)
    elif filename is not None:
        # if a filename is provided, use it
        return await transcribe_from_filename(filename, model_size.value, language.value, device)
    else:
        return {"detail": "No file uploaded and no filename provided"}

@app.get("/healthcheck/")
async def healthcheck():
    return {"status": "healthy"}

if __name__ == "__main__":
    load_dotenv()

    # Get model list (comma separated) from environment variable
    model_list = os.environ.get("WHISPER_MODELS", "tiny,base,small")
    model_list = model_list.split(",")
    for model in model_list:
        m = FasterWhisperBackend(model_size=model)
        m.get_model()
    uvicorn.run(app, host="0.0.0.0", port=8000)