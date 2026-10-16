# Dependabot reads these literal tags. Keep them equal to /.node-version, which
# CI reads; a test fails when they drift.
FROM docker.io/library/node:24.6.0-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /workspace

# corepack installs the pnpm version from the packageManager field.
COPY package.json ./
RUN corepack enable && corepack install

FROM base AS deps

COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Compose bind-mounts the sources and sets the command, see compose.dev.yaml.
FROM deps AS development

FROM deps AS builder

COPY . .
RUN pnpm --filter @anysub/web build \
    && pnpm --filter @anysub/web deploy --prod /opt/anysub

FROM docker.io/library/node:24.6.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

RUN groupadd --system --gid 10001 anysub \
    && useradd --system --uid 10001 --gid anysub --home-dir /app anysub \
    && mkdir -p /app /data \
    && chown -R anysub:anysub /app /data

COPY --from=builder --chown=anysub:anysub /opt/anysub /app
COPY --from=builder --chown=anysub:anysub /workspace/apps/web/build /app/build
COPY --from=builder --chown=anysub:anysub /workspace/apps/web/migrations /app/migrations
COPY --from=builder --chown=anysub:anysub /workspace/apps/web/scripts /app/scripts

WORKDIR /app
USER anysub

EXPOSE 3000
CMD ["node", "build"]
