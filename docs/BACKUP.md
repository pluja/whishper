# Backup and restore

Anysub keeps its data in three Docker volumes. The names start with the Compose project name, `anysub`:

| Volume               | Holds                                                       | Back up |
| -------------------- | ----------------------------------------------------------- | ------- |
| `anysub_database`    | Projects, transcripts, cues, accounts, settings and secrets | Always  |
| `anysub_app-data`    | Uploaded media, waveforms, thumbnails and editing proxies   | Always  |
| `anysub_model-cache` | Downloaded speech models                                    | No      |

Back up the database and the media together, from the same moment. A transcript points at its media, and a restored database without the matching media leaves projects that cannot play. The models can be downloaded again, so most people leave them out.

The database also holds the secrets Anysub generated on its first start. A restore brings them back with the data, so sessions and the worker keep working.

## Back up

Stop the stack so the database file is consistent, copy both volumes into `backups/` next to `compose.yaml`, and start it again:

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

Anysub is unavailable while the copy runs. The database is small, so the media decides how long that takes.

Copy `backups/` to another disk or machine, together with your `compose.yaml` and `.env`. A backup on the same disk does not survive the disk.

## Restore

Restoring replaces everything in the two volumes. On a new machine, put `compose.yaml` and `.env` in place and run `docker compose create` first, which creates the empty volumes.

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

Restore with the same Anysub version the backup came from, or a newer one. A newer version migrates the restored database when it starts.

## With Podman

Replace `docker` with `podman` in every command. The volume names are the same.

## Another project name

If you start Anysub with `-p` or `COMPOSE_PROJECT_NAME`, the volumes start with that name instead of `anysub`. List them with:

```sh
docker volume ls --filter label=com.docker.compose.project
```
