# Model adapters

Status: protocol `1.0`. The deterministic test adapter and production WhisperX adapter are implemented.

Anysub workers are model-agnostic. An adapter owns the model library and converts its output into versioned Anysub artifacts. The worker owns application authentication, job leases, retries, progress delivery, and result upload.

This boundary allows first-party and administrator-built adapters for Faster-Whisper, WhisperX, Voxtral, Qwen-family speech models, or another implementation without adding model-specific branches to the worker core.

## Contract

Every adapter implements the small manifest-only base protocol. Capability-specific protocols add operations such as transcription. This means, for example, a future translation-only adapter will not need to implement a meaningless transcription stub.

An adapter package must:

1. Publish one entry point in the `anysub.adapters` group.
2. Return an `AdapterManifest` using adapter protocol `1.0`.
3. Implement the capabilities declared by each model.
4. Validate model-specific options before loading expensive model state.
5. Return normalized Anysub artifacts with integer-microsecond timestamps.
6. Report progress without contacting the Anysub application directly.

Adapters run as trusted code inside a worker. Only install packages you trust.

## Minimal package

The package metadata registers a class or instance:

```toml
[project]
name = "my-anysub-adapter"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["anysub-worker>=0.1,<0.2"]

[project.entry-points."anysub.adapters"]
my-model = "my_anysub_adapter:MyAdapter"
```

The implementation declares what it can do and returns the public artifact model:

```python
from anysub_worker import (
    AdapterCapability,
    AdapterManifest,
    AdapterModel,
    TranscriptArtifact,
)


class MyAdapter:
    @property
    def manifest(self) -> AdapterManifest:
        return AdapterManifest(
            id="example.my-model",
            displayName="My speech model",
            version="0.1.0",
            models=(
                AdapterModel(
                    id="my-model-small",
                    displayName="My model · small",
                    capabilities=(AdapterCapability.TRANSCRIBE,),
                    languages="all",
                    optionsSchema={
                        "type": "object",
                        "properties": {
                            "temperature": {"type": "number", "minimum": 0, "maximum": 1}
                        },
                        "additionalProperties": False,
                    },
                ),
            ),
        )

    async def transcribe(self, request, report_progress) -> TranscriptArtifact:
        await report_progress(0.1, "Loading model")
        # Run the model and normalize its output here.
        raise NotImplementedError
```

The worker validates that entry points implement the adapter protocol, rejects duplicate adapter IDs, and advertises installed manifests to the application. The application leases a job only to a worker that reports the requested adapter.

The built-in `whisperx` adapter is registered through this same entry-point group. It does not receive special scheduling or persistence behavior. Its implementation is therefore also a working reference for third-party ASR adapters.

## Installation

Build a worker image. Do not install the adapter on the Docker host:

```dockerfile
FROM ghcr.io/anysub/worker:0.1.0

USER root
COPY dist/my_anysub_adapter-0.1.0-py3-none-any.whl /tmp/adapter.whl
RUN uv pip install --python /app/.venv/bin/python /tmp/adapter.whl \
    && rm /tmp/adapter.whl
USER anysub
```

Reference it from a Compose override:

```yaml
services:
  worker:
    image: local/anysub-worker-my-model:0.1.0
```

Large model weights belong in `/models`, which is a persistent Docker volume. Media is available under the read-only `/data` mount for a local worker. An adapter must not modify canonical media.

## Compatibility rules

- Protocol versions use `major.minor` numbers.
- A different major version is incompatible.
- New optional fields may be added in a minor version.
- Adapter IDs are stable, lowercase identifiers owned by the package author.
- Model IDs are stable within an adapter.
- Stored runs record adapter ID, adapter version, model ID, and resolved options.
- An adapter update must not reinterpret an existing model ID incompatibly. Publish a new model ID when behavior or options change materially.

## Current limits

The first protocol is Python in-process because the model ecosystem and worker are Python-based. Dependency isolation comes from separate worker images, not hot-loading packages into a running container. A later HTTP or process sidecar contract can support other languages or mutually incompatible runtimes without changing stored subtitle artifacts.
