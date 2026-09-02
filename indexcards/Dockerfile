# Docker build context: tabroom/
# mount config at config/config.json

FROM node:24.13.1-trixie AS base
WORKDIR /app

COPY package.json package-lock.json ./
COPY types/package.json ./types/package.json
COPY indexcards/package.json ./indexcards/package.json


FROM base AS dev

ENV NODE_ENV=development

RUN npm ci --include=dev --ignore-scripts

COPY types ./types
COPY indexcards ./indexcards

ENV TZ="UTC"
ENV PORT=3000

CMD ["npm", "run", "dev", "--workspace=indexcards"]


FROM base AS build

RUN npm ci --ignore-scripts

COPY types ./types
COPY indexcards ./indexcards

RUN npm run build --workspace=types
RUN npm run build --workspace=indexcards


FROM node:24.13.1-trixie-slim AS prod

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY types/package.json ./types/package.json
COPY indexcards/package.json ./indexcards/package.json

RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

COPY --from=build /app/types/dist ./types/dist
COPY --from=build /app/indexcards/dist ./indexcards/dist

WORKDIR /app/indexcards

EXPOSE 3000

ENV CONFIG_DIR="/config"

CMD ["node", "dist/app.js"]
