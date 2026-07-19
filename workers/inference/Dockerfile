FROM python:3.12.11-slim-bookworm AS base

COPY --from=ghcr.io/astral-sh/uv:0.11.25 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS development

COPY workers/inference/pyproject.toml workers/inference/README.md workers/inference/uv.lock ./
COPY workers/inference/src ./src
COPY workers/inference/tests ./tests
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked

CMD ["uv", "run", "anysub-worker"]

FROM base AS builder

WORKDIR /app
ARG ANYSUB_ACCELERATOR=cpu

COPY workers/inference/pyproject.toml workers/inference/README.md workers/inference/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --extra speech --extra "$ANYSUB_ACCELERATOR" --no-install-project --no-editable

COPY workers/inference/src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --extra speech --extra "$ANYSUB_ACCELERATOR" --no-editable

FROM python:3.12.11-slim-bookworm AS runtime

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models/huggingface \
    TORCH_HOME=/models/torch \
    HF_HUB_DISABLE_TELEMETRY=1 \
    DO_NOT_TRACK=1 \
    PYANNOTE_METRICS_ENABLED=0

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 anysub \
    && useradd --system --uid 10001 --gid anysub --home-dir /app anysub \
    && mkdir -p /app /data /models \
    && chown -R anysub:anysub /app /data /models

COPY --from=ghcr.io/astral-sh/uv:0.11.25 /uv /uvx /bin/
COPY --from=builder --chown=anysub:anysub /app/.venv /app/.venv

RUN ["/app/.venv/bin/anysub-adapters"]
RUN ["/app/.venv/bin/python", "-c", "from transformers import Pipeline; import torchvision; from whisperx import load_model; print('WhisperX runtime imports verified')"]

WORKDIR /app
USER anysub

CMD ["anysub-worker"]
