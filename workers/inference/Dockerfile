# Keep equal to .python-version, which CI and uv read.
ARG PYTHON_VERSION=3.12.11
# CI pins the same version in the setup-uv step.
ARG UV_VERSION=0.11.25

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

FROM docker.io/library/python:${PYTHON_VERSION}-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY --from=uv /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

# Compose bind-mounts the sources and sets the command, see compose.dev.yaml.
# The project installs on the first `uv run` inside the container.
FROM deps AS development

ARG ANYSUB_ACCELERATOR=cpu

WORKDIR /workspace

COPY workers/inference/pyproject.toml workers/inference/README.md workers/inference/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --extra speech --extra "$ANYSUB_ACCELERATOR"

FROM deps AS builder

ARG ANYSUB_ACCELERATOR=cpu

WORKDIR /app

COPY workers/inference/pyproject.toml workers/inference/README.md workers/inference/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --extra speech --extra "$ANYSUB_ACCELERATOR" --no-install-project --no-editable

COPY workers/inference/src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --extra speech --extra "$ANYSUB_ACCELERATOR" --no-editable

FROM base AS runtime

ARG ANYSUB_ACCELERATOR=cpu

ENV PATH="/app/.venv/bin:$PATH" \
    HF_HOME=/models/huggingface \
    TORCH_HOME=/models/torch \
    HF_HUB_DISABLE_TELEMETRY=1 \
    DO_NOT_TRACK=1 \
    PYANNOTE_METRICS_ENABLED=0

RUN groupadd --system --gid 10001 anysub \
    && useradd --system --uid 10001 --gid anysub --home-dir /app anysub \
    && mkdir -p /app /data /models \
    && chown -R anysub:anysub /app /data /models

COPY --from=builder --chown=anysub:anysub /app/.venv /app/.venv

# CTranslate2 loads cuBLAS and cuDNN at runtime. PyTorch installs them inside
# the virtual environment, outside the system loader path.
RUN if [ "$ANYSUB_ACCELERATOR" = cuda ]; then \
      site_packages=$(/app/.venv/bin/python -c 'import sysconfig; print(sysconfig.get_path("purelib"))') \
      && printf '%s\n' "$site_packages/nvidia/cudnn/lib" "$site_packages/nvidia/cublas/lib" \
        > /etc/ld.so.conf.d/anysub-nvidia.conf \
      && ldconfig; \
    fi

RUN ["/app/.venv/bin/anysub-adapters"]
RUN ["/app/.venv/bin/python", "-c", "from transformers import Pipeline; import torchvision; from whisperx import load_model; print('WhisperX runtime imports verified')"]

WORKDIR /app
USER anysub

CMD ["anysub-worker"]
