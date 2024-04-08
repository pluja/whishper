# Stand-alone Whipser-X API

This is the stand-alone API that is used by [anysub](#), the new work-in-progress version of [whishper](https://whishper.net).

## Self host

Create a `.env` file, add [the config](#environment-variables) variables and run:

```bash
docker run --name whisperx-api -p 8088:8000 --gpus=all pluja/whisperx-api
```

> Visit http://localhost:8088/docs for the API documentation

### Docker Compose

```yml
services:
  whisperx-api:
    image: pluja/whisperx-api
    ports:
      - "8088:8000"
    volumes:
      - ./data/uploads:/app/data
      - ./data/whisper_models:/app/wx_models
    environment:
      WHISPER_THREADS: 2
      WHISPER_DEVICE: cpu
    env_file:
      - .env
```

> Visit http://localhost:8088/docs for the API documentation

#### Use with GPU

Only NVIDIA GPUs available.

```yml
services:
  whisperx-api:
    image: pluja/whisperx-api
    ports:
      - "8088:8000"
    volumes:
      - ./data/uploads:/app/data
      - ./data/whisper_models:/app/wx_models
    environment:
      WHISPER_THREADS: 8
      WHISPER_DEVICE: cuda
    env_file:
      - .env
    deploy:
      resources:
        reservations:
          devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
```

> Visit http://localhost:8088/docs for the API documentation

## Environment Variables

```
WHISPER_MODELS=tiny # Comma separated list of models to pre-load
WHISPER_THREADS=8   # Number of threads to run whisperX
WHISPER_DEVICE=cpu  # Device to run (`cpu` or `cuda`)
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