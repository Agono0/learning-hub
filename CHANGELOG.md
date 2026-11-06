# Changelog

All notable changes to Learning HUB are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is [SemVer](https://semver.org/).

## [Unreleased]

### M18 "Omniscient" — All-in-One Max-Out

- **Search Everything** — FTS5 across 17 knowledge surfaces (12 new: journal, quotes, reading sources, projects, mindmaps, canvases, palaces, goals, habits, quick captures, SQ3R, tutor chats) + a full-screen `/search` page with kind filters + an AI `nl-search` planner that turns a question into keyword queries (manual mode: keyword split).
- **Intelligence & Insight** — real on-device embeddings (MiniLM via transformers.js, nothing leaves the machine) over cards/notes/lessons/highlights/journal with a Settings index builder, "Related content" panels, HUD semantic search powered by the real model (dummy `sin()` vectors removed); a cross-metric insights engine (sleep/exercise/mood × retention) with honest small-N labels; Tutor 2.0 (lesson context, past sessions, AI session summary → gap cards with bulk save).
- **Event engine & cohesion** — all 10 lifecycle events now emit (6 were dead); guild XP bridge distributes committed review XP; unified activity timeline on the dashboard; streak.broken fires a local notification.
- **Offline & platform** — production service worker (app shell + API cache + offline page), PNG icon set + installable manifest, haptic grading on native, fullscreen + wake-lock during Max Focus, web-push subscription plumbing (Settings panel + `push_subscriptions` table).
- **Real online** — raids connect to the actual Cloudflare Durable Object WebSocket (offline mode is now explicitly labelled), ECDSA P-256 device identity with signed-challenge registration (worker verifies; imposters 401), friend leaderboard gist sync (`updateFriendSync` finally has callers), `npm run worker:deploy`.
- **Surfaces & ecosystem** — reorderable dashboard widget registry with Activity/Insights widgets; ⌘K command actions (start review/focus, capture via HUD) + plugin-contributed actions/widgets via `ctx.paletteActions`/`ctx.dashboardWidgets`; four first-party plugins (`pomodoro-soundscape`, `anki-bridge`, `card-linter`, `streak-guardian`); Canvas pan/zoom; per-card read-aloud (TTS).
- **Reach** — live `/api/calendar.ics` feed (exams + study plan + due forecast), three new reminder kinds (idea resurfacing, friction check-in, exam countdown) with db-backed facts, and a schedulable weekly digest (`npm run digest -w @learning-hub/server`) posting to webhooks + push.

### Forest World 2.0 (Visual Overhaul, Marketplace Companions & Dynamic Themes)

- **3D visual overhaul** — filmic ACES tone mapping, three-point light rig (hemisphere bounce + shadow-casting sun + fill), shader gradient sky dome, drifting clouds, exponential-feel fog, vertex-colored terrain (grass noise fields + cliff strata), a shimmering pond with wooden dock and reeds, glowing path lanterns, instanced flowers/grass tufts/mushrooms, subtle bloom on emissives (high quality), and orbit-camera controls (drag to rotate, scroll to zoom) in diorama mode. Trees sway in the wind via a shared vertex-shader injection; willow droops, sakura glows, crystal pines refract.
- **Marketplace companions & decor** — 8 low-poly pets (cat, turtle, fox, moon bunny, owl, axolotl, grove spirit, ember dragonling) that follow the scholar with per-species locomotion (walk/hop/fly/drift), and 8 island structures (lantern, bench, wishing well, study tent, windmill with turning sails, zen pavilion, focus monument, scholar's archway) that spawn at deterministic island spots via `getDecorPlacement()` in core — no placement storage needed.
- **Item preview portal** — every marketplace card opens a live 3D turntable on a collector's pedestal: studio three-point lighting, rarity glow ring, drag-to-spin with flick momentum, category-filtered shop with rarity-styled cards.
- **Dynamic themes** — six color palettes (Calm default, Forest, Ocean, Sunset, Blossom, Midnight) re-skin the entire app through runtime CSS variables (`@theme inline` + `color-mix` ramps + `--hub-*` dark surfaces) and drive the 3D world's mood (Calm → soft morning … Midnight → starlit night with fireflies). Pre-paint init script prevents flashes; picker lives in Settings → Color palette.
- **Silent by default** — the world no longer auto-plays a constant oscillator tone (it read as a buzz); the birds soundscape is now occasional two-note warbles with silence between, opt-in via the sound toggle.

### Full-Spectrum Upgrade (FSRS-6 Optimizer, Free E2EE Cloud Sync, Multi-Format Reading & SQL Sandbox)

- **FSRS-6 Weight Optimizer, Per-Deck Presets & Append-Only Undo** — pure 21-parameter MAP coordinate-descent optimizer + Log-Loss/RMSE calibration evaluator (`packages/core/src/fsrs-optimizer.ts`), per-deck `desired_retention` and `fsrs_weights` overrides, append-only `revlog_undos` history preservation, blur-aware 60s-capped recall timer, and live `<10m · 2d · 6d · 15d` interval badges on review grade buttons.
- **Non-Destructive Smart Merge & Free Cloud Sync** — `mergeBackup()` (`packages/db/src/sync.ts`) union-merges append-only logs, replays FSRS history on concurrent reviews via `rescheduleCardHistory`, applies `updated_at` LWW + tombstones, and strictly strips device-local secrets (`ai_api_key`, `ai_headers`, `sync_configs`). Runtime-neutral adapters over `networkFetch` for **Dropbox**, **GitHub (Secret Gist / Private Repo)**, **Google Drive**, and **WebDAV**, with optional Web Crypto `AES-256-GCM` (`PBKDF2-SHA256`, 210k iterations) passphrase E2EE.
- **Multi-Format Reading, SQ3R Mode & In-App Starter Library** — ingest **PDF**, **EPUB** (`fflate`), **Web Articles**, **YouTube Captions**, and **Markdown/TXT/Paste**; 5-step guided **SQ3R** reading workflow with closed-book Recite and 1-click FSRS flashcard minting; built-in offline Starter Library (`learning-how-to-learn`, `javascript-functions`, `sql-essentials`, 70+ quotes, Major/PAO mnemonics) for zero-CLI setup on Windows/Android OPFS.
- **Calm Navigation, Onboarding Wizard, Live Themes & UI Sweep** — progressive collapsible sidebar preserving all 25 routes, visible mobile/desktop Search (`⌘K`) and 1-click Cloud Sync controls, skippable 2-minute First-Run Onboarding Wizard, live Dark/Light/System theme sync with anti-FOUC initialization, `remark-gfm` Markdown tables/tasklists, shared `Toast` notifications (zero `window.alert`/`window.prompt`), and calm loading skeletons.
- **Google Gemini Adapter, Live SQL Sandbox, AI Rubric Coach & MCP/CLI Parity** — `@ai-sdk/google` (`gemini-2.5-flash`) + 1-click free/local presets (Gemini, Groq, OpenRouter, DeepSeek, Ollama); live in-memory `sqlite-wasm` SQL sandbox with result-table rendering for `code` (`sql`) exercises; optional `freetext-rubric` AI Rubric Coach + manual `<TransportPanel>` fallback; static PWA `manifest.webmanifest`; and `search`, `fsrs_optimize`, `starter_install`, and `cloud_sync` across MCP and CLI.

The expansion build: a curriculum you can import from any AI, a 12-type practice engine, the learning-science boosters, study companions, and the knowledge tools.

### Curriculum v2 (LHCF)

- **LHCF v1 format** — a public, versioned contract any AI can produce (JSON, YAML or Markdown), with a lenient normalizer (auto-repairs), plain-language validation with fixes, slug-keyed idempotent import and full-fidelity export. Generated docs stay current via a drift test (`npm run docs:curriculum`). See [`docs/curriculum/PROMPT.md`](docs/curriculum/PROMPT.md).
- **Courses in the app** — catalog, import wizard (paste or drop a file, dry-run preview), course page with soft prerequisite locks, lesson player (retrieval-first key terms, worked examples, reflections), course exams, certificates.
- **Agent surfaces** — MCP curriculum tools and `curriculum import|list|prompt` CLI commands, covered by E2E through both.

### Practice engine

- **12 exercise types** (`mcq multi truefalse numeric typein cloze ordering parsons matching categorize freetext code`) with pure server-side graders, typo-tolerant text matching, a sandboxed JS code runner, and a practice catalog that feeds the LHCF prompts. Exercises are `exercise`-format cards — one grading path (`executeReview`).

### Review session

- Exercise cards render and grade inside the daily review (the practice endpoint records them; no double grading).
- **Successive relearning** (Rawson & Dunlosky 2011): a configurable retrieval criterion (1–4 correct recalls) with SPACED re-queue — a failed card repeats with at least one other card in between until the criterion is met.
- Mixed practice: a course page button builds a whole-course session (cram semantics) interleaved across lessons.
- Last-card mistakes now extend the session instead of dropping the retry.

### Learning-science boosters

- Zeigarnik "pick up where you left off" open loops on the dashboard.
- Cornell-notes supertag that seeds the Pauk page layout.
- Leitner box view (histogram + per-card chips) over the FSRS state.
- Cepeda optimal-gap window (10–20 % of the retention interval) on the exam countdown plan.
- Calibration trainer: the confident-wrong drill list on Analytics.
- Dual-coding images on basic cards (attach, render, validate) and varied front phrasings (desirable-difficulty rotation per exposure).
- The full technique catalog with origins, evidence and code links: [`docs/learning-science.md`](docs/learning-science.md).

### Study companions

- **Today agenda engine** — prioritized, honest ("everything done → rest consolidates it"), replaces the static daily loop.
- **Study planner** — weekly template from real course progress + exam pressure, rest-day aware, exported as an `.ics` calendar file; new `study_plans` table.
- **Weakness radar** — weakest skills (attempts-gated), leeches, confident-wrong count, on the Skills page.
- **Learning-path recommendations** from the skill DAG (most downstream impact first).
- **Notifications** — bell with a needs-attention list; opt-in Tauri-native reminders (once per day, dynamic plugin import).
- Course-centric achievements: `courses_3`, `first_certificate`, `exam_aced`.

### Knowledge tools

- **Global search** — FTS5 across notes, cards, lessons, highlights and ideas (migration `003` with sync triggers + backfill, honest LIKE fallback), driven from a **⌘K / Ctrl+K command palette** (cmdk) that also jumps to any page.
- **Glossary** — per-course key-term list linking each term to its lesson and to the card that tests it.
- **Sentence mining** — text → cloze card drafts from notes, highlights or pasted material; AI when configured, an honest heuristic (longest load-bearing word) as the manual fallback; preview-then-save into any deck.
- **Course mind map** — units → lessons → skills with the course's prerequisite chain, on the course page.

### Internal

- Migration runner gains `fts-search` (003); test DDL-cloning helpers exclude FTS internals (backups whitelist drizzle tables, so FTS never enters a backup).
- Stale agent-name comments removed from headers; `docs/HANDOFF.md` retired into this changelog; docs indexed in [`docs/README.md`](docs/README.md).

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
