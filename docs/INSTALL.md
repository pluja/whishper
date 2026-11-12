# Install

Anysub runs as two containers: the web app and the worker that transcribes. You download one Compose file and start it. There's nothing to configure first.

## Requirements

- Linux on x86-64, with Docker and the Compose plugin, or Podman. ARM (Apple Silicon, Raspberry Pi) isn't supported yet.
- About 6 GB of disk for the images and a first model, plus your media. The NVIDIA worker image alone is about 9 GB.
- 4 GB of free memory for the `Small` model. Larger models need more.
- Optional: an NVIDIA GPU, which is several times faster. See [NVIDIA GPUs](GPU.md).

## Docker

```sh
mkdir anysub && cd anysub
curl -fsSLO https://github.com/pluja/anysub/releases/latest/download/compose.yaml
docker compose up -d
```

The first start downloads the images and sets everything up. There's no `.env` to fill in.

## Create the owner account

Open `http://localhost:5173`, or `http://<server-address>:5173` from another machine. Anysub asks for a setup code. It prints the code in its log, so only someone with access to the server can create the account:

```sh
docker compose logs web
```

Look for this block:

```text
Anysub has no owner account yet. Open Anysub in a browser and enter this setup code:

    K7QM-3RXA-9TWE
```

Enter the code with your name, email and a password. This is the only account: there's no sign-up and no way to add people yet.

## First transcription

Create a project from the library, upload a recording, and choose **Start transcription**. The model downloads on first use. To download it ahead of time, go to **Administration > Local models** in the account menu.

The [user guide](USER-GUIDE.md) covers the rest.

## Podman

Anysub is tested with rootless Podman using Docker Compose. On Fedora:

```sh
sudo dnf install podman docker-compose
systemctl --user enable --now podman.socket
export PODMAN_COMPOSE_PROVIDER=/usr/libexec/docker/cli-plugins/docker-compose
podman compose up -d
```

Use `podman compose` wherever these docs say `docker compose`. After a reboot, run `podman compose up -d` again. SELinux can stay on. The NVIDIA worker needs Docker, so use the CPU worker with Podman.

## Change the port

Anysub listens on port 5173. To use another, create a `.env` file next to `compose.yaml`:

```sh
ANYSUB_PORT=8080
```

Then run `docker compose up -d`. [Configuration](CONFIGURATION.md) lists every setting.

## Reverse proxy

Anysub doesn't include a reverse proxy or HTTPS. To serve it on a domain:

1. Set `BETTER_AUTH_URL` in `.env` to the HTTPS address, for example `https://subtitles.example.org`. After this, you can only sign in through that address, not a LAN address.
2. Recreate the services with `docker compose up -d`.
3. Point the proxy at `ANYSUB_PORT` (default `5173`).

Uploads arrive in 32 MiB chunks. The proxy must allow `POST`, `HEAD`, `PATCH`, `DELETE` and `OPTIONS`, accept 64 MiB request bodies, and not buffer them. For nginx:

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

Also set `ANYSUB_ADDRESS_HEADER=X-Forwarded-For` in `.env`, so failed sign-ins slow down only the person making them. See [Network](CONFIGURATION.md#network).

## Build from source

To build the images yourself, for example to run an unreleased commit:

```sh
git clone https://github.com/pluja/anysub.git
cd anysub
docker compose -f compose.yaml -f compose.build.yaml up --build -d
```

To keep using the source build for every command, add this line to `.env`:

```sh
COMPOSE_FILE=compose.yaml:compose.build.yaml
```

For the NVIDIA worker, use `COMPOSE_FILE=compose.yaml:compose.cuda.yaml:compose.build.yaml` and add `ANYSUB_ACCELERATOR=cuda`. For the remote-only worker, add `ANYSUB_LOCAL_MODELS=false`. Your builds get their own tags, so they never replace a published image.

## Stop and remove

Stop the services and keep all data:

```sh
docker compose down
```

Stop and delete everything, including projects, accounts and models:

```sh
docker compose down --volumes
```

This can't be undone, so [back up](BACKUP.md) first if you might need anything. Add `--rmi all` to remove the images too.
