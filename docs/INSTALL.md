# Install

Anysub runs as four Compose services: PostgreSQL, a one-shot migration job, the web application, and the speech worker. Nothing needs to be installed on the host besides a container engine.

## Requirements

- Linux with Docker Engine and the Compose plugin, or Podman with Docker Compose as its provider.
- Enough disk for your media, plus a few gigabytes for the speech models. The CPU worker image is over 4 GB.
- For GPU transcription, see [NVIDIA GPUs](CONFIGURATION.md#nvidia-gpus).

## Docker

```sh
git clone -b v4 https://github.com/pluja/whishper.git anysub
cd anysub
./scripts/init-env.sh
docker compose up --build
```

`scripts/init-env.sh` copies `.env.example` to `.env` and replaces every `change-this` value with a generated secret. It refuses to overwrite an existing `.env`. Anysub does not start with the placeholder values, because they are published in this repository.

Open `http://localhost:5173` and create the owner account on the setup page. Public sign-up is disabled, so that is the only account.

Add `-d` to run in the background. Follow the logs with `docker compose logs -f`.

The first transcription with a model downloads it into the `model-cache` volume. See the [user guide](USER-GUIDE.md#choosing-a-model).

## Podman

Use rootless Podman with Docker Compose as the provider. On Fedora:

```sh
sudo dnf install podman docker-compose
systemctl --user enable --now podman.socket
export PODMAN_COMPOSE_PROVIDER=/usr/libexec/docker/cli-plugins/docker-compose
./scripts/init-env.sh
podman compose up --build -d
```

Open `http://localhost:5173`. Use `podman compose logs -f` for logs and `podman compose down` to stop the stack while keeping its data. After a reboot, run `podman compose up -d`.

The Compose files use fully qualified image names, so Podman needs no registry configuration. Keep SELinux enabled. The development overlay labels its bind mounts for SELinux. Use Docker Compose as the provider: the Compose files rely on the `!override` tag and on waiting for the migration job to complete, and Docker Compose is the provider they are tested with.

The NVIDIA overlay `compose.cuda.yaml` uses Docker GPU reservations and is meant for Docker Engine. Podman runs the CPU worker.

## Reverse proxy

Anysub does not ship a reverse proxy or manage TLS. To serve it on a hostname:

1. Set `BETTER_AUTH_URL` in `.env` to the exact origin people type in the browser, for example `https://subtitles.example.org`. Compose passes it to the application as `ORIGIN`. Sign-in and uploads reject requests from any other origin, so a wrong value looks like a broken login.
2. Recreate the services with `docker compose up -d`.
3. Configure the proxy to forward to `ANYSUB_PORT` (default `5173`).

Uploads arrive as 32 MiB `PATCH` chunks. The proxy must allow `POST`, `HEAD`, `PATCH`, `DELETE`, and `OPTIONS`, accept request bodies of at least 64 MiB, and stream bodies instead of buffering a whole upload. Nginx rejects bodies over 1 MiB by default, which breaks every upload. A minimal nginx location:

```nginx
location / {
    proxy_pass http://127.0.0.1:5173;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 64m;
    proxy_request_buffering off;
    proxy_read_timeout 300s;
}
```

[CONFIGURATION.md](CONFIGURATION.md#uploads) explains the limits behind these numbers.

## Upgrading

Back up first. Anysub applies database migrations when the stack starts and does not support rolling back after a migration. Restore a backup if you need older data structures. See [Storage](CONFIGURATION.md#storage) for what to back up.

```sh
git pull
docker compose up --build -d
```

The `migrate` service applies pending migrations under a database lock before the web application starts. Model downloads in `model-cache` survive the rebuild.

Compare `.env.example` with your `.env` after an upgrade. New settings have defaults, so an old `.env` keeps working.

## Stopping

Stop the services and keep all data:

```sh
docker compose down
```

## Removing data

Delete every project, upload, account, and cached model:

```sh
docker compose down --volumes
```

This removes the `postgres-data`, `app-data`, and `model-cache` volumes and cannot be undone. Add `--rmi local` to remove the built images as well.

If you also ran the development stack, it keeps separate volumes. See [CONTRIBUTING.md](../CONTRIBUTING.md#development-stack).
