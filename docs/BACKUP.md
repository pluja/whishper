# Backup and restore

Anysub keeps its data in three Docker volumes:

| Volume               | Holds                                                       | Back up |
| -------------------- | ----------------------------------------------------------- | ------- |
| `anysub_database`    | Projects, transcripts, cues, accounts, settings and secrets | Always  |
| `anysub_app-data`    | Uploaded media, waveforms, thumbnails and editing proxies   | Always  |
| `anysub_model-cache` | Downloaded speech models                                    | No      |

Back up the database and media together, at the same time, or projects may lose their media. Models can be downloaded again.

## Back up

This stops Anysub, copies both volumes into `backups/` next to `compose.yaml`, and starts it again:

```sh
docker compose stop
mkdir -p backups
for volume in database app-data; do
  docker run --rm \
    -v "anysub_$volume:/volume:ro" \
    -v "$PWD/backups:/backup:z" \
    docker.io/library/alpine:3.22 \
    tar -cf "/backup/$volume.tar" -C /volume .
done
docker compose start
```

Then copy `backups/`, `compose.yaml` and `.env` to another disk or machine.

## Restore

This replaces everything in the two volumes. On a new machine, put `compose.yaml` and `.env` in place and run `docker compose create` first.

```sh
docker compose down
for volume in database app-data; do
  docker run --rm \
    -v "anysub_$volume:/volume" \
    -v "$PWD/backups:/backup:ro,z" \
    docker.io/library/alpine:3.22 \
    sh -c "find /volume -mindepth 1 -delete && tar -xf /backup/$volume.tar -C /volume"
done
docker compose up -d
```

Use the same Anysub version as the backup, or a newer one.

## With Podman

Replace `docker` with `podman` in every command. The volume names are the same.

## Another project name

If you set `-p` or `COMPOSE_PROJECT_NAME`, the volume names start with that instead of `anysub`. To list them:

```sh
docker volume ls --filter label=com.docker.compose.project
```
