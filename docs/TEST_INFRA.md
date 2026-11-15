# Learning HUB — E2E Testing Infrastructure

## Overview

This document specifies the end-to-end (E2E) testing infrastructure for Learning HUB. The test harness implements an opaque-box, requirement-driven strategy verifying all external surfaces of the system without coupling tests to internal implementation details:

- **REST API Routes** (`apps/web/app/api/**`) — Next.js App Router route handlers invoked directly via Web Standard Request/Response contracts.
- **Terminal CLI** (`apps/cli/src/**`) — Subprocess execution of the terminal study assistant verifying CLI output formats, ASCII panels, and exit codes.
- **Model Context Protocol (MCP)** (`apps/mcp/src/**`) — Stdio JSON-RPC 2.0 transport client testing MCP tool registration, argument schema validation, and tool execution.
- **Database & Storage Layer** (`packages/db/src/**`) — SQLite pragmas (`foreign_keys = ON`, `journal_mode = WAL`), analytical views (`v_true_retention`, `v_daily_reviews`, `v_xp_daily`), and schema integrity.
- **Browser UI Smoke Suite** (`apps/web/tests/ui/**`) — Real headless Chromium driving the Next.js frontend, app shell, review flows, and backup restore via Playwright (`npm run test:ui`).

---

## Architecture & Framework

### Test Runner

- **Runner**: Vitest `v5.1.0` in Node.js environment.
- **Configuration**: `vitest.e2e.config.mjs` at the project root.
- **Execution Mode**: `fileParallelism: false` ensures strictly sequential test suite runs, preventing SQLite file lock contention on Windows while maintaining sub-second execution speeds per file.

### Process & Database Isolation

Each test file runs with zero mutation to the developer database (`data/learning-hub.db`):

1. **Pre-Test Checkpoint**: The base template database is WAL-checkpointed via `PRAGMA wal_checkpoint(TRUNCATE)`.
2. **Ephemeral Clone**: Before module imports execute, `tests/e2e/helpers/setup.ts` creates a unique isolated database file (`data/test-dbs/test-file-<pid>-<timestamp>-<rand>.db`).
3. **Environment Injection**: `process.env.LEARNING_HUB_DB` is set to the clone's absolute path, pointing `@learning-hub/db` and all child processes to the ephemeral database.
4. **Automated Teardown**: An `afterAll` hook closes database handles and purges the ephemeral `.db`, `-wal`, and `-shm` files.

---

## Directory Layout

```
tests/e2e/
├── helpers/
│   ├── setup.ts              # Global test file setup, DB cloning, and teardown
│   ├── test-db.ts            # Context factory for custom isolated SQLite instances
│   ├── api-client.ts         # Next.js App Router route caller (Request/Response bridge)
│   ├── cli-runner.ts         # Subprocess runner for `apps/cli/src/index.ts`
│   ├── mcp-client.ts         # Full JSON-RPC 2.0 stdio client for `apps/mcp/src/index.ts`
│   └── rows.ts               # Row verification and DB assertion utilities
├── tier1-features/           # Feature Coverage (happy path across every subsystem)
│   ├── db-integrity.test.ts
│   ├── api-decks-cards.test.ts
│   ├── api-review.test.ts
│   ├── api-notes-ideas-graph.test.ts
│   ├── api-focus-goals-habits.test.ts
│   ├── api-curriculum-analytics-reading.test.ts
│   ├── cli-commands.test.ts
│   ├── mcp-tools.test.ts
│   └── curriculum-agents.test.ts
├── tier2-boundaries/         # Boundary limits, negative values, corner cases
│   ├── boundary-validation.test.ts
│   ├── backup-roundtrip.test.ts
│   ├── sync-api.test.ts
│   └── import-apkg.test.ts
├── tier3-combinations/       # Pairwise cross-feature interactions & defect verifications
│   ├── cross-feature.test.ts
│   ├── world-economy.test.ts
│   ├── dialectic-flow.test.ts
│   ├── workload-rebalance.test.ts
│   ├── palace3d-crud.test.ts
│   └── images-flow.test.ts
└── tier4-scenarios/          # Complete real-world multi-step learner workflows
    ├── application-scenarios.test.ts
    └── ai-streaming.test.ts
```

---

## Test Tiers

### Tier 1: Feature Coverage

Validates the primary functional behavior of each subsystem:

- `db-integrity.test.ts`: WAL mode, foreign keys enforcement, analytical views, and table existence.
- `api-decks-cards.test.ts`: Decks CRUD, card multi-format authoring (Basic, Cloze, Typein, MCQ), bulk import (`PUT ?bulk=1`), card suspension, and deletion.
- `api-review.test.ts`: Review queue session builder (`GET /api/review`), FSRS review grading (`POST /api/review`), and retention/due forecast statistics (`GET /api/review/stats`).
- `api-notes-ideas-graph.test.ts`: Markdown notes with wikilinks, idea inbox capture, idea combinatorial evolution (`POST /api/ideas/evolve`), and graph rendering (`GET /api/graph`).
- `api-focus-goals-habits.test.ts`: WOOP goals, Pomodoro focus sessions, friction distraction logging, habits creation, and daily habit check-ins.
- `api-curriculum-analytics-reading.test.ts`: Curriculum course trees, lesson completion XP, learning analytics datasets, reading library ingestion, highlight extraction/triage, achievements catalog, and user settings.
- `cli-commands.test.ts`: Subprocess execution of `learning-hub` CLI: `capture`, `today`, `stats`, `quote`, and command panel.
- `mcp-tools.test.ts`: MCP stdio protocol validation: `idea_create`, `idea_search`, `note_create`, `review_stats`, `quote_random`, `card_generate`.

### Tier 2: Boundary & Corner Cases

Validates input sanitization, error handling, and resource limits:

- Missing / whitespace required strings (e.g. empty deck name, empty goal wish).
- Invalid card schemas (missing cloze markers, out-of-bounds MCQ correctIndex).
- Numeric bounds (focus minutes <= 0 or > 600, review limit clamping 1–100).
- HTTP error statuses: 400 Bad Request, 404 Not Found (non-existent IDs), 409 Conflict (duplicate deck names).
- Extreme payloads: 30,000+ character notes, KaTeX mathematical formulas (`\int_{-\infty}^{\infty} e^{-x^2} dx`), multi-byte Unicode, and emojis.

### Tier 3: Cross-Feature Combinations

Validates state transitions spanning multiple subsystems:

- **Review Cascade**: A single review call atomically updates Card FSRS metrics, appends Revlog entry, awards XP, updates Streak, and updates Elo rating/mastery events for associated skills.
- **Outliner Bullet-to-Card**: Bullet conversion links `noteId`, `bulletId`, and `cardId`, and re-conversion regenerates the card without duplication.
- **Knowledge Graph Interconnection**: Note creation with wikilinks forms bidirectional edges in the graph API.
- **Focus & Friction**: Completed focus sessions capture distraction friction events and award focus XP.
- **Regression Audits**: Pins the fixed hardening behaviors — streak persistence across review sessions, foreign-key cascade when deleting reading sources with attached highlights, and bullet-to-card content schema validation.

### Tier 4: Real-World Application Scenarios

Simulates realistic end-to-end user workflows:

1. **Accelerated Learner Lifecycle**: Deck creation -> Multi-format flashcard authoring -> Review session grading (Again, Good, Easy) -> FSRS interval progression -> Streak/XP growth -> Analytics review -> Achievements live check.
2. **Zettelkasten Research Synthesis**: Seed idea capture -> Cross-concept evolution into hybrid offspring -> Permanent concept note drafting -> Graph cluster verification.
3. **Deep Work & Distraction Defense**: WOOP goal setting -> Pomodoro session initiation -> Resisted distraction friction logging -> Session completion -> MCP focus summary verification.

---

## Test Execution Commands

```bash
# Run the entire E2E test suite (all tiers)
npx vitest run --config vitest.e2e.config.mjs

# Run a specific tier
npx vitest run --config vitest.e2e.config.mjs tests/e2e/tier1-features/
npx vitest run --config vitest.e2e.config.mjs tests/e2e/tier2-boundaries/
npx vitest run --config vitest.e2e.config.mjs tests/e2e/tier3-combinations/
npx vitest run --config vitest.e2e.config.mjs tests/e2e/tier4-scenarios/

# Run a specific test suite
npx vitest run --config vitest.e2e.config.mjs tests/e2e/tier1-features/api-review.test.ts

# Run the Playwright browser UI smoke suite
npm run test:ui
```

---

## UI Smoke Suite (Playwright)

The browser-level UI smoke suite tests high-level page navigation, shell loading, and core interactive flows in a headless Chromium instance:

- **Location**: `apps/web/tests/ui/smoke.spec.ts`
- **Execution Script**: `npm run test:ui` (delegated via root `package.json` to `@learning-hub/web`)
- **Server Lifecycle**: Playwright config automatically launches the Next.js production build (`next start -p 3000`) or development server, waiting on `http://localhost:3000` readiness before running tests.
- **CI Integration**: Wired into GitHub Actions workflow (`.github/workflows/ci.yml`) under the `ui-smoke` job, installing the Chromium browser binary and archiving test artifacts/screenshots on failure.
