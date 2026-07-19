# Local transcription

Anysub’s default worker runs WhisperX locally and returns cue-level text plus aligned word timestamps. The application never sends media to a model API.

## First transcription

1. Start Anysub with `docker compose up --build`.
2. Upload an audio or video source.
3. Open the project and choose a model. `Small` is the recommended CPU starting point.
4. Leave **Accurate word alignment** enabled for editing, highlighting, and later karaoke workflows.
5. Choose the spoken language when you know it, or let Whisper detect it.
6. Start transcription and leave the worker running.

The first run for a model downloads its CTranslate2 weights. Accurate alignment then downloads a smaller language-specific alignment model. Both are stored in the Docker-managed `model-cache` volume and survive container rebuilds.

No transcript text is written to worker progress logs. Hugging Face and Pyannote telemetry are disabled. A network connection is needed only to obtain uncached model files; processing uses the local worker.

## Model guide

| Model | Use it for | CPU guidance |
| --- | --- | --- |
| Tiny | Quick drafts and pipeline checks | Fastest, least accurate |
| Base | Short, clear recordings | Light |
| Small | General creator and archive work | Recommended default |
| Medium | Harder audio where accuracy matters | Slow and memory-heavy |
| Large v3 Turbo | Large-model quality with faster inference | GPU recommended |
| Large v3 | Maximum Whisper accuracy | GPU strongly recommended |

Model quality and speed vary by language, recording quality, core count, memory, and media duration. A two-hour film can take a long time on CPU. The durable worker renews its lease throughout model loading and inference, so a slow run is not treated as abandoned.

## Resource controls

The worker defaults to CPU `int8` compute and a conservative batch size of 4. The project form exposes batch size under **Resource controls**. Reduce it if the worker is killed or reports an out-of-memory error. Raising it may improve throughput but also raises peak memory use.

Administrators can set these worker environment variables in a Compose override:

```yaml
services:
  worker:
    environment:
      ANYSUB_DEVICE: cpu
      ANYSUB_COMPUTE_TYPE: int8
```

The worker dependency lock also contains the CUDA 12.8 PyTorch variant. A CUDA image can be built with `ANYSUB_ACCELERATOR=cuda`, but the supported NVIDIA Compose overlay and hardware validation are still roadmap work; the default Compose file intentionally remains CPU-only.

## Inspecting a run

```sh
docker compose ps
docker compose logs -f worker
```

During a run, the project page shows the current stage and progress. On failure it shows the adapter error and allows another run. The worker retries errors marked transient up to the job’s configured attempt limit.

If the project says it is waiting for a speech worker, confirm the worker is running and that its logs list the `whisperx` adapter. If a first model download fails, verify outbound access to Hugging Face and retry the transcription.
