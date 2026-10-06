# DB Schema Updates

When the database schema changes (new table, dropped table, added/removed column, changed constraint, etc.) three things must happen in order.

## 1. Regenerate the Kysely types

The table types in `api/data/schema.ts` are generated from the live schema by `kysely-codegen`. Regenerate them against a database that already has the schema changes applied, writing to `api/data/schema.ts`. **Do not hand-edit that file** — changes will be overwritten the next time it is generated.

After regenerating, review the diff in `api/data/schema.ts` and run `npm run typecheck` to find code affected by the change.

## 2. Regenerate the test SQL snapshot

The integration tests load a pre-built SQL dump (`tests/test.sql`) that seeds the test database. After a schema change that snapshot must be regenerated so the test database schema matches the updated types. First, load a full database into the test env and run:

```bash
npm run updateTestFile
```

This script:
1. Prunes the test database to a minimal known-good state (`tests/createTestDatabase.js`)
2. Dumps the result with `mariadb-dump`
3. Strips `DEFINER` tags and writes the output to `tests/test.sql`

> [!IMPORTANT]
> `mariadb-client` must be installed in your environment for the dump step to work. 

Commit the updated `tests/test.sql` alongside any schema-related code changes.

## 3. Reload the test database

The updated `tests/test.sql` must be loaded into your local test database before running tests. The test runner does **not** do this automatically. If you just ran `npm run updateTestFile` this will already be done.

```bash
mysql -u <user> -p tabtest < tests/test.sql
```

If other developers pull your schema changes they will also need to reload the file into their local test databases.

## 4. Run the full test suite

After regenerating types and the test snapshot, run all tests to catch anything broken by the schema change.

```bash
npm run test-ci
```

Fix any failures before merging. 

## Summary checklist

| Step | Command | When |
|------|---------|------|
| Regenerate types | `kysely-codegen` → `api/data/schema.ts` | Schema changes in dev DB |
| Regenerate test snapshot | `npm run updateTestFile` | After types are updated |
| Reload test DB | `mysql -u <user> -p tabtest < tests/test.sql` | After snapshot is updated |
| Run tests | `npm run test-ci` | After test DB is reloaded |
