# Configuration

Anysub reads its settings from `.env` in the repository root. Run `scripts/init-env.sh` once to generate that file with unique secrets, then edit the values below to suit your machine.

Apply a change by recreating the services:

```sh
docker compose up -d
```

After switching between CPU and GPU, add `--build` so Compose builds the matching worker image. With Podman, replace `docker compose` with `podman compose` throughout.

This page is the only place that lists settings. Other documents link here.

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
| `BETTER_AUTH_URL` | `http://localhost:5173` | Set only behind an HTTPS reverse proxy. |
| `ANYSUB_DEV_PORT` | `5174`                  | Port of the development stack only.     |

Anysub slows down repeated failed sign-ins from one client address or for one account, up to one minute between attempts. Behind a reverse proxy, every request comes from the proxy's address, so set `ANYSUB_ADDRESS_HEADER=X-Forwarded-For` to throttle each client on its own. Set it only when every request passes through the proxy: a direct request without the header fails.

Anysub answers on any address it is reached by, such as `localhost`, a LAN IP or a hostname, and blocks cross-site requests with the browser's `Sec-Fetch-Site` and `Origin` headers. Behind an HTTPS reverse proxy, set `BETTER_AUTH_URL` to the HTTPS address so session cookies are marked Secure. Browsers refuse Secure cookies over plain HTTP, so with an HTTPS address set, sign in through that address only. [INSTALL.md](INSTALL.md#reverse-proxy) covers the proxy side.

## Uploads

| Variable                  | Default | Notes                                                  |
| ------------------------- | ------- | ------------------------------------------------------ |
| `ANYSUB_MAX_UPLOAD_BYTES` | 500 GiB | Largest single upload.                                 |
| `ANYSUB_BODY_SIZE_LIMIT`  | `64M`   | Per-request limit. Keep above the 32 MiB upload chunk. |

Uploads arrive in 32 MiB chunks and resume after an interruption, so a large file over a poor connection is fine. If you shrink `ANYSUB_BODY_SIZE_LIMIT` below 32 MiB, every upload fails.

Your reverse proxy needs matching limits. Nginx defaults to a 1 MiB request body, which rejects chunks long before Anysub sees them.

A declared media type must be `audio/*`, `video/*`, `application/ogg`, or `application/mp4`; anything else is rejected. An upload that declares no type is accepted. Uploads must state their length up front.

## Worker

| Variable              | Default                                                | Notes                                                         |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| `ANYSUB_COMPUTE_TYPE` | `int8`, or `float16` with compose.cuda.yaml            | Model precision. See below.                                   |
| `ANYSUB_WORKER_NAME`  | `local-worker`, or `local-cuda` with compose.cuda.yaml | Shown in the model picker when several workers are connected. |

These arrive commented out in `.env`. Each mode already picks a working default, and a value set here applies to every mode, so uncomment one only when you want to override it.

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

The [user guide](USER-GUIDE.md#choosing-a-model) describes what each model is good at.

### Set by Compose

`compose.yaml` derives these from the settings above. Change them only for a custom deployment.

| Variable             | Value in Compose                        | Notes                                                                                   |
| -------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| `ANYSUB_ACCELERATOR` | `cpu`, or `cuda` with compose.cuda.yaml | Build argument that selects the PyTorch wheels in the worker image.                     |
| `ANYSUB_DEVICE`      | Same as `ANYSUB_ACCELERATOR`            | Worker device. With `cuda`, the worker refuses to start when it cannot use the GPU.     |
| `ANYSUB_APP_URL`     | `http://web:3000`                       | How the worker reaches the application. The development overlay uses `http://web:5173`. |
| `ANYSUB_DATA_ROOT`   | `/data`                                 | Worker side of the media mount. See [Data root](#data-root).                            |
| `DATA_ROOT`          | `/data`                                 | Application side of the media mount. See [Data root](#data-root).                       |
| `ANYSUB_MODEL_ROOT`  | `/models`                               | Model cache location in the worker.                                                     |
| `DATABASE_URL`       | Built from the `POSTGRES_*` values      | Connection string for the application and the migration job.                            |
| `BODY_SIZE_LIMIT`    | Same as `ANYSUB_BODY_SIZE_LIMIT`        | The name SvelteKit's Node adapter reads.                                                |
| `ADDRESS_HEADER`     | Same as `ANYSUB_ADDRESS_HEADER`         | The name SvelteKit's Node adapter reads. It takes the last address in the header.       |

### Worker defaults

Compose does not forward these from `.env`, so setting them there has no effect. The worker reads them from its own environment and falls back to the defaults below.

| Variable                         | Default              | Notes                                                                          |
| -------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| `ANYSUB_WORKER_ID_FILE`          | `/models/.worker-id` | Where the worker stores its generated ID, so it keeps its identity on restart. |
| `ANYSUB_REQUEST_TIMEOUT_SECONDS` | `30`                 | Timeout for requests from the worker to the application.                       |

To change one, add it to the worker's environment in a `compose.override.yaml` next to `compose.yaml`:

```yaml
services:
  worker:
    environment:
      ANYSUB_REQUEST_TIMEOUT_SECONDS: "60"
```

Compose reads the override automatically when you run it without `-f`. If you pass files explicitly, add `-f compose.override.yaml` as the last one.

## NVIDIA GPUs

An NVIDIA GPU transcribes several times faster than a CPU. Support is written but not yet verified on real hardware, so treat this section as a path to try rather than a guarantee. Please report what happens.

You need:

- A card of the Volta generation or newer (compute capability 7.0 and up), such as a GTX 16xx, an RTX 20xx to 50xx, or a data-center card from the V100 on. Pascal and older cards, including the GTX 10xx series, cannot run the CUDA image. Use the CPU on those.
- The [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) on the host, and a driver recent enough for CUDA 12.8.

Confirm Docker can reach the GPU before changing anything:

```sh
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi
```

If that prints your card, add this line to `.env` so every `docker compose` command includes the NVIDIA overlay, then rebuild:

```sh
COMPOSE_FILE=compose.yaml:compose.cuda.yaml
```

```sh
docker compose up --build -d
```

The overlay switches the worker to CUDA, picks `float16`, grants access to every GPU on the host, and names the image `anysub-worker-cuda` so a CPU build never replaces it. The first build downloads the CUDA PyTorch wheels, which are several gigabytes larger than the CPU ones. Expect a long build and a worker image around 10 GB.

Check that the worker found the card:

```sh
docker compose logs worker | grep "worker started"
```

The line shows `device=cuda` and the card's name. When the worker cannot use the GPU, it stops at startup and logs why: the image was built for CPU, the container cannot see a GPU, or the card is too old for the image. The model picker also reports detected hardware.

### When the GPU path fails

**The worker starts but transcription falls back or errors on model load.** CTranslate2 loads cuBLAS and cuDNN at runtime. They ship as PyTorch dependencies inside the virtual environment instead of on the system loader path, so the CUDA image build registers their directories with `ldconfig` and fails if it cannot find them. If the error mentions `libcudnn` or `libcublas`, check that the running image resolves them:

```sh
docker compose exec worker ldconfig -p | grep -E 'libcudnn|libcublas'
```

No output means the image was built for CPU. Check the `COMPOSE_FILE` line in `.env` and rebuild with `--build`.

**Out of memory.** Choose a smaller model, or set `ANYSUB_COMPUTE_TYPE=int8_float16` to cut VRAM use.

**`could not select device driver`.** The NVIDIA Container Toolkit is missing or the Docker daemon has not picked it up. Restart Docker after installing it.

To go back to CPU, remove the `COMPOSE_FILE` line from `.env` and run `docker compose up --build -d`.

## AMD GPUs

Not supported. The dependency stack targets CUDA, and the worker reports a ROCm backend only where PyTorch already exposes one. Treat AMD acceleration as future work.

## Storage

Anysub keeps everything in Docker-managed volumes, named `anysub_<volume>` under the default project:

- `app-data`: uploaded media, waveforms, and other derived files.
- `postgres-data`: projects, transcripts, cues, and accounts.
- `model-cache`: downloaded speech models, reused across rebuilds.

Media and the database have to be backed up together. A transcript in PostgreSQL without its media is not much use, and the reverse is worse.

`docker compose down` keeps all three. `docker compose down --volumes` deletes all three, including every project you have created.

### Data root

The application builds the absolute media path it hands to the worker from its own `DATA_ROOT`, and the worker refuses any path that is not inside its own `ANYSUB_DATA_ROOT`. The two values must therefore be the same path string, and both services must mount the same storage there. Compose does this by mounting `app-data` at `/data` in both services, read-write for the application and read-only for the worker. If you change one path, change the other to match.

## Workers on other machines

Not supported yet. The worker reads media through the shared data mount described under [Data root](#data-root), so it has to run on the same host as the application. The job protocol was built with remote workers in mind and the artifact upload path already goes through the API, but the media path has not moved to downloads yet.
