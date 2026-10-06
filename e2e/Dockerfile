# Docker build context: tabroom/
# Version must match @playwright/test in e2e/package.json
FROM mcr.microsoft.com/playwright:v1.63.0-jammy

WORKDIR /app

COPY package.json package-lock.json ./
COPY types/package.json ./types/package.json
COPY indexcards/package.json ./indexcards/package.json
COPY e2e/package.json ./e2e/package.json

RUN npm ci --ignore-scripts

# tests create data through the indexcards factories
COPY types ./types
RUN npm run build --workspace=types
COPY indexcards ./indexcards
COPY e2e ./e2e

ENV TZ="UTC"
ENV CONFIG_DIR="/config"
# quiets the config and logger output each worker prints when it loads the factories
ENV NODE_ENV="test"

WORKDIR /app/e2e

CMD ["npx", "playwright", "test"]
