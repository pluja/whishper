# Anysub documentation

## Running Anysub

- [Install](INSTALL.md): requirements, the first start, Podman, reverse proxies, building from source.
- [NVIDIA GPUs](GPU.md): run the worker on a graphics card.
- [External providers](PROVIDERS.md): transcribe with OpenAI, Groq or another compatible service.
- [Configuration](CONFIGURATION.md): every setting `.env` can hold, and where data lives.
- [Upgrading](UPGRADING.md): move to a new version.
- [Backup and restore](BACKUP.md): copy your data out and back.
- [Coming from Whishper 3](MIGRATING-FROM-WHISHPER.md): what changed and how to move over.
- [Troubleshooting](TROUBLESHOOTING.md): common problems and how to report a bug.

## Using Anysub

- [User guide](USER-GUIDE.md): upload, transcribe, edit in the studio, and export.
- [API](API.md): tokens, a first script, large uploads and errors.
- [Administration](ADMINISTRATION.md): local models, external providers, transcription defaults, storage and workers.

## Working on Anysub

- [Contributing](../CONTRIBUTING.md): layout, conventions, the development stack and checks.
- [Architecture](ARCHITECTURE.md): how the system fits together and why.
- [Uploads and media](UPLOADS.md): how an upload becomes project media.
- [Adapters](ADAPTERS.md): add your own speech model to a worker image.
- [Releasing](RELEASING.md): cut a release and publish the images.
