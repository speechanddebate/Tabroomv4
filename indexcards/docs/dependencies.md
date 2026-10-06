# Project Dependencies Documentation

This file explains the purpose of dependencies and any special notes and or reasons against updating.

## Runtime Dependencies (dependencies)

| Package | Current Version | Purpose | Notes |
|---------|---------|---------|------|
| express | ^5.2.1 | everything | on v5, we should review the migration guide. [Review Express 5 changes #18](https://github.com/speechanddebate/indexcards/issues/18)|
| express-rate-limit | ^8.3.1 | rate limiter (duh) |  |
| helmet | ^8 | security | v3->v8, it seems v4-v7 had CSP change that were reverted in v8 so this upgrade shouldn't effect much. |
| mariadb | ^3.5.4 | MariaDB driver | Connection pool used by the Kysely dialect |
| kysely | ^0.29.6 | Query builder | |
| kysely-mariadb | ^0.1.3 | Kysely dialect for the mariadb driver | |


## Dev Dependencies (devDependencies)

| Package | Current Version | Purpose | Notes |
|---------|---------|---------|------|
| eslint | ^9.18.0 | Linter | on v9, v10 is released so consider evaluating for migration. |
| vitest | ^4.0.17 | Testing | |
| @faker-js/faker | ^10.2.0 | Testing ||
