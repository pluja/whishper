<p align="center">
  <img src="apps/web/static/favicon.svg" alt="" width="96" height="96">
</p>

<h1 align="center">Anysub</h1>

Anysub turns audio and video into subtitles with an easy-to-use web UI. Everything runs on your own machine.

It is the successor to Whishper, rewritten from scratch.

## Features

- Transcription with Whisper, from the `tiny` model to `large-v3-turbo`.
- Word-level timings.
- A subtitle editor with a waveform timeline, undo and autosave.
- Warnings for subtitles that are too fast, too long, or overlap.
- Export to SRT, WebVTT, plain text or JSON.
- Uploads that resume, for hours-long files.
- A searchable library.
- Admin pages for models, defaults, upload limits, disk space and workers.

## Install

On a Linux x86-64 host with Docker and Docker Compose:

```sh
mkdir anysub && cd anysub
curl -fsSLO https://github.com/pluja/anysub/releases/latest/download/compose.yaml
docker compose up -d
```

Open `http://localhost:5173` and create your account. It asks for a setup code, which you find with `docker compose logs web`.

[Install](docs/INSTALL.md) covers requirements, Podman, NVIDIA GPUs, reverse proxies and building from source.

## Coming from Whishper 3

Whishper 3 is no longer maintained, and Anysub can't read its data. [Coming from Whishper 3](docs/MIGRATING-FROM-WHISHPER.md) explains how to move over. The old code is in the [`v3-legacy`](https://github.com/pluja/anysub/tree/v3-legacy) branch.

## Not built yet

- Translation.
- Speaker labels.
- Watched folders.
- Import from a URL or an existing subtitle file.
- More than one account.
- Workers on other machines.
- ARM images.

These will come in 4.x releases. See the [changelog](CHANGELOG.md).

## Documentation

See [docs](docs/README.md).

## AI disclosure

Large language models helped write the code and docs. A human reviews and tests every change before it ships.

## License

[AGPL-3.0-only](LICENSE).
