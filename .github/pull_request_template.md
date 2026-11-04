<!-- Title: <type>: <short summary> — feat|fix|docs|refactor|test|chore -->

## What changed and why

<!-- A short description: what this PR does and the motivation behind it.
     For behavior changes, explain the before/after. Link the issue it closes: -->

Closes #

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Learning-engine change (`packages/core` pure logic)
- [ ] Schema change (`packages/db` — additive columns only on existing tables)
- [ ] Plugin / AI provider (extension point — see `docs/plugins.md` / `docs/ai-providers.md`)
- [ ] Documentation
- [ ] Breaking change (fix or feature that would cause existing behavior to change)

## Code standards checklist

<!-- See CONTRIBUTING.md for details. Reviewers will ask for these. -->

- [ ] `tsc --noEmit` passes in every touched workspace (strict TS)
- [ ] New exported symbols carry JSDoc
- [ ] Inputs crossing a trust boundary (HTTP body/query, MCP args, plugin/AI replies) are zod-validated
- [ ] Multi-row writes go through `withTransaction` or the canonical review service
- [ ] AI features degrade gracefully: manual mode exists (if applicable)

## Tests

- [ ] Unit tests added/updated (`packages/core/tests`)
- [ ] E2E coverage added/updated (`tests/e2e/`) for new API/CLI/MCP surfaces
- [ ] `npm run check` passes locally
- [ ] `npm run lint` passes locally

## Docs

- [ ] Relevant `docs/*.md` updated
- [ ] `CHANGELOG.md` updated under *Unreleased* (if user-facing)
