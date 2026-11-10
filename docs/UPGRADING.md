# Upgrading

Your `compose.yaml` names an exact version of both images, for example `ghcr.io/pluja/anysub:4.0.0`. Anysub changes only when you change those tags. The web and worker images must always carry the same version.

## Before you upgrade

1. Read the [changelog](../CHANGELOG.md) for every version between yours and the new one. Your version is at the top right of **Administration**.
2. [Back up](BACKUP.md). The web service migrates the database when it starts, and a migrated database cannot be opened by an older version.

## Upgrade

In the directory that holds `compose.yaml`, download the new Compose files over the old ones and restart:

```sh
curl -fsSLO https://github.com/pluja/anysub/releases/latest/download/compose.yaml
docker compose pull
docker compose up -d
```

With an NVIDIA GPU, download `compose.cuda.yaml` the same way before `docker compose pull`.

The download replaces the file, so keep your changes out of it: settings go in `.env`, and anything else in a [`compose.override.yaml`](CONFIGURATION.md#worker-defaults). If you would rather edit the tags by hand, change both image tags in `compose.yaml`, and the worker tag in `compose.cuda.yaml` if you use it.

To install a version other than the latest, replace `latest/download` in the address with `download/v4.1.0`, using the version you want.

## After the upgrade

Check that both services came up:

```sh
docker compose ps
docker compose logs web worker
```

The web service applies pending database migrations before it serves requests. You can skip versions: it applies every migration in order. Downloaded models stay in the `model-cache` volume.

Old images keep their disk space until you remove them:

```sh
docker image prune
```

## Going back

There is no downgrade. To return to an earlier version, restore the backup you took before upgrading, with that version's `compose.yaml`.

## Automatic updates

Tools such as Watchtower update containers that follow a moving tag like `latest`. Anysub's Compose file pins a version on purpose: both images must change together, and an upgrade should start with a backup. If you still want a moving tag, `4` follows every 4.x release and `4.1` every 4.1.x patch. Use the same tag for the web and worker images, with `-cuda` on the worker for NVIDIA.

## Source builds

If you [build from source](INSTALL.md#build-from-source), check out the new release tag and rebuild:

```sh
git fetch --tags
git checkout v4.1.0
docker compose up --build -d
```
