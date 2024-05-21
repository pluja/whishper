# Stand-alone Whisper-X API

This is the stand-alone API that is used by [anysub](#), the new work-in-progress version of [whishper](https://whishper.net).

## Self host

Create a `.env` file, add [the config](#environment-variables) variables and run:

```bash
docker run --name whisperx-api -p 8088:8000 --gpus=all pluja/whisperx-api
```

> Visit http://localhost:8088/docs for the API documentation / UI

### Docker Compose


#### CPU-Only

This is a more lightweight version of the api, which works with CPU only.

```yml
services:
  whisperx-api:
    image: pluja/whisperx-api:cpu
    ports:
      - "8088:8000"
    volumes:
      - ./data/uploads:/app/uploads
      - ./data/whisper_models:/app/wx_models
    environment:
      WHISPER_DEVICE: cpu
```

After running `docker compose up` for the first time, you will need to wait a few minutes for the models to download. You can start using the API when you see the following logs:

```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

> You can visit http://localhost:8088/docs for the API documentation / UI

#### With GPU

Only NVIDIA GPUs available.

```yml
services:
  whisperx-api:
    image: pluja/whisperx-api:latest
    ports:
      - "8088:8000"
    volumes:
      - ./data/uploads:/app/uploads
      - ./data/whisper_models:/app/wx_models
    environment:
      WHISPER_DEVICE: cuda
    deploy:
      resources:
        reservations:
          devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
```

After running `docker compose up` for the first time, you will need to wait a few minutes for the models to download. You can start using the API when you see the following logs:

```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

> You can visit http://localhost:8088/docs for the API documentation / UI

## Environment Variables

```
WHISPER_MODELS=tiny # Comma separated list of models to pre-load
WHISPER_THREADS=8   # Number of threads to run whisperX
WHISPER_DEVICE=cpu  # Device to run (`cpu` or `cuda`). When using `cuda`, `cpu` is also available as an option.
```

## To use diarization model

1. Visit [hf.co/settings/tokens](https://hf.co/settings/tokens) to create your access token, `read` permissions are enough.
2. Create a `.env` file and add it as the value for `WHISPER_HF_TOKEN`
3. Visit [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1) and accept terms.
4. Visit [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0) and accept terms.

### Example `.env` file

```
WHISPER_HF_TOKEN="hf_xxxx"
```

## License

This part of Anysub is licensed under Apache 2.0. You are free to use it as you wish. However, the community and me would be greatly thankful if you contribute your improvements, tweaks and fixes to the software back!