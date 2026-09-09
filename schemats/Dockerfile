# playwright does NOT like trixie so force bookworm
FROM node:24.13.1-bookworm AS base

WORKDIR /app

COPY package.json package-lock.json ./
COPY schemats/package.json ./schemats/package.json

FROM base AS dev

RUN npm ci --include=dev --ignore-scripts --workspace=schemats

# install playwright browsers
RUN npm exec --workspace=schemats -- playwright install --with-deps

COPY schemats ./schemats

CMD ["sh", "-lc", "npm exec --workspace=schemats svelte-kit sync && npm run dev --workspace=schemats"]

FROM base AS build

RUN npm ci --ignore-scripts

COPY schemats ./schemats

RUN npm run build --workspace=schemats

FROM node:24.13.1-bookworm-slim AS prod

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
COPY schemats/package.json ./schemats/package.json

RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

# copy ONLY the built app
COPY --from=build /app/schemats/build ./schemats/build

WORKDIR /app/schemats

EXPOSE 3000

CMD ["node", "build/index.js"]