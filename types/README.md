# Types

This directory contains shared **Zod schemas** and the **TypeScript types inferred from those schemas**.

Schemas are the source of truth for runtime validation. Types should generally be inferred from the corresponding Zod schema rather than defined separately.

## Directory Structure

Organize types by domain or feature rather than putting all schemas into a single file.

```text
types/
├── user.ts
├── session.ts
├── tournament.ts
├── round.ts
└── README.md
```

When a domain has several related schemas, it is appropriate to group them into a directory:

```text
types/
├── user/
│   ├── user.ts
│   ├── preferences.ts
│   └── index.ts
├── tournament/
│   ├── tournament.ts
│   └── round.ts
└── README.md
```

## Schema and Type Naming

Use **PascalCase** for both schemas and their inferred types.

Schemas should use the `Schema` suffix. Types should use the corresponding name without the suffix.

```ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

export type User = z.infer<typeof UserSchema>;
```

This makes it immediately clear which identifier is the runtime schema and which is the TypeScript type.

### Avoid defining the type separately

Do not duplicate the schema definition in a TypeScript interface or type:

```ts
// ❌ Avoid
export const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export interface User {
  id: number;
  name: string;
}
```

Instead, infer the type from the schema:

```ts
// ✅ Preferred
export const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export type User = z.infer<typeof UserSchema>;
```

This ensures the runtime validation and compile-time type cannot drift apart.

## Reserved Name

Schemas with a name matching a db table should **exactly** match the db schema. This means that an object
passing schema validation should be insertable in the db, and a row in the db should pass the schema.

## Reusing schemas

If a schema field will be an exact match for a db column, import that schema and use the columns definition so that if the column changes it can be updated.

```ts
import { BarSchema } from '../Bar.ts';
export const FooSchema = z.object({
  ...
  BarName: BarSchema.shape.name,
});

export type User = z.infer<typeof UserSchema>;
```

## ZodOpenApiSchemaObject usage

Every schema should satisfy `ZodOpenApiSchemaObject`. 
```ts
export const FooSchema = z.object({
    ...
}) satisfies ZodOpenApiSchemaObject;

```
