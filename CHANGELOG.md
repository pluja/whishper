# Changelog

Anysub follows [Semantic Versioning](https://semver.org). The web and worker images always share one version. Each release lists what changed for the people who run and use Anysub.

## [Unreleased]

### Added

- External providers: transcribe with OpenAI, Groq or any service that offers OpenAI's transcription API. Add them under **Administration > External providers**, pick their models from the service's list, and set a price per minute to see what a run costs. Their models appear next to the local ones, and the form says where the audio goes. See [External providers](docs/PROVIDERS.md).
- A public API under `/api/v1` for scripts and other apps: upload media, start and follow transcriptions, and download subtitles. Make personal tokens, read only or read and write, under **Account and API tokens**. Anysub serves an API reference page and an OpenAPI document. See [API](docs/API.md).
- A remote-only worker image, `anysub-worker:<version>-remote`, for installations that only use providers. It is about 600 MB instead of 3 GB and needs no GPU.

### Changed

- Uploads are refused when they would leave less than 1 GB free on the data volume, so a large upload can't fill the disk and break the server.

## [4.1.0] - 2026-11-12

This release moves the web app to new versions of its main libraries. Nothing changes in how Anysub works.

### Changed

- The web image is smaller: 305 MB instead of 443 MB. It now ships only the code the server runs.
- The web app runs on SvelteKit 3 and better-auth 1.7.

### Security

- better-auth 1.7 fixes advisories in its device login, OAuth proxy and magic link features. Anysub doesn't use these features.

### Known issues

- The worker still uses PyTorch 2.8 and transformers 4.57, as in 4.0.3. The fixed versions need a newer WhisperX, which isn't released yet.

## [4.0.3] - 2026-11-12

This release updates more worker libraries with known security problems. Nothing changes in how Anysub works.

### Security

- Updated the worker libraries nltk, aiohttp, urllib3, multidict, lightning, Mako and OpenTelemetry to versions with security fixes. 4.0.2 missed these because its security check skipped the speech libraries.

### Known issues

- The worker still uses PyTorch 2.8 and transformers 4.57, which have published security advisories. The fixed versions need a newer WhisperX, which isn't released yet. The advisories are about loading untrusted model files and about features Anysub doesn't use. Anysub only downloads models from its own fixed list.

## [4.0.2] - 2026-11-11

This release updates Node.js and other dependencies with known security problems. Nothing changes in how Anysub works.

### Security

- The web image runs Node.js 24.22.2, with the Node.js security releases up to October 2026.
- Updated the web libraries SvelteKit, Zod and devalue to versions with security fixes.
- Updated the worker libraries Pillow, filelock, certifi and setuptools to versions with security fixes.

## [4.0.1] - 2026-11-11

Anysub 4.0.1 is the first published release of the Whishper rewrite. It replaces Whishper 3 completely, under a new name, and cannot read Whishper 3 data. [4.0.0](https://github.com/pluja/anysub/blob/main/CHANGELOG.md#400---2026-11-10) lists what Anysub does, and [Coming from Whishper 3](https://github.com/pluja/anysub/blob/main/docs/MIGRATING-FROM-WHISHPER.md) explains how to move over. This release fixes what a review found before 4.0.0 went out.

### Security

- The sign-in limit now holds when many attempts arrive at once.
- Asking for a password recovery code again prints the same code until it expires or is used, so nobody else can keep replacing it.
- A server error during sign-in is no longer reported as a wrong password.

### Fixed

- **Library and uploads**
  - An upload that stopped shows as **Upload paused** instead of keeping the library refreshing for a week.
  - The new project dialog checks the file type and size before sending anything, and explains a failed upload in plain words.
  - Leaving or reloading the page during an upload asks first, and a stopped upload no longer pulls you to its project later.
  - A finished upload cannot be sent twice, and the dialog no longer closes on a repeated `Escape` or a text selection dragged out of it.
  - Renaming a project keeps your place on the page, and reopening the rename no longer shows the previous error.
  - Library search ignores accents, so `cafe` finds "Café".
  - Cancelled projects are labelled **Cancelled**, and long names are shortened without breaking an emoji.
- **Studio**
  - No edit can move a cue past the end of the source anymore. Such a cue made every save fail; one that already exists is flagged **Ends after the source**.
  - Jumping to a cue that starts where the previous one ends selects that cue, so `I`, `O` and other edits change the right one.
  - `I`, `O` and split use the exact playhead during playback.
  - Moving a cue shifts its word timings with it, and changing its start or end clears them, so the JSON export never has words outside their cue.
  - On a narrow screen, following playback scrolls the cue list instead of the page.
  - Screen readers no longer read out the playback clock, progress and save state as they change.
  - Timeline ruler labels show fractions of a second when zoomed in.
  - A refused split shows as a notice instead of a save error, and holding `Shift+Delete` deletes one cue.
  - While media is prepared or transcribed, the studio checks progress with a small request instead of reloading the whole transcript every 1.5 seconds.
- **Models and workers**
  - Transcribing with a model that is not downloaded yet fetches it the same way the models page does, with a free-space check, progress and a working cancel.
  - A model download that fails resumes on retry instead of starting over, and a cancelled one frees its space.
  - Changing the language between runs no longer reloads the model, and an unsupported language fails with a clear message.
  - The models page shows a finished download or removal at once, and judges fit at the configured precision.
  - Removing a disconnected worker also cancels its running model tasks, and failure messages fit downloads and removals.
  - Media preparation interrupted by a crash or a short web restart completes on retry instead of failing or starting over.
  - Thumbnails of small videos are no longer upscaled.
  - The worker stops promptly when its container stops during a transcription, reports a job it cannot read instead of letting it expire, and checks its name and identity at startup.
- **Running Anysub**
  - An empty `DATA_ROOT` counts as unset.
  - Releasing a fix for an older version line never moves `latest` or the major image tag backwards.

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

[4.1.0]: https://github.com/pluja/anysub/releases/tag/v4.1.0
[4.0.3]: https://github.com/pluja/anysub/releases/tag/v4.0.3
[4.0.2]: https://github.com/pluja/anysub/releases/tag/v4.0.2
[4.0.1]: https://github.com/pluja/anysub/releases/tag/v4.0.1
[4.0.0]: https://github.com/pluja/anysub/releases/tag/v4.0.0
