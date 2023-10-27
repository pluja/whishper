FROM node:alpine as base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
ENV BODY_SIZE_LIMIT=0
RUN pnpm run build

FROM base
WORKDIR /app
ENV BODY_SIZE_LIMIT=0
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/build ./
EXPOSE 3000
CMD [ "node",  "index.js"]