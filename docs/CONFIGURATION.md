# Configuration

Anysub reads its settings from `.env` in the repository root. Run `scripts/init-env.sh` once to generate that file with unique secrets, then edit the values below to suit your machine.

Apply a change by recreating the services:

```sh
docker compose up -d
```

Changing `ANYSUB_ACCELERATOR` also rebuilds the worker image, so add `--build` for that one.

## Secrets

Anysub refuses to start when any of these is missing or still holds a placeholder from `.env.example`.

| Variable              | Purpose                                                                        |
| --------------------- | ------------------------------------------------------------------------------ |
| `POSTGRES_PASSWORD`   | Database password. Read once at first start, when the volume is created.       |
| `BETTER_AUTH_SECRET`  | Signs session cookies. At least 32 characters. Rotating it signs everyone out. |
| `ANYSUB_WORKER_TOKEN` | Authenticates workers against the job API. At least 24 characters.             |

`POSTGRES_DB` and `POSTGRES_USER` default to `anysub` and only matter at first start.

## Network

| Variable          | Default                 | Notes                                   |
| ----------------- | ----------------------- | --------------------------------------- |
| `ANYSUB_PORT`     | `5173`                  | Port published on the host.             |
| `BETTER_AUTH_URL` | `http://localhost:5173` | The address people type in the browser. |

Set `BETTER_AUTH_URL` to the public origin when Anysub sits behind a reverse proxy, including a non-default port. Anysub rejects sign-ins and uploads whose origin does not match, so a wrong value here looks like a broken login.

## Uploads

| Variable                  | Default | Notes                                                  |
| ------------------------- | ------- | ------------------------------------------------------ |
| `ANYSUB_MAX_UPLOAD_BYTES` | 500 GiB | Largest single upload.                                 |
| `ANYSUB_BODY_SIZE_LIMIT`  | `64M`   | Per-request limit. Keep above the 32 MiB upload chunk. |

Uploads arrive in 32 MiB chunks and resume after an interruption, so a large file over a poor connection is fine. If you shrink `ANYSUB_BODY_SIZE_LIMIT` below 32 MiB, every upload fails.

Your reverse proxy needs matching limits. Nginx defaults to a 1 MiB request body, which rejects chunks long before Anysub sees them.

## Worker

| Variable              | Default                                     | Notes                                                                                                          |
| --------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ANYSUB_ACCELERATOR`  | `cpu`                                       | `cpu` or `cuda`. Selects the PyTorch wheels compiled into the worker image, and the device the worker runs on. |
| `ANYSUB_COMPUTE_TYPE` | `int8`, or `float16` with compose.cuda.yaml | Model precision. See below.                                                                                    |
| `ANYSUB_WORKER_NAME`  | `local-worker`                              | Shown in the model picker when several workers are connected.                                                  |

These three arrive commented out in `.env`. Each mode already picks a working default, and a value set here applies to every mode, so uncomment one only when you want to override it.

### Choosing a precision

Precision trades accuracy for speed and memory. Anysub passes the value straight to CTranslate2, which fails at model load if the value is not valid for the device.

On CPU:

- `int8` runs fastest and uses the least memory. This is the default and a good choice for almost everyone.
- `int8_float32` costs some speed for slightly better accuracy.
- `float32` is the most accurate and the slowest.

On CUDA:

- `float16` is the right default on any modern NVIDIA card.
- `int8_float16` uses less VRAM, which helps fit a larger model on a smaller card.
- `float32` doubles VRAM use for little gain.

`default` and `auto` are accepted on both devices. `float16` and `int8_float16` need a graphics card, so the worker refuses to start with them on `ANYSUB_DEVICE=cpu`.

If a run fails with a message about an unsupported compute type, your device does not offer that precision. Fall back to `int8` on CPU or `float16` on CUDA.

### Choosing a model

Pick the model per transcription run in the interface, not here. The picker reports each model's size and memory needs against the workers you have connected, and marks the ones already downloaded. `Small` is the recommended starting point on a CPU.

See [TRANSCRIPTION.md](TRANSCRIPTION.md) for what each model is good at.

## NVIDIA GPUs

An NVIDIA GPU transcribes several times faster than a CPU. Support is written but not yet verified on real hardware, so treat this section as a path to try rather than a guarantee. Please report what happens.

You need the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) installed on the host, and a driver recent enough for CUDA 12.8.

Confirm Docker can reach the GPU before changing anything:

```sh
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi
```

If that prints your card, start with the NVIDIA overlay:

```sh
docker compose -f compose.yaml -f compose.cuda.yaml up --build
```

The overlay switches the worker to CUDA, picks `float16`, and grants access to every GPU on the host. No `.env` change is needed. Keep passing both files on later commands, including `docker compose down`, or Compose will fall back to the CPU definition.

The first build downloads the CUDA PyTorch wheels, which are several gigabytes larger than the CPU ones. Expect a long build and a worker image around 10 GB.

Check that the worker found the card:

```sh
docker compose logs worker | grep -i cuda
```

The model picker also reports detected hardware, so a card that registers correctly appears there.

### When the GPU path fails

**The worker starts but transcription falls back or errors on model load.** CTranslate2 loads cuBLAS and cuDNN at runtime. They ship as PyTorch dependencies inside the virtual environment instead of on the system loader path, so the CUDA image build registers their directories with `ldconfig` and fails if it cannot find them. If the error mentions `libcudnn` or `libcublas`, check that the running image resolves them:

```sh
docker compose exec worker ldconfig -p | grep -E 'libcudnn|libcublas'
```

No output means the image was built without `ANYSUB_ACCELERATOR=cuda`. Rebuild with the overlay and `--build`.

**Out of memory.** Choose a smaller model, or set `ANYSUB_COMPUTE_TYPE=int8_float16` to cut VRAM use.

**`could not select device driver`.** The NVIDIA Container Toolkit is missing or the Docker daemon has not picked it up. Restart Docker after installing it.

To go back to CPU, set `ANYSUB_ACCELERATOR=cpu`, drop the overlay, and rebuild.

## AMD GPUs

Not supported. The dependency stack targets CUDA, and the worker reports a ROCm backend only where PyTorch already exposes one. Treat AMD acceleration as future work.

## Storage

Anysub keeps everything in Docker-managed volumes:

- `app-data`: uploaded media, waveforms, and other derived files.
- `postgres-data`: projects, transcripts, cues, and accounts.
- `model-cache`: downloaded speech models, reused across rebuilds.

Media and the database have to be backed up together. A transcript in PostgreSQL without its media is not much use, and the reverse is worse.

`docker compose down` keeps all three. `docker compose down --volumes` deletes all three, including every project you have created.

## Workers on other machines

Not supported yet. The worker reads media through a shared `/data` mount, so it has to run on the same host as the application. The job protocol was built with remote workers in mind and the artifact upload path already goes through the API, but the media path has not moved to downloads yet.
