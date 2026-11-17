# Learning HUB — Prioritized Master Roadmap

> **Autonomous Project Engineering System Roadmap**
> **Current Cycle:** 2026-11-17 Execution Cycle
> **Status:** All High-Priority Milestones Completed & Verified

---

## 1. Prioritization Matrix

| ID         | Priority | Category             | Status        | Summary                                                                                                                                        |
| ---------- | -------- | -------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **T-P0-1** | **P0**   | Correctness / Infra  | **Completed** | Resolve Vitest test & hook timeout limits across workspace configs (`apps/web`, `core`, `db`, `worker`).                                       |
| **T-P0-2** | **P0**   | Database / Setup     | **Completed** | Initialize SQLite database schema and seed data (`db:push`, `db:seed`) on working repository.                                                  |
| **T-P1-1** | **P1**   | Feature Completeness | **Completed** | Implement MCP tools for recent cognitive engines (`generation_ladder`, `feynman_eval`, `metacognition_eval`) in `apps/mcp`.                    |
| **T-P1-2** | **P1**   | Feature Completeness | **Completed** | Implement CLI commands for cognitive engines (`generation challenge`, `generation eval`, `feynman eval`, `metacognition stats`) in `apps/cli`. |
| **T-P1-3** | **P1**   | API Completeness     | **Completed** | Wire cognitive generation and Feynman evaluation endpoints into the headless REST server (`apps/server`).                                      |
| **T-P2-1** | **P2**   | Cognitive Bridge     | **Completed** | Bridge Deck Doctor linter with Generation Effect ladder to convert passive/flagged cards into active generation challenges.                    |
| **T-P2-2** | **P2**   | Verification & Build | **Completed** | Full system typecheck, linting, unit test pass across all workspaces, and production build verification.                                       |

---

## 2. Detailed Task Specifications

### T-P0-1: Test Suite Robustness & Hook/Test Timeouts

- **Problem:** Database-backed integration tests in `apps/web/tests/` and `packages/core/tests/media.test.ts` hit default Vitest 5s/10s timeout thresholds on PRoot/Arm64 filesystem environments when SQLite creates files and runs 27 migrations.
- **Root Cause:** Vitest configs in `apps/web/vitest.config.ts`, `packages/core/vitest.config.ts`, and `packages/db/vitest.config.ts` did not define `hookTimeout: 30000` and `testTimeout: 30000`, unlike `vitest.e2e.config.mjs`. In `media.test.ts`, unmocked `getActiveAIClientFromDb` triggers migration run without sufficient test timeout.
- **Proposed Solution:**
  1. Add `hookTimeout: 30000` and `testTimeout: 30000` to `apps/web/vitest.config.ts`, `packages/core/vitest.config.ts`, and `packages/db/vitest.config.ts`.
  2. In `packages/core/tests/media.test.ts`, isolate `getActiveAIClientFromDb` with explicit mock or ensure the unconfigured test passes with appropriate timeout.
- **Files Affected:**
  - `apps/web/vitest.config.ts`
  - `packages/core/vitest.config.ts`
  - `packages/db/vitest.config.ts`
  - `packages/core/tests/media.test.ts`
- **Dependencies:** None.
- **Acceptance Criteria:** Unit tests across `packages/core` and `apps/web` pass cleanly without timeout errors.
- **Required Tests:** `npm test --workspace @learning-hub/core`, `npm test --workspace @learning-hub/web`.

---

### T-P0-2: Database Schema & Seed Verification

- **Problem:** Fresh environment requires initialized `data/learning-hub.db` SQLite database with all tables, triggers, indexes, and seeded starter content.
- **Root Cause:** Fresh checkout.
- **Proposed Solution:** Execute `npm run db:push` followed by `npm run db:seed`. Verify SQLite file creation and WAL integrity.
- **Files Affected:** `data/learning-hub.db`
- **Dependencies:** T-P0-1.
- **Acceptance Criteria:** Database exists with 92 tables, starter quotes, courses, and achievements.
- **Required Tests:** `npm run check:scripts`.

---

### T-P1-1: Complete MCP Tooling for Cognitive Engines

- **Problem:** Recent cognitive science modules (Slamecka-Graf Generation Effect, Feynman Teach-Back IOED, Metacognition Calibration) exist in `packages/core` and `apps/web`, but AI agents accessing Learning HUB through MCP cannot use them.
- **Root Cause:** MCP tools were not created for these new modules when merged in PRs #4 – #6.
- **Proposed Solution:**
  1. Extend `apps/mcp/src/tools/cognitive.ts` with:
     - `generation_ladder`: Generate a generation challenge (stem completion, semantic anagram, reverse query, analogy synthesis) for a concept.
     - `generation_eval`: Evaluate a user's generated attempt against the target, compute Levenshtein similarity, and return retention multiplier.
     - `feynman_eval`: Evaluate a learner's explanation against an expert summary using Rozenblit-Keil IOED rubric and return Socratic reflection questions.
     - `metacognition_eval`: Calculate Koriat-Bjork calibration curve and Brier score for confidence ratings.
  2. Register tools in `apps/mcp/src/index.ts`.
- **Files Affected:**
  - `apps/mcp/src/tools/cognitive.ts`
  - `apps/mcp/src/index.ts`
- **Dependencies:** `packages/core`.
- **Acceptance Criteria:** Running the MCP server registers all 3 new tools with valid Zod input/output schemas.
- **Required Tests:** Vitest test in `apps/mcp` or e2e test suite.

---

### T-P1-2: Complete CLI Commands for Cognitive Engines

- **Problem:** Terminal users cannot invoke generation challenges, Feynman evaluation, or metacognition metrics via CLI.
- **Root Cause:** CLI commands under `apps/cli/src/commands/` do not cover these features.
- **Proposed Solution:**
  1. Create `apps/cli/src/commands/cognitive.ts` implementing:
     - `generation challenge`: Prints masked stem or scrambled anagram challenge to terminal.
     - `generation eval`: Grades user generation attempt and reports retention multiplier.
     - `feynman eval`: Evaluates teach-back explanation and prints simplification score and Socratic questions.
     - `metacognition stats`: Displays calibration and Brier score.
  2. Register commands in `apps/cli/src/index.ts`.
- **Files Affected:**
  - `apps/cli/src/commands/cognitive.ts`
  - `apps/cli/src/index.ts`
- **Dependencies:** `packages/core`.
- **Acceptance Criteria:** `learning-hub generation ...` and `learning-hub feynman ...` execute cleanly.
- **Required Tests:** CLI invocation tests.

---

### T-P1-3: Headless REST Server Routes for Cognitive Engines

- **Problem:** Headless REST server (`apps/server`) has no endpoints for generation effect challenges or Feynman evaluation.
- **Root Cause:** `apps/server/src/routes.ts` lacks route mappings for these capabilities.
- **Proposed Solution:**
  Add route handlers in `apps/server/src/routes.ts`:
  - `POST /cognitive/generation/challenge`
  - `POST /cognitive/generation/eval`
  - `POST /cognitive/feynman-eval`
- **Files Affected:** `apps/server/src/routes.ts`.
- **Dependencies:** `packages/core`.
- **Acceptance Criteria:** REST requests to these endpoints return 200 with validated responses.
- **Required Tests:** Headless server test suite.

---

### T-P2-1: Deck Doctor & Generation Ladder Bridge

- **Problem:** When Deck Doctor flags cards that have high lapse rates or low retrieval difficulty, there is no direct path to convert them into high-multiplier generation effect challenges.
- **Root Cause:** Disconnected features.
- **Proposed Solution:**
  Add a helper function in `packages/core/src/doctor.ts` or `packages/core/src/generation/` that inspects a card and creates generation ladder challenges directly from card questions and answers.
- **Files Affected:** `packages/core/src/doctor.ts`, `packages/core/src/generation/index.ts`.
- **Dependencies:** `packages/core`.
- **Acceptance Criteria:** Flagged cards can be transformed into generation effect challenges.
- **Required Tests:** `packages/core/tests/generation.test.ts`.

---

### T-P2-2: Full System Check & Production Build Verification

- **Problem:** Ensure the entire monorepo is in a 100% green, production-ready state across all packages and apps.
- **Root Cause:** Continuous quality assurance.
- **Proposed Solution:**
  1. Run `npm run typecheck` across all workspaces.
  2. Run `npm run lint`.
  3. Run `npm run check:scripts`.
  4. Run `npm test` across all workspaces.
  5. Run `npm run build`.
- **Files Affected:** Monorepo-wide.
- **Dependencies:** T-P0-1 through T-P2-1.
- **Acceptance Criteria:** Zero type errors, zero lint errors, 100% passing test suites, successful production build.
