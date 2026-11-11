# Upgrading

Your `compose.yaml` pins an exact version, for example `ghcr.io/pluja/anysub:4.0.1`, so Anysub only changes when you upgrade. The web and worker images must always be the same version.

## Before you upgrade

1. Read the [changelog](../CHANGELOG.md). Your version is at the top right of **Administration**.
2. [Back up](BACKUP.md). You can't go back to an older version without a backup.

## Upgrade

Next to `compose.yaml`, run:

```sh
curl -fsSLO https://github.com/pluja/anysub/releases/latest/download/compose.yaml
docker compose pull
docker compose up -d
```

With an NVIDIA GPU, download `compose.cuda.yaml` the same way before `docker compose pull`.

This overwrites `compose.yaml`, so keep your changes in `.env` or a [`compose.override.yaml`](CONFIGURATION.md#worker-defaults). You can also edit the image tags by hand instead.

For a specific version, replace `latest/download` with `download/v4.1.0`.

## After the upgrade

Check that both services came up:

```sh
docker compose ps
docker compose logs web worker
```

You can skip versions. Downloaded models are kept.

To free the space used by old images:

```sh
docker image prune
```

## Going back

There's no downgrade. Restore your backup with the old version's `compose.yaml`.

## Automatic updates

The Compose file pins a version on purpose: both images must change together, and you should back up first. If you still want automatic updates, for example with Watchtower, use the tag `4` (every 4.x release) or `4.1` (4.1.x fixes only) on both images, with `-cuda` on the NVIDIA worker.

## Source builds

If you [build from source](INSTALL.md#build-from-source), check out the new release tag and rebuild:

```sh
git fetch --tags
git checkout v4.1.0
docker compose up --build -d
```
