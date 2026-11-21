# Learning HUB — Project Context

> **Autonomous Project Engineering System Discovery Report**
> **Audit & Discovery Timestamp:** 2026-11-17T00:52:00Z
> **Branch:** `main` @ `efa6970`
> **Repository:** `/root/projects/learning-hub`

---

## 1. Project Mission & Purpose

Learning HUB is a local-first, research-grounded, comprehensive self-learning platform engineered to maximize long-term retention and cognitive mastery. It synthesizes over 120 empirical findings from cognitive psychology, educational neuroscience, and learning science (spanning retrieval practice, the generation effect, Bayesian Knowledge Tracing, FSRS-6 spaced repetition, interleaving, teach-back mechanics, memory palaces, and physiological sleep consolidation) into an integrated software ecosystem.

Key strategic design philosophies:

1. **Local-First & Multi-Surface:** One shared brain, accessible via Next.js Web UI, native desktop/mobile shells (Tauri 2 on Windows/Android), Model Context Protocol (MCP) stdio interface for autonomous AI agents, a 58-command CLI, and a zero-dependency headless REST server.
2. **AI-Optional / Prompt-Transportable:** Full functionality with zero external API keys (`provider: 'none'`); every AI feature strictly provides an evidence-based manual mode alongside prompt transport envelopes.
3. **Single Canonical Review Pipeline:** Any surface interacting with review cards commits state through a single atomic transaction in `packages/db/src/review-service.ts`, ensuring zero drift across FSRS schedules, append-only logs (`revlog`), XP awards, streak tracking, and skill mastery.
4. **Agent Ergonomics:** Direct integration with AI coding assistants and autonomous agents through a unified MCP server providing 128 built-in domain tools and dynamic plugin hooks.

---

## 2. Technology Stack & Runtime Environments

| Layer                    | Technologies                                               | Specifications & Details                                                                   |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Runtimes**             | Node.js, Webview / Browser, Web Worker, Cloudflare Workers | Node.js `>=20` (engines specify `>=24`), Chromium / WebKit webviews, Cloudflare Workers    |
| **Languages**            | TypeScript, Rust, SQL, Bash                                | TypeScript 6.0.3 (side-by-side JS API) + TS 7.0 compiler; Rust 2021 (Tauri 2 backend)      |
| **Frameworks**           | Next.js 16 (App Router), React 19, Tailwind CSS 4          | Server Components + Client Islands; TanStack Query server-state cache, React local state   |
| **Database & ORM**       | SQLite (`better-sqlite3`), Drizzle ORM, OPFS SQLite WASM   | WAL pragmas enabled, 94 relational tables, 29 versioned idempotent migrations, FTS5 search |
| **Scheduling & Science** | `ts-fsrs` 6.0, Bayesian Knowledge Tracing, Glicko/Elo      | 21-parameter MAP optimizer, Desired Retention 0.9 default, BKT $P(\text{known}) \ge 0.95$  |
| **AI Integration**       | Vercel AI SDK 7 (`@ai-sdk/*`), Custom HTTP, Stdio MCP      | `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@modelcontextprotocol/sdk`       |
| **Testing & CI**         | Vitest 5.1, Fast-Check, Playwright, ESLint 10, Prettier 3  | 300+ test files, 4-tier opaque E2E suite with isolated SQLite database forks               |

---

## 3. Monorepo Structure & Package Topology

The repository is structured as an npm workspaces monorepo:

```
learning-hub/
├── packages/
│   ├── core/                  # Pure TypeScript domain logic (zero I/O, zero AI SDK imports)
│   ├── db/                    # Drizzle ORM schemas, 29 migrations, 47 repositories, review service
│   └── ai-adapters/           # Sole importer of @ai-sdk/*; provider registries and networkFetch
├── apps/
│   ├── web/                   # Next.js 16 Web application, route handlers, and Web Worker Hub
│   ├── server/                # Headless node:http REST server (zero web framework dependencies)
│   ├── mcp/                   # Model Context Protocol stdio server exposing 128 built-in domain tools
│   ├── cli/                   # Terminal interface with 58 built-in commands
│   ├── native/                # Tauri 2 native shell configuration (Windows & Android)
│   ├── worker/                # Cloudflare worker for multi-player rooms and boss battles
│   └── extension/             # Browser extension for web article ingestion and friction logging
├── plugins/                   # Dynamic runtime plugins (anki-bridge, card-linter, streak-guardian...)
├── curricula/                 # Standard LHCF curricula examples (JavaScript, SQL, Learning-to-Learn)
├── tests/e2e/                 # 4-tier opaque-box end-to-end integration test suite
└── docs/                      # Architectural decision records (ADRs), specifications, and research
```

### Dependency Architecture Rule

```
apps/*  ──>  packages/{core, db, ai-adapters}
packages/db  ──>  packages/core
packages/ai-adapters  ──>  packages/core (+ @ai-sdk/*)
plugins/*  ──>  packages/core only
```

- Strict isolation: `packages/core` never imports `better-sqlite3`, `fs`, `node:http`, or `ai`.
- Strict persistence: `packages/db` is the sole writer of the SQLite database.
- Runtime neutrality: Handlers under `apps/web/src/server/handlers` run identically in Node.js serverless and in browser Web Workers.

---

## 4. Current State & Recent Developments

### Recent Milestones (Merged PRs #3 – #6)

1. **Slamecka-Graf Generation Effect Engine (PR #6):** 4-tier generation ladder (stem completion, semantic anagram, reverse query, analogy synthesis) with real-time HUD and Levenshtein similarity scoring.
2. **Feynman Teach-Back & Rozenblit-Keil IOED Engine (PR #5):** Illusion of Explanatory Depth evaluation, automated simplification scoring, and Socratic reflection card generation.
3. **Metacognition Calibration & Rasch-Born Sleep TMR (PR #4):** Koriat-Bjork calibration curve, Brier score calculation, and slow-wave targeted memory reactivation queue planner.
4. **Interleaving Leitner Matrix (PR #3):** Visual cognitive load meter and Leitner box progression metrics.

### Key Invariants Verified

- **Append-Only Immutability:** `revlog`, `xp_events`, `friction_events`, and `elo_events` tables are strictly append-only (DELETE/UPDATE queries forbidden by architecture tests).
- **Idempotent Migrations:** Database migrations in `packages/db/src/migrations` use guarded checks and DDL cloning to prevent production regressions.
- **Zod Enforcement:** All HTTP endpoints, MCP tools, and import pipelines enforce strict schema validation.
