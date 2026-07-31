# Anysub

Anysub turns audio and video into subtitles you can actually ship. It transcribes your media, lines the words up with the sound, and gives you a real editor to fix what the model got wrong. Everything runs on your own machine, and your recordings never leave it.

Anysub is a ground-up rewrite of [Whishper](https://github.com/pluja/whishper). The version 3 branch still runs for anyone using it today. New work happens here.

## What you can do

- Transcribe audio and video in the languages Whisper supports.
- Pick your own balance of speed and accuracy, from a small model up to `large-v3-turbo`.
- Get timings for individual words, not just blocks of text.
- Edit cues against a waveform while the media plays in sync.
- Split, merge, retime, and rewrite cues, with undo, redo, and autosave.
- Spot cues that run too fast, too long, or overlap, before anyone else does.
- Export to SRT, WebVTT, or JSON.
- Upload hours-long files over a shaky connection and resume where it dropped.
- Find old projects again in a searchable library.

## What you need

- A machine running Linux with Docker Engine and Docker Compose.
- Disk space for your media, plus a few gigabytes for the speech models.
- Patience on the first run. Anysub downloads the model you choose, then keeps it.

A normal desktop or home server CPU is enough. Smaller models transcribe faster and cost you some accuracy.

An NVIDIA GPU makes transcription several times faster. That path is written but nobody has confirmed it on real hardware yet, so [docs/CONFIGURATION.md](docs/CONFIGURATION.md) walks you through it and tells you what to check when it breaks. Reports from anyone with a card are welcome.

## Getting started

```sh
git clone -b v4 https://github.com/pluja/whishper.git anysub
cd anysub
./scripts/init-env.sh
docker compose up --build
```

The setup script writes a `.env` file with passwords unique to your installation. Anysub refuses to start without it, which keeps anyone from reaching a server that still uses the examples from this repository.

Open `http://localhost:5173` and create your account. The first account you make owns the installation.

Running Anysub behind a reverse proxy or on another machine? Set `BETTER_AUTH_URL` in `.env` to the address people will type in their browser, including the port.

## Your first subtitles

Upload a file from the project library. Anysub reads the media, draws its waveform, and hands you a model picker. `Small` is a sensible starting point on a CPU. Larger models read difficult audio better and take longer.

The first transcription with a given model downloads it. After that the model stays cached, and Anysub works without an internet connection.

When the transcript lands, the editor opens with the media, the waveform, and the cue list side by side. Click a cue to jump to it. Drag a cue on the timeline to move it, or drag its edge to trim. Play the media and the current cue follows along. Press `?` for the full list of keyboard shortcuts.

Your edits save on their own. If the browser crashes mid-sentence, Anysub offers the unsaved work back when you return.

## Where this release stands

Anysub is in beta. The path from upload to export works end to end, and the pieces below are done: resumable uploads, transcription with word alignment, the waveform editor, autosave and recovery, quality warnings, project search, and export.

These are not built yet:

- Translating subtitles into other languages.
- Labelling who is speaking.
- Watching a folder for new media.
- Importing from a URL or an existing subtitle file.
- Managing downloaded models from the interface.
- Named revisions you can roll back to.

Two rough edges worth knowing. Editing a cue's text drops that cue's word timings, because the old timings no longer describe the new words. Abandoned uploads are not cleaned up on a schedule yet.

## Stopping and removing

Stop the services and keep everything:

```sh
docker compose down
```

Delete every project, upload, and cached model:

```sh
docker compose down --volumes
```

## Technical reference

### How it fits together

A SvelteKit application handles the browser, storage, and the job queue. A Python worker leases jobs from PostgreSQL and runs the speech models. PostgreSQL is the only database, and the only search engine. There is no message broker.

Transcription runs on Faster-Whisper through WhisperX, followed by forced alignment for word-level timings. Speech models live behind an adapter contract, so a new model becomes a package rather than a fork.

The worker mounts your media read only. It writes waveforms and other derived files back through the application, which means a worker never touches your original recordings.

### Repository map

- `apps/web`: SvelteKit application, authentication, queue API, PostgreSQL schema, and migrations.
- `workers/inference`: Python worker, adapter types, discovery, and the deterministic test adapter.
- `packages/contracts`: TypeScript contracts shared by the application and its workers.
- `docs/CONFIGURATION.md`: every setting, GPU setup, precision tuning, and storage.
- `docs/ADAPTERS.md`: adapter contract and how to build an image with your own.
- `docs/UPLOADS.md`: upload lifecycle, storage layout, and reverse-proxy notes.
- `docs/TRANSCRIPTION.md`: model choices, first-run behaviour, and troubleshooting.
- `docs/EDITOR.md`: cue editing, autosave, recovery, quality warnings, and exports.
- `docs/ARCHITECTURE.md`: system boundaries and the reasoning behind them.

### Configuration

`scripts/init-env.sh` generates every secret Anysub needs. `.env.example` documents what each variable does, and Anysub rejects its placeholder values on startup, so read it but do not copy it into place. Rotating `BETTER_AUTH_SECRET` signs every account out.

[docs/CONFIGURATION.md](docs/CONFIGURATION.md) covers the rest: upload limits, reverse-proxy settings, model precision, GPU setup, and what lives in each volume.

### Development

Node, pnpm, Python, uv, PostgreSQL, and FFmpeg all run in containers. None of them need to be on your host.

The development overlay mounts the source and keeps dependencies in named volumes:

```sh
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Run the checks the same way CI does:

```sh
docker compose -f compose.yaml -f compose.dev.yaml run --rm web pnpm check
docker compose -f compose.yaml -f compose.dev.yaml run --rm web pnpm test
docker compose -f compose.yaml -f compose.dev.yaml run --rm web pnpm format:check
docker compose -f compose.yaml -f compose.dev.yaml run --rm worker uv run ruff check .
docker compose -f compose.yaml -f compose.dev.yaml run --rm worker uv run pytest
```

## Development disclosure

Large language models assisted in writing this project, covering application code, worker code, and documentation. A human always reviews, tests and accepts the LLM changes before shipping.

## License

Anysub is licensed under the GNU Affero General Public License, version 3 only. See [LICENSE](LICENSE).
