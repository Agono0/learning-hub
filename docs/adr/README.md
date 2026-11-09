# Architecture Decision Records

Short documents that capture **why** the architecture is the way it is, so
future contributors (human or AI) don't undo a decision without knowing what
it protects.

| #                                               | Decision                                                                       | Status   |
| ----------------------------------------------- | ------------------------------------------------------------------------------ | -------- |
| [0001](0001-one-codebase-hub-worker.md)         | One codebase for web + native: runtime-neutral handlers, in-webview hub worker | Accepted |
| [0002](0002-versioned-idempotent-migrations.md) | Versioned, idempotent schema migrations for two drivers                        | Accepted |
| [0003](0003-curriculum-format-lhcf.md)          | A portable curriculum format (LHCF) any AI can produce                         | Accepted |

## Writing a new ADR

Copy the template below to `NNNN-short-title.md` (next number), fill it in,
add a row to the table, and commit it **with** the change it explains.

```md
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context

What forces are at play? What problem needs a decision?

## Decision

What we do, stated plainly.

## Consequences

What becomes easier, what becomes harder, what we must now keep true.
```
