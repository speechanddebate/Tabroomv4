# Dependencies

Every package in `indexcards/package.json`, grouped by what it does, with what constrains upgrading it. **dev** marks a devDependency. Packages that are upgraded together share a row. Last audited 2026-11-05.

## Runtime

| Package | Version | Purpose | Upgrade notes |
|---|---|---|---|
| Node.js | 24.13.1 | Runtime | Set by `engines` (`>= 24.13.1`), the `node:24.13.1` base images in `indexcards/Dockerfile`, `schemats/Dockerfile`, and the root `Dockerfile`, `@types/node`, and the deathstar deploy. `e2e/Dockerfile` uses the Playwright image, which bundles its own Node. TypeScript `target` follows the production Node: `es2024` in `indexcards/tsconfig.json` and `e2e/tsconfig.json` (which typechecks indexcards factories). On Node 26, raise both to `es2025`. Node 26 adds the built-in `Temporal` API, which covers everything luxon does here. |

## Web server and middleware

| Package | Range | Purpose | Upgrade notes |
|---|---|---|---|
| express | ^5.2.1 | HTTP server, routing, and body parsing (`express.json`, `express.urlencoded`, `express.text`) | v5 migration review: [Review Express 5 changes #18](https://github.com/speechanddebate/indexcards/issues/18). |
| cookie-parser | ^1.4.4 | Parses the session cookie | None. |
| cors | ^2.8.5 | CORS headers | None. |
| helmet | ^8 | Security headers | None. |
| express-rate-limit | ^8.3.1 | `api/middleware/rateLimiter.ts` and the push router | None. |
| @types/cookie-parser, @types/cors, @types/express | dev | Types | Follow their packages. |

## Database

| Package | Range | Purpose | Upgrade notes |
|---|---|---|---|
| mariadb | ^3.5.4 | Driver and connection pool | `kysely-mariadb` accepts `^3.4.5` only. |
| kysely | ^0.29.6 | Query builder | `kysely-mariadb` and `kysely-codegen` accept `<1.0`. |
| kysely-mariadb | ^0.1.3 | Kysely dialect for the mariadb driver | Pre-1.0 and low activity; its peer ranges gate mariadb and kysely majors. |
| kysely-codegen | dev ^0.20.0 | Regenerates `api/data/db.d.ts` | None. |

## Validation and API docs

| Package | Range | Purpose | Upgrade notes |
|---|---|---|---|
| zod | ^4.6.5 | Request and response schemas | Same range as `types/` and `schemats/`. |
| zod-openapi | ^6.0.2 | Builds `openapi.json` from the zod schemas | Major versions follow zod majors. |
| @tabroom/types | 1.0.0 | Shared schemas (workspace) | Typechecking needs `npm run build` in `types/` first. |
| @scalar/express-api-reference | ^0.10.1 | API reference page in `v1/indexRouter.ts` | Pre-1.0; minor releases can break. |
| openapi3-ts | dev ^4.6.1 | OpenAPI types for the spec builder | None. |

## Auth and crypto

| Package | Range | Purpose | Upgrade notes |
|---|---|---|---|
| jose | ^6.2.14 | JWTs for unsubscribe links and campus rooms | None. |
| unixcrypt | ^3.0.4 | Verifies and creates classic password hashes (`AuthService`, `sessionRepo`, legacy `login.js`) | v4 is ESM-only and needs Node >= 20. |

## Queues and Redis

| Package | Range | Purpose | Upgrade notes |
|---|---|---|---|
| bullmq | ^6.5.1 | Email and push queues, workers, and flows | None. |
| bullmq-otel | ^2.0.1 | BullMQ telemetry | Peer `bullmq >= 6`. |
| ioredis | ^5.11.1 | Redis client built in `api/services/queue/connection.ts` | v6 is out; BullMQ accepts `ioredis >= 5` and shares the same (deduped) copy. |

## Notifications

| Package | Range | Purpose | Upgrade notes |
|---|---|---|---|
| nodemailer | ^10.3.1 | SMTP egress in `channels/email.ts` | CommonJS: default imports only, mocked as `{ default }`. |
| web-push | ^3.6.7 | Web push delivery | CommonJS, the same as nodemailer. |
| html-to-text | ^10.0.1 | Plain-text bodies for email and push, and ballot text | v10 ships no types; `@types/html-to-text` 9.0.4 still covers `convert`. v10 keeps `<textarea>` and `<xmp>` content as raw text, tags included. v11 will be ESM-only. |
| sanitize-html | ^2.17.4 | `api/helpers/text.js` | None. |
| @types/html-to-text, @types/sanitize-html, @types/web-push | dev | Types | Follow their packages. |

## Dates

| Package | Range | Purpose | Upgrade notes |
|---|---|---|---|
| luxon | ^3.7.2 | `api/helpers/dateTime.js`, and day start and end in the tourn timezone in the legacy `controllers/tab/jpool/standby.js` | Replaceable by the built-in `Temporal` API on Node 26. `dateTime.js` has tests only for `schoolYearDateRange`. TypeScript types `Temporal` only under `lib: esnext` or `esnext.temporal`. |
| @types/luxon | dev ^3.7.1 | Types | Follows luxon. |

## Files

| Package | Range | Purpose | Upgrade notes |
|---|---|---|---|
| @aws-sdk/client-s3 | ^3.397.0 | File put, get, and delete in `api/helpers/aws.ts` | None. Minor releases ship almost daily. |

## Logging and telemetry

| Package | Range | Purpose | Upgrade notes |
|---|---|---|---|
| winston | ^3.2.1 | `api/helpers/logger.js` | None. |
| @opentelemetry/api, @opentelemetry/sdk-node, @opentelemetry/auto-instrumentations-node, @opentelemetry/exporter-trace-otlp-http, @opentelemetry/exporter-metrics-otlp-http, @opentelemetry/sdk-trace, @opentelemetry/sdk-metrics, @opentelemetry/resources, @opentelemetry/core, @opentelemetry/context-async-hooks (dev) | api ^1.9.1; auto-instrumentations ^0.81.2; sdk-node and exporters ^0.223.0; sdk-trace, sdk-metrics, resources, core, and context-async-hooks ^2.12.0 | Bootstrap and export in `api/instrumentation.ts`; spans and metrics in the database, repos, and queues; `getRPCMetadata` in the logger; in-memory exporters and the context manager in tests | Move as one set, together with the `schemats/` set. `auto-instrumentations-node` 0.82 needs `sdk-node` ^0.300, `core` ^3, and `api` ^1.10, so the 0.2xx packages go to 0.30x, the 2.x packages go to 3.x, and api goes to ^1.10. sdk-node 0.30x needs Node >= 22.15. |

## NSDA shared

| Package | Range | Purpose | Upgrade notes |
|---|---|---|---|
| @speechanddebate/nsda-js-utils | ^1.0.15 | `showDateTime`, `randomPhrase`, and `ordinalize` in legacy tab controllers | Published by the NSDA. v2 is out. |

## Build and test tooling

| Package | Range | Purpose | Upgrade notes |
|---|---|---|---|
| typescript | dev ^7.0.2 | Build and typecheck | `schemats/` is on 6. |
| tsx | dev ^4.19.2 | Dev server and scripts | None. |
| vitest, @vitest/coverage-v8, @vitest/ui | dev ^5.1.0 | Tests, coverage, and the test UI | Same version for all three, matching the vitest packages in `schemats/`. |
| supertest, @types/supertest | dev ^7.1.3, ^7.2.0 | Router tests | None. |
| @faker-js/faker | dev ^10.2.0 | Test factories | None. |

Linting runs through oxlint from the repo root, and `npm run format` uses the prettier hoisted from `schemats/`; neither is declared here.
