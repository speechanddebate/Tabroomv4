# Dependencies

Every package in `indexcards/package.json`, grouped by what it does, with anything that blocks upgrading it. **dev** marks a devDependency. Packages that must be upgraded together share a row. Last audited 2026-11-05.

Markers in the notes column:

- **Remove**: nothing live uses it.
- **Replace**: a built-in or an existing dependency covers it.

## Runtime

| Package | Version | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| Node.js | 24.13.1 (`engines: >= 24.13.1`, `node:24.13.1-trixie` images in `indexcards/Dockerfile`) | Runtime | Upgrade to 26 to get the built-in `Temporal` API, which lets luxon be removed (refer to the Dates section). The upgrade means bumping the `node:24.13.1` base images in `indexcards/Dockerfile`, `schemats/Dockerfile`, and the root `Dockerfile`, plus `engines` and `@types/node`, and updating the deathstar deploy. `e2e/Dockerfile` uses the Playwright image, which bundles its own Node. `sdk-node` 0.30x already needs >= 22.15. |

## Web server and middleware

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| express | ^5.2.1 | HTTP server, routing, and body parsing (`express.json`, `express.urlencoded`, `express.text`) | Review the v5 migration guide: [Review Express 5 changes #18](https://github.com/speechanddebate/indexcards/issues/18). |
| cookie-parser | ^1.4.4 | Parses the session cookie | None. |
| cors | ^2.8.5 | CORS headers | None. |
| helmet | ^8 | Security headers | None. Going from v3 to v8 skipped the v4-v7 CSP changes, which v8 reverted. |
| express-rate-limit | ^8.3.1 | `api/middleware/rateLimiter.ts` and the push router | None. |
| @types/cookie-parser, @types/cors, @types/express | dev | Types | Keep in step with their packages. |

## Database

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| mariadb | ^3.5.4 | Driver and connection pool | Stay on 3.x until `kysely-mariadb` widens its peer range (`^3.4.5`). |
| kysely | ^0.29.6 | Query builder | `kysely-mariadb` and `kysely-codegen` accept `<1.0`. Check both when Kysely 1.0 ships. |
| kysely-mariadb | ^0.1.3 | Kysely dialect for the mariadb driver | Pre-1.0 and low activity; it gates mariadb and kysely majors. |
| kysely-codegen | dev ^0.20.0 | Regenerates `api/data/db.d.ts` | None. |

## Validation and API docs

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| zod | ^4.6.5 | Request and response schemas | Keep the range in step with `types/` and `schemats/`. |
| zod-openapi | ^6.0.2 | Builds `openapi.json` from the zod schemas | Major versions follow zod majors. |
| @tabroom/types | 1.0.0 | Shared schemas (workspace) | Run `npm run build` in `types/` before typechecking. |
| @scalar/express-api-reference | ^0.10.1 | API reference page in `v1/indexRouter.ts` | None. Pre-1.0, so read the changelog on minor bumps. |
| openapi3-ts | dev ^4.6.1 | OpenAPI types for the spec builder | None. |

## Auth and crypto

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| jose | ^6.2.14 | JWTs for unsubscribe links and campus rooms | None. |
| unixcrypt | ^3.0.4 | Verifies and creates classic password hashes (`AuthService`, `sessionRepo`, legacy `login.js`) | v4 is ESM-only with Node >= 20, which fits this package. Check that `encrypt` and `verify` keep their signatures before bumping. |

## Queues and Redis

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| bullmq | ^6.5.1 | Email and push queues, workers, and flows | None. |
| bullmq-otel | ^2.0.1 | BullMQ telemetry | Peer `bullmq >= 6`. |
| ioredis | ^5.11.1 | Redis client built in `api/services/queue/connection.ts` | v6 is out and BullMQ accepts `ioredis >= 5`. Review the v6 breaking changes and move it together with BullMQ's copy (currently deduped). |

## Notifications

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| nodemailer | ^10.3.1 | SMTP egress in `channels/email.ts` | CommonJS: use default imports only, and mock it as `{ default }`. |
| web-push | ^3.6.7 | Web push delivery | CommonJS, the same as nodemailer. |
| html-to-text | ^9.0.5 | Plain-text bodies for email and push, and ballot text | v10 is out. `@types/html-to-text` is still 9.0.4, so confirm the types before bumping. |
| sanitize-html | ^2.17.4 | `api/helpers/text.js` | None. |
| @types/html-to-text, @types/sanitize-html, @types/web-push | dev | Types | Keep in step with their packages. |

## Dates

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| luxon | ^3.7.2 | `api/helpers/dateTime.js`, and day start and end in the tourn timezone in the legacy `controllers/tab/jpool/standby.js` | **Remove after the Node 26 upgrade.** Node 26 ships the built-in `Temporal` API, which covers everything luxon does here. Port `dateTime.js` and `standby.js` to `Temporal`, then drop luxon and `@types/luxon`. Before porting, add characterization tests for `dateTime.js` (it has none beyond `schoolYearDateRange`). TypeScript only knows `Temporal` under `lib: esnext` or `esnext.temporal`. |
| @types/luxon | dev ^3.7.1 | Types | Remove with luxon. |

## Files

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| @aws-sdk/client-s3 | ^3.397.0 | File put, get, and delete in `api/helpers/aws.ts` | None. Minor releases ship almost daily. |

## Logging and telemetry

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| winston | ^3.2.1 | `api/helpers/logger.js` | None. |
| @opentelemetry/api, @opentelemetry/sdk-node, @opentelemetry/auto-instrumentations-node, @opentelemetry/exporter-trace-otlp-http, @opentelemetry/exporter-metrics-otlp-http, @opentelemetry/sdk-trace, @opentelemetry/sdk-metrics, @opentelemetry/resources, @opentelemetry/core, @opentelemetry/context-async-hooks (dev) | api ^1.9.1; auto-instrumentations ^0.81.2; sdk-node and exporters ^0.223.0; sdk-trace, sdk-metrics, resources, core, and context-async-hooks ^2.12.0 | Bootstrap and export in `api/instrumentation.ts`; spans and metrics in the database, repos, and queues; `getRPCMetadata` in the logger; in-memory exporters and the context manager in tests | Upgrade all of them in one step. `auto-instrumentations-node` 0.82 needs `sdk-node` ^0.300, `core` ^3, and `api` ^1.10, so the 0.2xx packages go to 0.30x, the 2.x packages go to 3.x, and api goes to ^1.10. sdk-node 0.30x requires Node >= 22.15. Make the same move in `schemats/` in the same change. |

## NSDA shared

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| @speechanddebate/nsda-js-utils | ^1.0.15 | `showDateTime`, `randomPhrase`, and `ordinalize` in legacy tab controllers | We publish it. v2 is out, and its upgrade is handled outside this audit. |

## Build and test tooling

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| typescript | dev ^7.0.2 | Build and typecheck | Already on 7. `schemats/` is held at 6. |
| tsx | dev ^4.19.2 | Dev server and scripts | None. |
| vitest, @vitest/coverage-v8, @vitest/ui | dev ^5.0.1 | Tests, coverage, and the test UI | Upgrade all three to the same version in one step. Try to keep them on the same version as the vitest packages in `schemats/`. |
| supertest, @types/supertest | dev ^7.1.3, ^7.2.0 | Router tests | None. |
| @faker-js/faker | dev ^10.2.0 | Test factories | None. |

Linting runs through oxlint from the repo root, and `npm run format` uses the prettier hoisted from `schemats/`; neither is declared here.
