# Install

Anysub runs as two containers: the web application, which keeps its data in an SQLite database, and the worker, which transcribes. You download one Compose file and start it. Nothing needs configuring first.

## Requirements

- A Linux host on x86-64 with Docker Engine and the Compose plugin, or Podman with Docker Compose as its provider. ARM computers, including Apple Silicon Macs and the Raspberry Pi, are not supported yet.
- About 6 GB of disk for the images and a first model, plus room for your media. The CPU worker image is about 3 GB, and the NVIDIA one about 9 GB.
- 4 GB of free memory for the `Small` model, the usual choice on a CPU. Larger models need more. The model picker shows each one's estimate against your hardware.
- Optional: an NVIDIA GPU, which transcribes several times faster. See [NVIDIA GPUs](GPU.md).

## Docker

```sh
mkdir anysub && cd anysub
curl -fsSLO https://github.com/pluja/anysub/releases/latest/download/compose.yaml
docker compose up -d
```

The first start pulls the images, creates the database, and generates the secrets Anysub needs. They live in the database, so there is no `.env` to fill in.

## Create the owner account

Open `http://localhost:5173`, or `http://<server-address>:5173` from another machine. Anysub asks for a setup code, which it prints in its log so that only someone with access to the server can claim it:

```sh
docker compose logs web
```

Look for this block:

```text
Anysub has no owner account yet. Open Anysub in a browser and enter this setup code:

    K7QM-3RXA-9TWE
```

Enter the code with your name, email address and a password. A restart prints a new code until the owner exists. The owner is the only account: there is no public sign-up and no way to add people yet.

## First transcription

Open **Administration** from the account menu, then **Models**, and download the model marked **Recommended**. It is the one Anysub picks for your hardware. Downloading ahead is optional: a model that is not downloaded yet downloads on its first transcription.

Then create a project from the library, upload a recording, and choose **Start transcription**. The [user guide](USER-GUIDE.md) follows a file from upload to export.

## Podman

Use rootless Podman with Docker Compose as the provider. On Fedora:

```sh
sudo dnf install podman docker-compose
systemctl --user enable --now podman.socket
export PODMAN_COMPOSE_PROVIDER=/usr/libexec/docker/cli-plugins/docker-compose
podman compose up -d
```

Use `podman compose` wherever these docs say `docker compose`. After a reboot, run `podman compose up -d` again.

The Compose file names images in full, so Podman needs no registry configuration. Keep SELinux enabled. The NVIDIA overlay uses Docker GPU reservations and is meant for Docker Engine; under Podman, run the CPU worker.

## Change the port

Anysub listens on port 5173. To use another, create a `.env` file next to `compose.yaml`:

```sh
ANYSUB_PORT=8080
```

Then run `docker compose up -d`. [Configuration](CONFIGURATION.md) lists every setting `.env` can hold.

## Reverse proxy

Anysub does not ship a reverse proxy or manage TLS. To serve it on a hostname:

1. Set `BETTER_AUTH_URL` in `.env` to the HTTPS address people type, for example `https://subtitles.example.org`. Anysub then marks session cookies Secure. Browsers refuse Secure cookies over plain HTTP, so after this change sign in through the HTTPS address only, not a LAN address.
2. Recreate the services with `docker compose up -d`.
3. Point the proxy at `ANYSUB_PORT` (default `5173`).

Anysub needs no list of allowed hostnames. It answers on whatever address the browser used and blocks cross-site requests with the browser's `Sec-Fetch-Site` and `Origin` headers.

Uploads arrive as `PATCH` requests in 32 MiB chunks. The proxy must allow `POST`, `HEAD`, `PATCH`, `DELETE`, and `OPTIONS`, accept a 64 MiB request body, and stream bodies instead of buffering a whole upload. A minimal nginx location:

```nginx
location / {
    proxy_pass http://127.0.0.1:5173;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 64m;
    proxy_request_buffering off;
    proxy_read_timeout 300s;
}
```

Caddy needs no extra settings:

```caddyfile
subtitles.example.org {
    reverse_proxy 127.0.0.1:5173
}
```

With `X-Forwarded-For` forwarded, set `ANYSUB_ADDRESS_HEADER=X-Forwarded-For` in `.env` so sign-in throttling tells clients apart. See [Network](CONFIGURATION.md#network).

## Build from source

The published images are built by the [release workflow](../.github/workflows/release.yml) from the tagged source. To build them yourself, for example to run an unreleased commit:

```sh
git clone https://github.com/pluja/anysub.git
cd anysub
docker compose -f compose.yaml -f compose.build.yaml up --build -d
```

To keep using the source build for every command, add this line to `.env`:

```sh
COMPOSE_FILE=compose.yaml:compose.build.yaml
```

For the NVIDIA worker, use `COMPOSE_FILE=compose.yaml:compose.cuda.yaml:compose.build.yaml` and add `ANYSUB_ACCELERATOR=cuda`. Source builds are tagged `anysub-web:source` and `anysub-worker:source-cpu` or `source-cuda`, so they never replace a published image.

## Stop and remove

Stop the services and keep all data:

```sh
docker compose down
```

Delete every project, upload, account and downloaded model:

```sh
docker compose down --volumes
```

This removes the `database`, `app-data`, and `model-cache` volumes and cannot be undone. [Back up](BACKUP.md) first if you might want any of it. Add `--rmi all` to remove the images as well.

## Next steps

- [Upgrading](UPGRADING.md) to a new version.
- [Backup and restore](BACKUP.md).
- [Configuration](CONFIGURATION.md) for every setting.
- [Coming from Whishper 3](MIGRATING-FROM-WHISHPER.md).
