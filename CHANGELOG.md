# Changelog

All notable changes to Learning HUB are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is [SemVer](https://semver.org/).

## [0.1.0] — 2026-11-04

The first open-source release: the full platform (26 systems), one overhaul of the core hardening/engine work, and the open-source packaging.

### Baseline platform

- **Learning core** — FSRS-6 engine (ts-fsrs 6, desired retention 0.9) with 8 card formats (basic, cloze, stepwise MCQ, type-in, image occlusion, proof-step, grammar, sentence mining), 20-Rules card linter + Deck Doctor, interleaved sessions, pretest/cram modes, worked-example fading, hypercorrection queue, confidence ratings, Puzzle-Elo ladder, energy system, matching games, memory palaces + Major/PAO trainer, Feynman teach-back, Socratic tutor (guardrail ladder), incremental reading + highlight triage, canvas, knowledge graph.
- **Curriculum** — Track→Course→Unit→Lesson with backward design (Bloom verbs), prerequisite DAG gating, BKT mastery + Khan-style levels, mastery challenges, skill tree, AI course generator (topic or PDF import), exam countdown + mock exams + honest cram mode.
- **Human systems** — XP/levels, streaks with freezes/amulet/emergency saver, daily quests, white-hat achievements, WOOP goals + if-then plans, commitment contracts, habit loops + dopamine menu, focus mode with the friction gate (57 %-reduction mechanic), tab-switch leak logging, detox wizard, journal + weekly review, quotes, physiology tracker.
- **Agent access** — MCP stdio server (14 tools, 3 resources), REST API, headless REST server, CLI.
- Research baseline of ~120 studies distilled in [`docs/PLAN-RESEARCH.md`](docs/PLAN-RESEARCH.md).

### Core hardening & engine overhaul

- SQLite concurrency hardening: `busy_timeout`, `synchronous = NORMAL`, `wal_autocheckpoint`, enforced `foreign_keys = ON`; compound index on `cards(suspended, due)` plus foreign-key indexes; idempotent ON DELETE CASCADE migration for child tables (reading sources now cascade-delete their highlights).
- **Canonical review engine** — one shared `executeReview()` in `packages/db` runs FSRS scheduling, append-only `revlog`, XP, streak (existing current/best now preserved), Elo/BKT mastery and FSRS retrievability telemetry inside **one atomic `BEGIN IMMEDIATE` transaction**, consumed identically by Web, MCP, CLI and the headless server; `review.completed` is emitted on the event bus only after the commit.
- Standard transaction helpers (`withTransaction`, sync-only with a compile-time guard against async callbacks).
- Defect remediation across the stack: cloze/type-in validation, outliner bullet-to-card content schema, local-hour analytics, streak persistence, AI chat O(N²) message duplication, reading highlight triage IDs, course-completion achievement gating, unjournaled-day AI insight handling, review UI fixes, matching-game accuracy grading.
- Error boundaries (`error.tsx`, `global-error.tsx`, `not-found.tsx`), global command palette (Ctrl+K), Web Speech TTS, focus session reload recovery, Settings backup/restore UI.

### Extensibility & integrations

- **Plugin system** — typed event bus (`HubEventMap` catalog), `definePlugin` contract, loader with failure isolation and dedupe, MCP-tool and CLI-command contributions, folder + npm distribution; reference `plugins/example-echo`. See [`docs/plugins.md`](docs/plugins.md).
- **AI provider architecture** — `AIClient` port + registry in `packages/core` (zero AI SDK imports, test-enforced), adapters package as the only AI-SDK importer: `anthropic`, `openai`, `openai-compatible`, `ollama`, `custom-endpoint` (any HTTP service becomes a provider via a documented envelope), `none` as the default. **Prompt transport** (copy-paste any feature's prompt into any chatbot) and **test-enforced manual modes** for every AI feature. See [`docs/ai-providers.md`](docs/ai-providers.md).
- **Anki bridge** — `.apkg` / plain-text (TSV) / deck-JSON import with per-card validation, and Anki-importable `.txt` (cloze restored) + full-fidelity JSON export.
- **Universal backup** — live SQLite snapshot (`sqlite.backup`), full JSON archive export and validated restore.
- **Headless REST server** — the same brain over Node 22+ native `http` (`/health`, `/decks`, `/cards`, `/review`, `/review/batch`, `/today`, `/stats`, `/plugins`), localhost-only by default, with optional event webhooks (`LEARNING_HUB_WEBHOOKS`). See [`docs/api-server.md`](docs/api-server.md).
- **Weekly report** — deterministic metrics/weakest-cards/forecast/suggestions over real rows (local-day bucketed), AI-optional suggestions with the manual rule-based summary as fallback.
- MCP tool parity with the review service plus `system_health`, `card_search`, `deck_list`, `backup_trigger` diagnostics; CLI review parity and raw-mode cleanup on exit.

### Testing & tooling

- **Opaque-box E2E suite** (Vitest) across 4 tiers — feature coverage, boundary validation, cross-feature combinations, real-world scenarios — covering the REST API route handlers, the CLI as a subprocess, the MCP server over JSON-RPC stdio, and DB pragmas/views/integrity. Isolated per-file database clones, zero mutation of the developer DB. See [`docs/TEST_INFRA.md`](docs/TEST_INFRA.md).
- Core unit/property test suite (vitest + fast-check): FSRS golden + property tests, linter, review, math, language, memory, games, focus state machine, motivation, physio, analytics, ideas, curriculum, notes.
- Root `check` script (typecheck + lint + unit tests across workspaces), ESLint 9 flat config (`typescript-eslint` recommended, `no-explicit-any` as a warning), Prettier + EditorConfig, Husky pre-commit (lint-staged), `.env.example`, GitHub Actions CI (Node 22 / ubuntu-latest: typecheck → lint → unit tests → E2E → build) with issue/PR templates.
- TypeScript toolchain standardized on the TS 6 JS API (`@typescript/typescript6`, Microsoft's official side-by-side package for TS 7.0 projects): TypeScript 7.0 ships no JS API, which made the JS-API-based lint toolchain impossible on 7.0.2. `tsc`, the language service and `typescript-eslint` all resolve the same TS 6.0.3 API; typecheck passes across all six workspaces.

### Open-source packaging

- MIT license ([`LICENSE`](LICENSE)) on every manifest, CI workflow (Node 22: typecheck → lint → unit tests → E2E → build) with issue/PR templates, contributor docs ([`CONTRIBUTING.md`](CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md), [`SECURITY.md`](SECURITY.md)), rewritten README (badges, architecture diagram, AI-optional and plugin sections), reference documentation consolidated under [`docs/`](docs/) and the system design documented in [`ARCHITECTURE.md`](ARCHITECTURE.md). Point-in-time build logs removed from the repository (preserved in git history).

[0.1.0]: https://github.com/learning-hub/learning-hub/releases/tag/v0.1.0
