# 0002. Versioned, idempotent schema migrations for two drivers

- Status: Accepted
- Date: 2026-11-05

## Context

Tables are created from `packages/db/src/schema.ts` by two tools:
`drizzle-kit push` on Node and runtime DDL (`apps/web/src/hub/schema-ddl.ts`)
in the native apps. A fresh database therefore already has every column, but
users' existing databases (on disk or in OPFS on a phone) do not. Schema
patches used to be an ever-growing, unversioned list inside `ensureSchema()`.

## Decision

- `schema.ts` stays the single source of truth.
- `packages/db/src/migrations/` holds numbered migrations, applied in order by
  `runMigrations()` on every open (both drivers) and recorded in
  `schema_migrations`.
- Migration steps only use **idempotent** helpers (`addColumn` if missing,
  `createIndex` if not exists), because a fresh database may already match.
- Each migration runs in a transaction together with its bookkeeping row.

## Consequences

- Adding a column = edit `schema.ts` + add a migration. Never edit, renumber or
  reorder a shipped migration.
- Destructive changes (drop/rename) need a dedicated, carefully tested
  migration and an ADR.
