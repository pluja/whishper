# Configuration

Anysub needs no configuration. Models, defaults and the upload limit are set in the app, under [Administration](ADMINISTRATION.md).

The settings below are optional and control how the containers run. Put them in a `.env` file next to `compose.yaml`, one `NAME=value` per line. [.env.example](../.env.example) has them all with comments.

To apply a change:

```sh
docker compose up -d
```

## Secrets

Anysub creates its secrets on first start and keeps them in the database, so backups include them. You can set them yourself, but there's rarely a reason to. If you do, put them in a `compose.override.yaml`, since `.env` isn't passed through:

| Variable              | Service        | Notes                                                           |
| --------------------- | -------------- | --------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`  | web            | At least 32 characters. Changing it signs everyone out.         |
| `ANYSUB_WORKER_TOKEN` | web and worker | At least 24 characters. Both services must hold the same value. |

## Network

| Variable          | Default                 | Notes                                   |
| ----------------- | ----------------------- | --------------------------------------- |
| `ANYSUB_PORT`     | `5173`                  | Port published on the host.             |
| `BETTER_AUTH_URL` | `http://localhost:5173` | Set only behind an HTTPS reverse proxy. |
| `ANYSUB_DEV_PORT` | `5174`                  | Port of the development stack only.     |

Failed sign-ins slow down, up to a minute between attempts. Behind a reverse proxy, all requests seem to come from the proxy, so set `ANYSUB_ADDRESS_HEADER=X-Forwarded-For` to tell people apart. Only set it if every request goes through the proxy, because direct requests without the header fail.

Behind an HTTPS proxy, set `BETTER_AUTH_URL` to the HTTPS address. After that, you can only sign in through that address. See [Reverse proxy](INSTALL.md#reverse-proxy).

## Uploads

| Variable                 | Default | Notes                                                  |
| ------------------------ | ------- | ------------------------------------------------------ |
| `ANYSUB_BODY_SIZE_LIMIT` | `64M`   | Per-request limit. Keep above the 32 MiB upload chunk. |

The largest upload is set under **Administration > Storage** (500 GiB by default).

Uploads come in 32 MiB chunks, so if this limit, or your reverse proxy's, is lower, every upload fails. Nginx allows only 1 MiB by default.

## Compose files

| Variable             | Default        | Notes                                                                                                               |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `COMPOSE_FILE`       | `compose.yaml` | Read by Compose itself. `compose.yaml:compose.cuda.yaml` runs the [NVIDIA worker](GPU.md). Separate files with `:`. |
| `ANYSUB_ACCELERATOR` | `cpu`          | Only for [source builds](INSTALL.md#build-from-source) with `compose.build.yaml`: `cuda` builds the NVIDIA worker.  |

## Worker

| Variable             | Default                                                | Notes                                                         |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| `ANYSUB_WORKER_NAME` | `local-worker`, or `local-cuda` with compose.cuda.yaml | Shown in the model picker when several workers are connected. |

Precision is set under **Administration > Transcription**. `ANYSUB_COMPUTE_TYPE` from older versions is ignored.

Models are managed in the app. See [Choosing a model](USER-GUIDE.md#choosing-a-model).

### Set by Compose and the images

You only need these for a custom setup.

| Variable               | Value in Compose                        | Notes                                                                                   |
| ---------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| `ANYSUB_DEVICE`        | `cpu`, or `cuda` with compose.cuda.yaml | Worker device. With `cuda`, the worker refuses to start when it cannot use the GPU.     |
| `ANYSUB_APP_URL`       | `http://web:3000`                       | How the worker reaches the application. The development overlay uses `http://web:5173`. |
| `ANYSUB_DATA_ROOT`     | `/data`                                 | Worker side of the media mount. See [Data root](#data-root).                            |
| `DATA_ROOT`            | `/data`                                 | Application side of the media mount. See [Data root](#data-root).                       |
| `ANYSUB_MODEL_ROOT`    | `/models`                               | Model cache location in the worker.                                                     |
| `ANYSUB_DATABASE_FILE` | `/database/anysub.db`                   | The SQLite database, in the `database` volume.                                          |
| `BODY_SIZE_LIMIT`      | Same as `ANYSUB_BODY_SIZE_LIMIT`        | The name SvelteKit's Node adapter reads.                                                |
| `ADDRESS_HEADER`       | Same as `ANYSUB_ADDRESS_HEADER`         | The name SvelteKit's Node adapter reads. It takes the last address in the header.       |

### Worker defaults

These don't work in `.env`. Set them in a `compose.override.yaml` instead (example below).

| Variable                         | Default                          | Notes                                                                                                                                           |
| -------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANYSUB_WORKER_ID_FILE`          | `/models/.worker-id`             | Where the worker stores its generated ID, so it keeps its identity on restart.                                                                  |
| `ANYSUB_REQUEST_TIMEOUT_SECONDS` | `30`                             | Timeout for requests from the worker to the application.                                                                                        |
| `ANYSUB_CPU_THREADS`             | Every core the container may use | CPU threads for speech recognition. The worker honours a Compose `cpus` limit on its own, so set this only to leave cores free without a limit. |

Put a `compose.override.yaml` next to `compose.yaml`:

```yaml
services:
  worker:
    environment:
      ANYSUB_REQUEST_TIMEOUT_SECONDS: "60"
```

Compose picks it up on its own, unless you pass `-f`. Then add `-f compose.override.yaml` last.

## NVIDIA GPUs

[NVIDIA GPUs](GPU.md) has its own page.

## Storage

Anysub keeps everything in three Docker volumes:

- `database`: projects, transcripts, accounts, settings and secrets.
- `app-data`: media, waveforms and other generated files.
- `model-cache`: downloaded models.

Keep `database` on a local disk. A network share (NFS, SMB) can corrupt it. `app-data` can be on a share.

See [Backup and restore](BACKUP.md).

### Data root

`DATA_ROOT` (web) and `ANYSUB_DATA_ROOT` (worker) must be the same path, with the same storage mounted there. Compose mounts `app-data` at `/data` in both. If you change one, change the other.

## Workers on other machines

Not supported yet. The worker reads media from the shared volume, so it must run on the same machine.
