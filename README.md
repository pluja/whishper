<p align="center">
  <img src="apps/web/static/favicon.svg" alt="" width="96" height="96">
</p>

# Anysub

Anysub turns audio and video into subtitles you can ship. It transcribes your media with Whisper, aligns the words to the sound, and gives you a waveform editor to fix what the model got wrong. Everything runs on your own machine, and your recordings never leave it.

Anysub is the successor to Whishper, rewritten from scratch.

## Features

- Transcription in the languages Whisper supports, with models from `tiny` to `large-v3-turbo`.
- Word-level timings from forced alignment.
- A cue editor with a waveform timeline, playback in sync, split, merge, retime, undo, redo, and autosave.
- Warnings for cues that run too fast, too long, or overlap.
- Export to SRT, WebVTT, plain text, or JSON.
- Resumable uploads for hours-long files.
- A searchable project library.
- An administration area to download models ahead of time, set transcription defaults and precision, choose the upload limit, and watch disk space and workers.

## Install

On a Linux x86-64 host with Docker and Docker Compose:

```sh
mkdir anysub && cd anysub
curl -fsSLO https://github.com/pluja/anysub/releases/latest/download/compose.yaml
docker compose up -d
```

Open `http://localhost:5173` and create the owner account. Anysub asks for a setup code, which it prints in its log: run `docker compose logs web` to see it. There is nothing to configure first.

[Install](docs/INSTALL.md) covers requirements, Podman, NVIDIA GPUs, reverse proxies and building from source.

## Coming from Whishper 3

Anysub cannot read Whishper 3 data, and Whishper 3 is no longer maintained. [Coming from Whishper 3](docs/MIGRATING-FROM-WHISHPER.md) explains what changed and how to move over. The old code is in the [`v3-legacy`](https://github.com/pluja/anysub/tree/v3-legacy) branch.

## Not built yet

- Translation.
- Speaker labels.
- Watched folders.
- Import from a URL or an existing subtitle file.
- More than one account.
- Workers on other machines.
- ARM images.

New features arrive in 4.x releases. The [changelog](CHANGELOG.md) lists what each one brings.

## Documentation

Everything is in [docs](docs/README.md): installing, upgrading, backups, the user guide, administration, troubleshooting, and how to contribute.

## AI disclosure

Large language models helped write this project, including application code, worker code, and documentation. A human reviews, tests, and accepts every change before it ships.

## License

Anysub is licensed under the GNU Affero General Public License, version 3 only. See [LICENSE](LICENSE).
