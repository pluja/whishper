# Local transcription

Anysub’s default worker runs WhisperX locally and returns cue-level text plus aligned word timestamps. The application never sends media to a model API.

## First transcription

1. Start Anysub with `docker compose up --build`.
2. Upload an audio or video source.
3. Open the project and choose a model. The picker compares model size, memory estimates, and fit against connected workers. `Small` is the recommended CPU starting point.
4. Leave **Accurate word alignment** enabled for editing, highlighting, and later karaoke workflows.
5. Under **Advanced options**, adjust the maximum line length if the 42-character default does not suit the intended platform.
6. Choose the spoken language when you know it, or let Whisper detect it.
7. Start transcription and leave the worker running.

The first run for a model downloads its CTranslate2 weights. Accurate alignment then downloads a smaller language-specific alignment model. Both are stored in the Docker-managed `model-cache` volume and survive container rebuilds.

No transcript text is written to worker progress logs. Hugging Face and Pyannote telemetry are disabled. A network connection is needed only to obtain uncached model files; processing uses the local worker.

## Model guide

| Model          | Use it for                                | Hardware guidance                   |
| -------------- | ----------------------------------------- | ----------------------------------- |
| Tiny           | Quick drafts and pipeline checks          | Fastest, least accurate             |
| Base           | Short, clear recordings                   | Light                               |
| Small          | General creator and archive work          | Recommended CPU default             |
| Medium         | Harder audio where accuracy matters       | Slow and memory-heavy               |
| Large v3 Turbo | Large-model quality with faster inference | Default when it fits the usable GPU |
| Large v3       | Maximum Whisper accuracy                  | GPU strongly recommended            |

The model picker labels each option **Recommended**, **Runs well**, **May be slow**, **Not recommended**, or **Not checked**. Each compact row shows the model's purpose, approximate memory requirement, and a download icon beside its name: green when the files are cached and gray when they still need downloading. Large v3 Turbo reports its approximately 3 GB FP16 VRAM requirement rather than its separate CPU RAM recommendation. When Large v3 Turbo fits a connected CUDA worker, Anysub marks and selects it as **Recommended** by default; otherwise `Small` remains the CPU starting point.

The setup form shows the worker's detected CPU or usable CUDA GPU, logical core count, and currently available memory below the picker. Anysub uses the same reported hardware to make model recommendations. A worker configured for CPU remains a CPU worker even if its host also has an integrated GPU; only accelerators usable by the worker are counted.

Model quality and speed vary by language, recording quality, core count, memory, and media duration. A two-hour film can take a long time on CPU. The durable worker renews its lease throughout model loading and inference, so a slow run is not treated as abandoned.

## Subtitle segmentation

After transcription and optional word alignment, Anysub uses WhisperX's language-aware subtitle processor to split long model segments at nearby natural boundaries. The default maximum line length is 42 characters and can be set from 20 to 120 for each run. Whole words remain intact, so a single token longer than the selected limit is the only case where a cue may exceed it. WhisperX applies shorter limits to scripts that are generally denser on screen, including Chinese, Japanese, Korean, Arabic, and several South Asian scripts.

This setting shapes newly generated cues; it does not modify the media. Quality profiles will later add line count, reading speed, duration, gap, overlap, and platform-specific presets on top of this first control.

Deleting a transcript removes its cues and the source run, including the worker job result and retry history. It leaves the project's source media intact. Deleting the whole project also removes its application-managed media directory.

## Advanced options

The worker defaults to CPU `int8` compute and a conservative batch size of 4. The project form exposes batch size under **Advanced options**. Reduce it if the worker is killed or reports an out-of-memory error. Raising it may improve throughput but also raises peak memory use.

Administrators can set these worker environment variables in a Compose override:

```yaml
services:
  worker:
    environment:
      ANYSUB_DEVICE: cpu
      ANYSUB_COMPUTE_TYPE: int8
```

The worker dependency lock also contains the CUDA 12.8 PyTorch variant. A CUDA image can be built with `ANYSUB_ACCELERATOR=cuda`, but the supported NVIDIA Compose overlay and hardware validation are still roadmap work; the default Compose file intentionally remains CPU-only.

The development Compose override also synchronizes the `speech` and `cpu` extras before starting the worker. This repairs existing `worker-venv` volumes created before those dependencies were included. After changing worker dependencies, rebuild and recreate the development worker with:

```sh
docker compose -f compose.yaml -f compose.dev.yaml up -d --build worker
```

## Inspecting a run

```sh
docker compose ps
docker compose logs -f worker
```

During a run, the project page shows the current stage and progress. On failure it shows the adapter error and allows another run. The worker retries errors marked transient up to the job’s configured attempt limit.

If the project says it is waiting for a speech worker, confirm the worker is running and that its logs list the `whisperx` adapter. If a first model download fails, verify outbound access to Hugging Face and retry the transcription.
