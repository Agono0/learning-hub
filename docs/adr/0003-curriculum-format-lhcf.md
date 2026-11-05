# 0003. A portable curriculum format (LHCF) any AI can produce

- Status: Accepted
- Date: 2026-11-05

## Context

Learners want to say "teach me X" to any AI (ChatGPT, Claude, Gemini, a local
model) and get a structured course they can study the way Coursera or
Hyperskill teach: theory, worked examples, varied practice, projects,
prerequisites, progress and certificates. The previous course schema had
lesson titles only, no theory, no stable ids (re-imports duplicated courses)
and four quiz types.

## Decision

- Define **LHCF** — the Learning HUB Curriculum Format — as a versioned zod
  schema in `packages/core/src/curriculum/` and publish it as JSON Schema
  (`docs/curriculum/lhcf.schema.json`).
- Accept it as **JSON, YAML or Markdown** (front-matter + heading convention);
  all three parse to the same canonical object and share one validator with
  human-readable, path-addressed errors.
- Every node has a stable **slug**; import is an **upsert**, so re-importing an
  improved version updates the course instead of duplicating it.
- Exercises use the practice-engine types and become real cards (FSRS + BKT),
  so studying a course feeds the same memory and mastery models as everything
  else.
- Ship a copy-paste **prompt template** that makes any AI emit valid LHCF.

## Consequences

- The format is a public contract: additive changes only within a major
  `version`; breaking changes bump it and add a converter.
- Import is a trust boundary: content is validated, size-limited, and rendered
  without raw HTML.
