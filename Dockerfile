FROM node:24.13.1-trixie AS base

COPY package.json package-lock.json ./
COPY indexcards/package.json ./indexcards/package.json
COPY schemats/package.json ./schemats/package.json

FROM base AS dev

RUN npm ci --include=dev --ignore-scripts

COPY . .


