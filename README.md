# Anysub

Anysub turns audio and video into subtitles you can ship. It transcribes your media with Whisper, aligns the words to the sound, and gives you a waveform editor to fix what the model got wrong. Everything runs on your own machine, and your recordings never leave it.

Anysub is a ground-up rewrite of [Whishper](https://github.com/pluja/whishper). The version 3 branch is unmaintained.

## Features

- Transcription in the languages Whisper supports, with models from `tiny` to `large-v3-turbo`.
- Word-level timings from forced alignment.
- A cue editor with a waveform timeline, playback in sync, split, merge, retime, undo, redo, and autosave.
- Warnings for cues that run too fast, too long, or overlap.
- Export to SRT, WebVTT, or JSON.
- Resumable uploads for hours-long files.
- A searchable project library.

## Requirements

- Linux with Docker Engine or Podman, and Docker Compose.
- Disk space for your media, plus a few gigabytes for the speech models.
- A CPU is enough. An NVIDIA GPU is several times faster, but that path is untested on real hardware. See [docs/CONFIGURATION.md](docs/CONFIGURATION.md#nvidia-gpus).

## Quickstart

```sh
git clone -b v4 https://github.com/pluja/whishper.git anysub
cd anysub
./scripts/init-env.sh
docker compose up --build
```

`init-env.sh` writes a `.env` file with secrets unique to your installation. Anysub refuses to start with the placeholder values from `.env.example`.

Open `http://localhost:5173` and create the owner account on the setup page. It is the only account: public sign-up is disabled and there is no way to add users yet.

On Fedora with rootless Podman, use Docker Compose as the provider:

```sh
sudo dnf install podman docker-compose
systemctl --user enable --now podman.socket
export PODMAN_COMPOSE_PROVIDER=/usr/libexec/docker/cli-plugins/docker-compose
./scripts/init-env.sh
podman compose up --build -d
```

[docs/INSTALL.md](docs/INSTALL.md) has more on Podman, plus reverse proxy setup, upgrades, and removal.

## Status

Anysub is in beta. Upload, transcription with word alignment, the editor, autosave and recovery, quality warnings, search, and export work end to end.

Not built yet:

- Translation.
- Speaker labels.
- Watched folders.
- Import from a URL or an existing subtitle file.
- More users, or workers with their own credentials.
- Model management from the interface.
- Named revisions.
- Workers on other machines.

## Documentation

- [Install](docs/INSTALL.md): Docker and Podman, reverse proxy, upgrades, removal.
- [Configuration](docs/CONFIGURATION.md): every setting, GPU setup, storage.
- [User guide](docs/USER-GUIDE.md): uploading, transcribing, editing, exporting.
- [Adapters](docs/ADAPTERS.md): build a worker image with your own speech model.
- [Architecture](docs/ARCHITECTURE.md) and [Uploads and media](docs/UPLOADS.md): how the system works.
- [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md).

## AI disclosure

Large language models helped write this project, including application code, worker code, and documentation. A human reviews, tests, and accepts every change before it ships.

## License

Anysub is licensed under the GNU Affero General Public License, version 3 only. See [LICENSE](LICENSE).
