# Dependencies

Every package in `schemats/package.json`, grouped by what it does, with anything that blocks upgrading it. **dev** marks a devDependency. Packages that must be upgraded together share a row. Last audited 2026-11-05.

The production image runs `npm ci --omit=dev` and then `node build/index.js`. adapter-node keeps `dependencies` as external imports and bundles everything else into `build/`. A package in `dependencies` therefore has to be needed at runtime, and a devDependency can still ship inside the bundle.

Markers in the notes column:

- **Remove**: nothing uses it.
- **Move**: it is in the wrong section.
- **Declare**: the code imports it, but it only arrives as some other package's dependency.

## Framework and build

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| @sveltejs/kit, @sveltejs/adapter-node | dev ^2.67.0, ^5.5.4 | App framework and Node server build | Upgrade both in one step: adapter-node 6 requires kit 3. Kit 3 needs vite ^8.0.12, vite-plugin-svelte ^7, TypeScript ^6, and Node >= 22.17, and all of those are already met. Read the migration guide. `@storybook/sveltekit` does not declare a kit peer, so run Storybook before merging. |
| @sveltejs/vite-plugin-svelte | dev ^7.3.0 | Svelte in Vite | None. |
| vite | dev ^8.2.2 | Bundler | None. The v8 move (#13) is done. |
| svelte | dev ^5.46.4 | Components | None. |
| typescript | dev ~6.0.3 | Types | **Blocked at 6.** `typescript-eslint` accepts `<6.1.0` and `svelte-check` accepts `^5 \|\| ^6`. `indexcards/` is already on 7. |
| svelte-check | dev ^4.3.6 | `npm run typecheck` | Gates TypeScript 7. |
| @tsconfig/svelte | dev ^5.0.4 | Base tsconfig | None. |
| @types/node | dev 24.13.1 | Node types | Pinned to the Node in the Dockerfiles (`node:24.13.1`). Bump it only with the runtime. |

## Styling and UI

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| tailwindcss, @tailwindcss/vite | dev ^4.3.3 | CSS (`src/app.css`) and its Vite plugin in `vite.config.ts` and `vitest.config.ts`; build time only | Upgrade both to the same version in one step. |
| @tailwindcss/forms | dev ^0.5.9 | `@plugin` in `app.css`; build time only | None. |
| @tailwindcss/typography | dev ^0.5.15 | `@plugin` in `app.css`; build time only | None. |
| flowbite-svelte | dev ~1.33.1 | Header, footer, modals, toasts, tabs, and alerts (about 15 components); bundled | Peers: svelte ^5.40 and tailwindcss ^4.1.4. `app.css` loads `flowbite/plugin`, which is not declared and arrives through flowbite-svelte. **Declare** `flowbite` or keep the two in step. |
| @lucide/svelte | ^1.20.0 | Icons | None. |
| svelte-select-5 | dev ^7.0.4 | `src/lib/layouts/Select.svelte` (invite sidebar); bundled | Community fork with low activity. |

## Data fetching and API client

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| @tanstack/svelte-query, @tanstack/svelte-query-persist-client, @tanstack/svelte-query-devtools (dev), @tanstack/query-async-storage-persister | ^6.0.3, ^6.0.5, dev ^6.0.0, ^5.90.7 | Query client and hooks; `PersistQueryClientProvider` and the localStorage persister in `+layout.svelte`; devtools | Upgrade all four in one step. The three svelte packages share a release number; the persister is on the 5.x core line, so take the version svelte-query pulls in. `<SvelteQueryDevtools />` in `src/routes/+layout.svelte` is not gated on `dev`, so it ships in production. |
| orval | dev ^8.22.0 | Generates `src/indexcards/` and its MSW mocks | Regenerate after the msw 3 move and check that the mocks target v3. |
| zod | ^4.4.3 | `src/env.ts` | Keep it in step with `types/` and `indexcards/` (4.6.x there). |
| @tabroom/types | 1.0.0 | Shared schemas (workspace) | None. |

## Tables

There are two table libraries. `SVGrid.svelte` (13 consumers) wraps SVAR, and `src/lib/components/utils/Table.svelte` (about 14 files) wraps TanStack Table.

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| @svar-ui/svelte-grid, @svar-ui/svelte-filter, plus the undeclared @svar-ui/svelte-core, @svar-ui/grid-store, and @svar-ui/filter-locales | ^2.6.0, ^2.5.0 | Grid and filter bar behind `SVGrid.svelte` and the filterbar components | Upgrade them together in one step. svelte-grid pins its own `@svar-ui/*` sub-packages exactly. **Declare** svelte-core, grid-store, and filter-locales at the versions svelte-grid pins. |
| @tanstack/svelte-table | ^9.3.1 | `Table.svelte`, `QueryTable.svelte`, and the inbox, search, history, and scoring grid | None. |

## Editor

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| @tiptap/core, @tiptap/starter-kit, @tiptap/extension-text-align, @tiptap/extensions | ^3.26.1 | `src/lib/components/Editor.svelte` (ballot feedback): core, base extensions, text alignment, and `Placeholder` | Upgrade all four to the same version in one step. |

## Dates

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| luxon | ^3.7.2 | `src/lib/helpers/dt.ts` (about 25 consumers) and `Registration.svelte` | None. Intl cannot replace parsing, `setZone`, and ISO week numbers without hand-written code. |
| @types/luxon | dev ^3.7.1 | Types | None. |

## Logging and telemetry

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| winston | ^3.19.0 | `logging.server.ts` (server only) | None. |
| @opentelemetry/api, @opentelemetry/sdk-node, @opentelemetry/auto-instrumentations-node, @opentelemetry/exporter-metrics-otlp-http, @opentelemetry/sdk-metrics, @opentelemetry/resources | api ^1.9.1; auto-instrumentations ^0.81.2; sdk-node and exporter ^0.223.0; sdk-metrics and resources ^2.12.0 | `src/instrumentation.server.ts` and `metrics.server.ts`, plus the in-memory exporter in tests | Upgrade all of them in one step, and in the same change as `indexcards/` (refer to its guide). `auto-instrumentations-node` 0.82 needs `sdk-node` ^0.300, `core` ^3, and `api` ^1.10. |

## Unit and browser tests

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| vitest, @vitest/browser, @vitest/browser-playwright, @vitest/coverage-v8 | dev ^5.0.1 | Unit and a11y projects, the a11y story run in Chromium, and coverage | Upgrade all four to the same version in one step. Keep them on the same version as the vitest packages in `indexcards/`. `@storybook/addon-vitest` accepts vitest 4 and 5. |
| jsdom | dev ^29.0.1 | Unit test environment | None (v31 is out, and vitest accepts any version). |
| @testing-library/svelte | dev ^5.4.2 | Component tests | None. |
| @testing-library/jest-dom | dev ^6.9.1 | DOM matchers | v7 needs `@testing-library/dom` 10, which is already installed. Load the `/vitest` entry in both `config/testing/vitest-setup.ts` and the `tsconfig.json` `types` array; the bare entry only types Jest's `expect`. |
| @faker-js/faker | dev ^10.3.0 | Fixtures | None. |
| msw, msw-storybook-addon, @msw/playwright | dev ^2.13.3, ^2.0.6, ^0.6.7 | API mocks, MSW in Storybook, and the `network` fixture in `config/testing/playwright.setup.ts` | Upgrade all three in one step: msw 3 with msw-storybook-addon 3 and @msw/playwright 0.7, which needs msw >= 3. Regenerate the Orval mocks afterward. |
| @playwright/test, playwright | dev ~1.63.0 | Schemats-local e2e and the a11y browser | Pinned. Upgrade both together with the `mcr.microsoft.com/playwright` image in `e2e/Dockerfile`, `e2e/package.json`, and the CI a11y image. |

## Storybook

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| storybook, @storybook/sveltekit, @storybook/addon-a11y, @storybook/addon-docs, @storybook/addon-vitest | dev ^10.6.1 (storybook), ~10.6.1 (the rest) | Component workshop, framework, and addons | Upgrade all five to the same minor in one step. Check `@storybook/sveltekit` against kit 3. |
| @storybook/addon-svelte-csf | dev ^5.1.5 | Svelte CSF stories | Versioned on its own line. Peers allow Storybook 11. |

## Lint and format

ESLint lints only `.svelte` files. Everything else goes through oxlint from the repo root.

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| eslint | dev ^9.39.4 | `npm run lint:svelte` | v10 is not blocked: `eslint-plugin-svelte` and `typescript-eslint` both accept it. The old `eslint-plugin-import` blocker no longer applies. |
| eslint-plugin-svelte, svelte-eslint-parser | dev ^3.12.1, ^1.6.0 | Svelte rules and their parser | None. |
| typescript-eslint | dev ^8.70.0 | TS in `.svelte` files | Gates TypeScript 7. |
| globals | dev ^17.0.0 | Browser and Node globals | None. |
| prettier | dev ^3.8.1 | Formatting (also used by `indexcards/`) | None. |

## Agent tooling

| Package | Range | Purpose | Upgrade blockers and notes |
|---|---|---|---|
| @tanstack/intent | dev ^0.5.5 | Supplies `@tanstack/*` skills (the `intent` key in `package.json`) | None. |
