# Project: Learning HUB — Production Hardening, Bug Remediation & Addons

## Architecture
Learning HUB is a full-stack personal learning acceleration platform with cognitive science grounding (FSRS-6, BKT, Leitner, Elo, Zettelkasten, Bloom's Taxonomy).
- **Workspace Architecture**: Monorepo using npm workspaces:
  - `packages/core`: Pure TypeScript domain logic (FSRS, cards, linter, curriculum, motivation, review, analytics, games). Zero side-effects.
  - `packages/db`: SQLite database layer via `better-sqlite3` and `drizzle-orm` in WAL mode, schemas, migrations, views, and repository helpers.
  - `apps/web`: Next.js 16 (Turbopack, App Router, React 19, Tailwind CSS, Lucide, KaTeX) web application and REST API endpoints.
  - `apps/mcp`: Model Context Protocol stdio server for external AI agents.
  - `apps/cli`: Interactive command-line interface for terminal-first study sessions and stats.
- **Data Flow**:
  - Web UI / CLI / MCP -> REST API / Shared Services -> Database (SQLite WAL).
  - Pure domain algorithms in `packages/core` compute scheduling, gamification math, and validations.

## Feature Inventory
| # | Feature / Work Item | Description | Milestone | Source |
|---|---------------------|-------------|-----------|--------|
| 1 | SQLite Pragma & Concurrency Hardening | Configure `busy_timeout = 5000`, `synchronous = NORMAL`, `wal_autocheckpoint = 1000` to prevent locked database crashes | M1 | survey_3 |
| 2 | Foreign Key Cascade Delete for Sources | Ensure `highlights` are deleted when parent `source` is deleted in `DELETE /api/reading` (DEF-004) | M1 | survey_2 |
| 3 | Database Schema Indexes & Optimization | Add missing compound index on `cards(suspended, due)` and foreign key indexes | M1 | survey_3 |
| 4 | Transaction Atomicity Helpers | Provide standard atomic transaction wrappers for multi-table writes (`review`, `curriculum`, `bulk_cards`) | M1 | survey_3 |
| 5 | Shared Canonical Review Engine | Centralize review processing (FSRS schedule, revlog, streaks, XP, Elo, mastery) into a shared service consumed by Web, MCP, CLI (DEF-005, Addon 5) | M2 | survey_2 & survey_3 |
| 6 | Cloze & Typein Validation Logic | Correct typein evaluation and answer verification for cloze cards (DEF-002) | M2 | survey_2 |
| 7 | Outliner Bullet-to-Card Validation | Fix single-line bullet conversion fallback to produce valid card content conforming to schema (DEF-009) | M2 | survey_2 |
| 8 | Analytics Local Hour Calculation | Correct time-of-day analytics to parse local hour instead of UTC string (DEF-014) | M2 | survey_2 |
| 9 | Anki Migration Bridge Core Parser | Implement robust TSV/CSV flashcard parser with cloze tag mapping in `packages/core/src/anki.ts` (Addon 11) | M2 | survey_3 |
| 10 | FSRS Retrievability Telemetry Helper | Calculate predicted retrievability at review time to activate calibration curves (Addon 10) | M2 | survey_3 |
| 11 | Review & Games Streak Persistence Fix | Read existing `current` and `best` streaks instead of resetting to 0 (DEF-001) | M3 | survey_2 |
| 12 | Chat Session $O(N^2)$ Duplication Fix | Store current messages array directly in `/api/ai/chat` instead of concatenating to full history (DEF-003) | M3 | survey_2 & survey_3 |
| 13 | Reading Highlights Triage API Fix | Return persisted highlight IDs from `POST /api/reading/highlights` to enable triage (DEF-008) | M3 | survey_2 |
| 14 | Course Completion Achievement Logic | Require at least 1 lesson exists before awarding course complete achievement (DEF-010) | M3 | survey_2 |
| 15 | Unjournaled Day AI Insight Fix | Ensure AI insight generated for unjournaled dates is saved or gracefully handled (DEF-013) | M3 | survey_2 |
| 16 | Universal Backup & Export API | Create `/api/backup` supporting live SQLite snapshot (`sqlite.backup`), full JSON archive export, and restore (Addon 7) | M3 | survey_3 |
| 17 | Deck Import API Endpoint | Add `/api/decks/import` supporting Anki TSV/CSV uploads (Addon 11) | M3 | survey_3 |
| 18 | Next.js Error Boundaries & 404 Pages | Implement `app/error.tsx`, `app/global-error.tsx`, and `app/not-found.tsx` with user recovery actions (Hardening 4) | M4 | survey_3 |
| 19 | Global Command Palette (Ctrl+K) | Implement `CommandPalette.tsx` using installed `cmdk` for navigation and quick-capture across all 20 pages (Addon 6) | M4 | survey_3 |
| 20 | Zero-Dependency Web Speech TTS | Add browser-native speech synthesis for card audio & reading highlights (Addon 8) | M4 | survey_3 |
| 21 | Review UI Cloze & Enter Key Fix | Fix cloze review evaluation display and prevent premature Grade 1 on Enter (DEF-002) | M4 | survey_2 |
| 22 | Matching Game Accuracy & Rating Fix | Calculate actual accuracy from misses and grade cards appropriately (DEF-007) | M4 | survey_2 |
| 23 | Reading Page Highlight Triage UI Fix | Connect reading triage UI buttons to valid highlight IDs (DEF-008) | M4 | survey_2 |
| 24 | Focus Session Reload Recovery & Timer Cleanup | Restore active focus session on page reload and fix timer interval teardown drift (DEF-012, Addon 9) | M4 | survey_2 & survey_3 |
| 25 | Settings Backup / Restore UI | Add backup download and JSON restore panel in Settings page (Addon 7) | M4 | survey_3 |
| 26 | Root Typecheck Build Script Fix | Update root `npm run typecheck` script to typecheck all workspaces properly (DEF-011) | M5 | survey_1 & survey_2 |
| 27 | MCP Tool Parity & Diagnostic Addons | Update MCP review tool to use shared review service; add `system_health`, `card_search`, `deck_list`, `backup_trigger` (DEF-005, Addon 12) | M5 | survey_2 & survey_3 |
| 28 | CLI Review Parity & Raw Mode Cleanup | Update CLI review to use shared review service; restore terminal raw mode on exit (DEF-005, DEF-006) | M5 | survey_2 & survey_3 |
| 29 | Comprehensive E2E Testing Suite (Tiers 1-4) | Opaque-box automated test suite covering all features and boundaries | M-E2E | user_req |
| 30 | 100% E2E Test Suite Pass & Adversarial Hardening (Tier 5) | Pass all E2E tests and perform white-box adversarial verification | M6 | user_req |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Database & Concurrency Hardening | SQLite pragmas, cascade deletes, schema indexes, transaction atomicity | none | DONE |
| M2 | Core Domain & Review Engine Unification | Shared review service, cloze/outliner fixes, Anki parser, analytics | M1 (contracts) | DONE |
| M3 | API Routes Remediation & Addons | Streak persistence, chat deduplication, reading/achievement fixes, backup & deck import APIs | M1, M2 | PLANNED |
| M4 | Web UI Resilience & High-Impact Addons | Error boundaries, CmdK palette, Web Speech TTS, focus recovery, UI bug fixes | M2, M3 | PLANNED |
| M5 | Multi-Interface Clients & Tooling Parity | Root typecheck script, MCP diagnostic tools & parity, CLI review parity & raw mode | M2, M3 | PLANNED |
| M6 | Final Verification & Adversarial Hardening | Pass 100% E2E tests (Phase 1), Tier 5 adversarial testing & audit (Phase 2) | M1, M2, M3, M4, M5, M-E2E | PLANNED |
| M-E2E | E2E Testing Track | Independent requirement-driven opaque-box test suite (Tiers 1-4) | none (parallel) | DONE |

## Interface Contracts
### `packages/db` ↔ API & Clients
- `db.transaction<T>(cb: (tx) => Promise<T>): Promise<T>`: Standard Drizzle SQLite transaction wrapper.
- `executeReview(payload: ReviewPayload): Promise<ReviewResult>`: Canonical review service in `packages/db/src/review-service.ts` or `packages/core`:
  - Input: `{ cardId: number, grade: Grade, timeMs?: number, today?: string }`
  - Atomically updates: `cards`, `revlog`, `streaks`, `xpEvents`, `eloEvents`, `mastery`.
  - Returns: `{ card: Card, revlog: Revlog, streak: StreakState, xpEarned: number, newElo?: number }`.

### `packages/core` ↔ Import / Export
- `parseAnkiDecks(input: string, format: 'tsv' | 'csv'): { name?: string, cards: Array<{ front: string, back: string, tags: string[] }> }`

### Web API ↔ Backup & Restore
- `GET /api/backup?format=sqlite`: Returns live SQLite file stream via `sqlite.backup`.
- `GET /api/backup?format=json`: Returns full JSON dump of decks, cards, revlogs, settings, streaks.
- `POST /api/backup/restore`: Accepts JSON dump or SQLite file with validation.

## Code Layout
- `packages/db/src/index.ts`: SQLite pragmas, connection pool, view registration.
- `packages/db/src/schema.ts`: Database schemas, foreign keys, indexes.
- `packages/db/src/review-service.ts`: Canonical atomic review execution service.
- `packages/core/src/anki.ts`: Anki TSV/CSV deck import parser.
- `packages/core/src/cards.ts`: Card content validation, cloze parsing, bullet conversion.
- `packages/core/src/analytics.ts`: Time-of-day analytics.
- `apps/web/app/api/**`: REST API endpoints.
- `apps/web/app/error.tsx`: Next.js segment error boundary.
- `apps/web/app/global-error.tsx`: Root layout error boundary.
- `apps/web/app/not-found.tsx`: Global 404 page.
- `apps/web/src/components/CommandPalette.tsx`: Global `cmdk` navigation & quick-capture dialog.
- `apps/web/src/lib/speech.ts`: Browser-native Web Speech API pronunciation helper.
- `apps/mcp/src/index.ts`: MCP server tools and resources.
- `apps/cli/src/index.ts`: Interactive terminal CLI.
- `tests/e2e/**`: Independent E2E test harness and test suites.
