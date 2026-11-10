# Configuration

Anysub needs no configuration to run. The owner chooses models, transcription defaults and the upload limit in the app, under **Administration** in the account menu. [Administration](ADMINISTRATION.md) walks through it.

The settings below are about how the containers run, and all of them are optional. Put the ones you want in a `.env` file next to `compose.yaml`, one `NAME=value` per line. [.env.example](../.env.example) lists them with comments.

Apply a change by recreating the services:

```sh
docker compose up -d
```

With Podman, replace `docker compose` with `podman compose` throughout.

This page is the only place that lists settings. Other documents link here.

## Secrets

Anysub generates its secrets on first start and stores them in its database: a secret that signs session cookies, and a token that authenticates workers. The web service writes the worker token to `/data/.anysub/worker-token` on every start, and the worker reads it from its read-only mount of the same volume. Because the secrets live in the database, a backup and restore keeps them with the data they protect. Losing them only signs everyone out and makes the worker fetch the new token.

Setting a secret yourself is possible but rarely useful. Compose does not forward these, so add them to the services' environment in a `compose.override.yaml`:

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

Anysub slows down repeated failed sign-ins from one client address or for one account, up to one minute between attempts. Behind a reverse proxy, every request comes from the proxy's address, so set `ANYSUB_ADDRESS_HEADER=X-Forwarded-For` to throttle each client on its own. Set it only when every request passes through the proxy: a direct request without the header fails.

Anysub answers on any address it is reached by, such as `localhost`, a LAN IP or a hostname, and blocks cross-site requests with the browser's `Sec-Fetch-Site` and `Origin` headers. Behind an HTTPS reverse proxy, set `BETTER_AUTH_URL` to the HTTPS address so session cookies are marked Secure. Browsers refuse Secure cookies over plain HTTP, so with an HTTPS address set, sign in through that address only. [INSTALL.md](INSTALL.md#reverse-proxy) covers the proxy side.

## Uploads

| Variable                 | Default | Notes                                                  |
| ------------------------ | ------- | ------------------------------------------------------ |
| `ANYSUB_BODY_SIZE_LIMIT` | `64M`   | Per-request limit. Keep above the 32 MiB upload chunk. |

The largest single upload is set under **Administration > Storage**, 500 GiB by default.

Uploads arrive in 32 MiB chunks and resume after an interruption, so a large file over a poor connection is fine. If you shrink `ANYSUB_BODY_SIZE_LIMIT` below 32 MiB, every upload fails.

Your reverse proxy needs matching limits. Nginx defaults to a 1 MiB request body, which rejects chunks long before Anysub sees them.

A declared media type must be `audio/*`, `video/*`, `application/ogg`, or `application/mp4`; anything else is rejected. An upload that declares no type is accepted. Uploads must state their length up front.

## Compose files

| Variable             | Default        | Notes                                                                                                               |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `COMPOSE_FILE`       | `compose.yaml` | Read by Compose itself. `compose.yaml:compose.cuda.yaml` runs the [NVIDIA worker](GPU.md). Separate files with `:`. |
| `ANYSUB_ACCELERATOR` | `cpu`          | Only for [source builds](INSTALL.md#build-from-source) with `compose.build.yaml`: `cuda` builds the NVIDIA worker.  |

## Worker

| Variable             | Default                                                | Notes                                                         |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| `ANYSUB_WORKER_NAME` | `local-worker`, or `local-cuda` with compose.cuda.yaml | Shown in the model picker when several workers are connected. |

Model precision is chosen under **Administration > Transcription**, not here. The worker turns that choice into the weights its device runs: `int8` on a processor and `float16` on a graphics card by default, `int8_float16` on a graphics card for lower memory, and `float32` everywhere for full precision. An `ANYSUB_COMPUTE_TYPE` left over from an older `.env` is ignored.

### Choosing a model

Download models under **Administration > Models**, and pick one per transcription in the interface. Both report each model's size and memory needs against the workers you have connected. `Small` is the recommended starting point on a CPU.

The [user guide](USER-GUIDE.md#choosing-a-model) describes what each model is good at.

### Set by Compose and the images

The Compose files and the images set these, some from the settings above. Change them only for a custom deployment.

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

Compose does not forward these from `.env`, so setting them there has no effect. The worker reads them from its own environment and falls back to the defaults below.

| Variable                         | Default                          | Notes                                                                                                                                           |
| -------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANYSUB_WORKER_ID_FILE`          | `/models/.worker-id`             | Where the worker stores its generated ID, so it keeps its identity on restart.                                                                  |
| `ANYSUB_REQUEST_TIMEOUT_SECONDS` | `30`                             | Timeout for requests from the worker to the application.                                                                                        |
| `ANYSUB_CPU_THREADS`             | Every core the container may use | CPU threads for speech recognition. The worker honours a Compose `cpus` limit on its own, so set this only to leave cores free without a limit. |

To change one, add it to the worker's environment in a `compose.override.yaml` next to `compose.yaml`:

```yaml
services:
  worker:
    environment:
      ANYSUB_REQUEST_TIMEOUT_SECONDS: "60"
```

Compose reads the override automatically when you run it without `-f`. If you pass files explicitly, add `-f compose.override.yaml` as the last one.

## NVIDIA GPUs

[NVIDIA GPUs](GPU.md) has its own page.

## Storage

Anysub keeps everything in Docker-managed volumes, named `anysub_<volume>` under the default project:

- `database`: the SQLite database with projects, transcripts, cues, accounts, and the generated secrets.
- `app-data`: uploaded media, waveforms, and other derived files.
- `model-cache`: downloaded speech models, reused across rebuilds. **Administration > Models** shows how much space is left on it.

Keep the `database` volume on local disk. SQLite relies on file locking that network shares such as NFS and SMB do not provide reliably, and a database on one can be corrupted. Media in `app-data` can live on a share.

Back up the database and media together. [Backup and restore](BACKUP.md) has the commands.

`docker compose down` keeps all three. `docker compose down --volumes` deletes all three, including every project you have created.

### Data root

The application builds the absolute media path it hands to the worker from its own `DATA_ROOT`, and the worker refuses any path that is not inside its own `ANYSUB_DATA_ROOT`. The two values must therefore be the same path string, and both services must mount the same storage there. Compose does this by mounting `app-data` at `/data` in both services, read-write for the application and read-only for the worker. If you change one path, change the other to match.

## Workers on other machines

Not supported yet. The worker reads media through the shared data mount described under [Data root](#data-root), so it has to run on the same host as the application. The job protocol was built with remote workers in mind: media preparation can already download its source and upload derivatives through the API, but transcription still reads the source from the mount.
