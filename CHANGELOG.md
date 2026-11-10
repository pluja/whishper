# Changelog

Anysub follows [Semantic Versioning](https://semver.org). The web and worker images always share one version. Each release lists what changed for the people who run and use Anysub.

## [4.0.0] - 2026-11-10

Anysub 4.0.0 is the first release of the Whishper rewrite. It replaces Whishper 3 completely, under a new name. It cannot read Whishper 3 data. [Coming from Whishper 3](https://github.com/pluja/anysub/blob/main/docs/MIGRATING-FROM-WHISHPER.md) explains what that means for you and how to move over.

### Added

- Transcription with WhisperX, from `tiny` to `large-v3-turbo`, in every language Whisper supports. Anysub picks a model that fits your hardware.
- Word-level timings from forced alignment.
- A subtitle studio: a waveform timeline, playback in sync, split, merge, retiming by drag or keyboard, undo and redo, and autosave with crash recovery.
- Warnings for cues that are too fast, too short, too long, or overlap.
- Export to SRT, WebVTT, plain text, and Anysub JSON with word timings.
- Resumable uploads, so hours-long recordings survive a dropped connection.
- A searchable project library.
- An administration area: download and remove models, set transcription defaults and precision, choose the upload limit, and watch disk space and workers.
- An owner account with a printed recovery code instead of email.
- Published images on the GitHub Container Registry: `ghcr.io/pluja/anysub` and `ghcr.io/pluja/anysub-worker`, with a `-cuda` worker for NVIDIA GPUs.

### Changed from Whishper 3

- Two containers instead of three. SQLite replaces MongoDB, and the LibreTranslate container is gone.
- No configuration before the first start. Anysub generates its secrets and stores them in its database.
- Images moved from Docker Hub (`pluja/whishper`) to the GitHub Container Registry.
- The default port is 5173 instead of 8082.

### Not in this release

- Translation. Whishper 3 used LibreTranslate for it.
- Transcribing from a URL.
- Importing an existing subtitle file.
- More than one account.
- ARM64 images.

[4.0.0]: https://github.com/pluja/anysub/releases/tag/v4.0.0
