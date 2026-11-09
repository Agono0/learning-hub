# Learning HUB — Master Fix Plan (Full Project Audit, 2026-11-08)

> **Document control**
>
> - Produced: 2026-11-08
> - Audit basis: branch `feat/cognitive-expansion` @ `99aca25` ("docs: document E-Ink Zen mode, haptics, and review cognitive telemetry"), clean working tree
> - Scope: every workspace — `packages/core`, `packages/db`, `packages/ai-adapters`, `apps/web`, `apps/native`, `apps/mcp`, `apps/cli`, `apps/server`, `apps/worker`, `apps/extension`, `plugins/`, `scripts/`, `docs/`, `.github/`
> - Method: three parallel exhaustive audits (unfinished-work marker scan; feature-surface cross-check; data-layer/tests/native/infra audit), full details in §2
> - Status legend used throughout: `P0` = correctness (must fix first) · `P1` = half-wired feature · `P2` = missing feature surface · `P3` = test coverage debt · `P4` = docs/CI/env hygiene
> - This document is the execution blueprint for phases P0→P4. Each finding (F-01 … F-26) has its own spec in §5 with problem, evidence, root cause, fix design, touched files, test plan, acceptance criteria, risks, and estimate.

### Reading paths (how to consume this document by role)

- **You have 10 minutes:** §1.1 verdict → §4 index → §31 metrics table.
- **You are reviewing the plan:** §5 specs for the findings you care about → §33 rejected alternatives → §30 review guide.
- **You are implementing a phase:** §6.2 sequence → the runbooks (§13) for your commits → §14/§16 test specs → Appendix M cross-reference.
- **You are implementing one finding:** §5 spec first (reasoning) → its runbook (steps) → §19 sketch if it's a major module → §28 checklist before calling it done.
- **You are extending Learning HUB later:** §24 glossary → §36 transfer notes → §26 maintenance → §38 to re-audit.
- **You are auditing whether the audit was right:** §2 methodology → §38 to reproduce → Appendix Z metadata.

### Document revision history

| Rev | Date       | Change                                                                                 |
| --- | ---------- | -------------------------------------------------------------------------------------- |
| 1.0 | 2026-11-08 | Initial full audit plan: 26 findings, 44-commit roadmap, 40 sections, appendices A–AH. |

### Citation

If you reference this plan in commits, issues, or reviews: `docs/plans/MASTER-FIX-PLAN.md` §<section>, finding F-<id>. The finding IDs (F-01…F-26) and phase names (P0–P4) are the stable vocabulary; commit numbers shift if the sequence is amended (the runbook index, §41, is regenerated with any amendment). The plan supersedes nothing — it complements `docs/plan-M19-M21.md`, which remains the milestone tracker while this document owns the audit-fix backlog.

### Appendix AH — decision log (provenance of the plan's judgment calls)

Decisions that shaped this plan, with their source, so future readers know what was chosen and by whom:

| #   | Decision                                        | Chosen                                                                                                            | Alternative rejected                           | Source                                               |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| D1  | What happens after the plan document is written | Execute all phases P0→P4 on the current branch                                                                    | plan-only; plan+P0-only                        | user, 2026-11-08 (scoped Q&A)                        |
| D2  | The nonexistent "Deck Doctor" (F-12)            | Build it (linter-driven deck health + one-click fixes)                                                            | remove the README claim                        | user, 2026-11-08 (scoped Q&A)                        |
| D3  | `/api/audio/sessions` (F-08⑤)                   | Remove the route (no user story; purpose-built siblings cover audio)                                              | build a generic UI                             | this plan (engineering judgment, documented in F-08) |
| D4  | Haptics default (F-06)                          | Keep shipped default ON, add opt-out                                                                              | flip to default-off                            | this plan (don't silently change shipped behavior)   |
| D5  | MCP/CLI surface breadth (F-14)                  | Verb-minimal tools (1–3/domain), read-only for realtime domains                                                   | expose every web operation                     | this plan (agent ergonomics; §33)                    |
| D6  | Repo extraction granularity (F-13)              | 9 batches, one commit each                                                                                        | single mega-commit; skip-and-duplicate-for-MCP | this plan (reviewability; §33)                       |
| D7  | Enforcement scope (F-24)                        | Structural guards for rules 7/8 + scoped fetch ban; rules 4/5/6/10/11/12 stay review-enforced, honestly tabulated | custom AST lint rules for all 13               | this plan (false-positive risk; §33)                 |

Engineering-judgment decisions (D3–D7) are revisitable: each names its rejected alternative and the reasoning, so re-litigating them costs one read, not an archaeology dig.

### The numbers at a glance

| Dimension                            | Count                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------- |
| Findings (F-01…F-26)                 | 26                                                                         |
| Planned commits                      | 44                                                                         |
| Phases (P0 correctness → P4 hygiene) | 5                                                                          |
| Sections in this document            | 43 (incl. reading paths, decision log)                                     |
| Appendices                           | 35 (A–AH, incl. sub-appendices)                                            |
| New test artifacts planned           | ~50 (≈330 asserted cases)                                                  |
| New files (code+tests+docs)          | ~70                                                                        |
| Modified files                       | ~60                                                                        |
| Deleted files                        | 3                                                                          |
| Migrations added                     | 1 (027 haptics)                                                            |
| Repos extracted                      | 9 batches / 24 modules                                                     |
| New MCP tools                        | ~18 across 12 domain modules                                               |
| New CLI commands                     | ~12                                                                        |
| Core suites added                    | 7                                                                          |
| Handler suites added                 | ~16                                                                        |
| E2E flow files added                 | 9                                                                          |
| UI surfaces added                    | 7 (doctor, stats, share, distractions, remedial, tips strip, manual panel) |
| Doc corrections                      | 14 (Appendix L)                                                            |
| CI additions                         | 4 (Playwright, commitlint, prettier, fetch ban)                            |
| Estimated effort                     | ~21 working days (single implementer; §32)                                 |

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Audit methodology](#2-audit-methodology)
3. [System inventory](#3-system-inventory)
4. [Findings index](#4-findings-index)
5. [Detailed fix specifications (F-01 … F-26)](#5-detailed-fix-specifications)
6. [Phased roadmap and commit sequence](#6-phased-roadmap-and-commit-sequence)
7. [New feature specifications](#7-new-feature-specifications)
8. [Database and migration plan](#8-database-and-migration-plan)
9. [Test plan](#9-test-plan)
10. [CI and rule-enforcement plan](#10-ci-and-rule-enforcement-plan)
11. [Risk register](#11-risk-register)
12. [Verification checklist](#12-verification-checklist)
13. [Implementation runbooks (commit-by-commit)](#13-implementation-runbooks-commit-by-commit)
14. [Test-case specifications](#14-test-case-specifications)
15. [Per-domain implementation reference (F-14 batches)](#15-per-domain-implementation-reference-f-14-batches-c1c4)
16. [Remaining handler test specifications](#16-remaining-handler-test-specifications-f-16-folders-not-enumerated-in-14)
17. [Execution protocol for the implementing agent](#17-execution-protocol-for-the-implementing-agent)
18. [Historical context](#18-historical-context-how-the-gaps-arose)
19. [Code sketches for the major new modules](#19-code-sketches-for-the-major-new-modules)
20. [UI wireframes (new surfaces)](#20-ui-wireframes-new-surfaces)
21. [Manual validation scenarios](#21-manual-validation-scenarios-human-test-scripts)
22. [Agent validation sessions (MCP/CLI acceptance)](#22-agent-validation-sessions-mcpcli-acceptance-post-f-14)
23. [File-level change map (impact analysis)](#23-file-level-change-map-impact-analysis)
24. [Glossary](#24-glossary)
25. [FAQ (reviewer questions)](#25-faq-questions-a-reviewer-will-ask)
26. [Post-execution maintenance plan](#26-post-execution-maintenance-plan)
27. [Detailed walkthroughs for the three biggest refactors](#27-detailed-walkthroughs-for-the-three-biggest-refactors)
28. [Master acceptance checklist (per finding)](#28-master-acceptance-checklist-per-finding)
29. [Commit message catalog](#29-commit-message-catalog-commitlint-ready)
30. [Review guide](#30-review-guide-for-the-human-reviewing-the-p0p4-prs)
31. [Definition of done, with metrics](#31-definition-of-done-with-metrics)
32. [Execution schedule (day-by-day)](#32-execution-schedule-day-by-day)
33. [Alternatives considered and rejected](#33-alternatives-considered-and-rejected)
34. [Traceability — findings to AGENTS.md rules](#34-traceability--findings-to-agentsmd-rules)
35. [Severity model](#35-severity-model-how-p0p4-and-highmediumlow-were-assigned)
36. [Knowledge-transfer notes](#36-knowledge-transfer-notes-for-whoever-continues-this-work)
37. [Post-plan backlog (explicitly deferred)](#37-post-plan-backlog-explicitly-deferred-with-reasons)
38. [How to re-run the audits](#38-how-to-re-run-the-audits-repeatable-sweep)
39. [Branch timeline](#39-branch-timeline-context-for-reviewers)
40. [Audit artifact index](#40-audit-artifact-index-where-every-audit-output-lives-in-this-document)

- [Appendix A — unfinished-work marker scan inventory](#appendix-a--unfinished-work-marker-scan-inventory)
- [Appendix B — pages ↔ endpoints matrix](#appendix-b--pages--endpoints-matrix)
- [Appendix C — AI feature matrix](#appendix-c--ai-feature-matrix)
- [Appendix D — exercise type matrix](#appendix-d--exercise-type-matrix)
- [Appendix E — core domain ↔ persistence ↔ host matrix](#appendix-e--core-domain--persistence--host-matrix)
- [Appendix F — environment variable audit](#appendix-f--environment-variable-audit)
- [Appendix G — full schema inventory (92 tables)](#appendix-g--full-schema-inventory-92-tables-verified-by-grep-at-audit-time)
- [Appendix H — migration registry (26)](#appendix-h--migration-registry-26-verified-against-migrationsindexts)
- [Appendix I — handler inventory (143)](#appendix-i--handler-inventory-143-verified)
- [Appendix J — MCP tools, CLI commands, server routes](#appendix-j--mcp-tools-cli-commands-server-routes)
- [Appendix K — test file inventory](#appendix-k--test-file-inventory-at-audit-time)
- [Appendix L — doc-drift fixes, line-by-line](#appendix-l--doc-drift-fixes-line-by-line)
- [Appendix M — finding ↔ commit ↔ test cross-reference](#appendix-m--finding--commit--test-cross-reference)
- [Appendix N — execution session log template](#appendix-n--execution-session-log-template)
- [Appendix O — test-file creation manifest](#appendix-o--test-file-creation-manifest)
- [Appendix P — audit raw data: marker scan per-file tables](#appendix-p--audit-raw-data-marker-scan-per-file-tables)
- [Appendix Q — docs inventory with drift status](#appendix-q--docs-inventory-with-drift-status)
- [Appendix R — schema group commentary](#appendix-r--schema-group-commentary)
- [Appendix S — representative route traces](#appendix-s--representative-route-traces-the-wiring-pattern)
- [Appendix T — per-page UI audit (43 pages)](#appendix-t--per-page-ui-audit-43-pages)
- [Appendix U — linter rule reference](#appendix-u--linter-rule-reference-deck-doctor-inputs)
- [Appendix V — transport seams reference](#appendix-v--transport-seams-reference-rule-1s-toolkit)
- [Appendix W — plugin system reference](#appendix-w--plugin-system-reference-context-for-parity-work)
- [Appendix X — current CLI command reference](#appendix-x--current-cli-command-reference-the-13-parity-baseline)
- [Appendix Y — deployment & host matrix](#appendix-y--deployment--host-matrix)
- [Appendix Z — audit metadata & reproducibility](#appendix-z--audit-metadata--reproducibility)
- [Appendix AB — copy deck (exact UI strings)](#appendix-ab--copy-deck-exact-ui-strings-for-new-surfaces)
- [Appendix AC — SuperMemo's 20 Rules ↔ linter status](#appendix-ac--supermemos-20-rules--linter-implementation-status)
- [Appendix AD — XP economy reference (post-F-03)](#appendix-ad--xp-economy-reference-post-f-03)
- [Appendix AE — schema column quick reference (parity domains)](#appendix-ae--schema-column-quick-reference-parity-domains-verified)
- [Appendix AF — CI workflow inventory](#appendix-af--ci-workflow-inventory-current--post-plan)
- [Appendix AG — repository top-level layout](#appendix-ag--repository-top-level-layout-orientation-map)

---

## 1. Executive summary

### 1.1 Verdict

Learning HUB is, at the code level, in an unusually disciplined state:

- **Zero TODO/FIXME comments in shipping code.** The only TODOs in the entire repo live in (a) Tauri's auto-generated Android project (`apps/native/src-tauri/gen/`, regenerated by Tauri, not hand-maintained) and (b) the `new:feature` scaffolder templates (`scripts/new-feature.mjs`), where TODOs are the _product_ — the scaffolder intentionally emits them for the developer to replace.
- **Zero `as any`, zero `@ts-ignore`, zero `eslint-disable` without a justified inline reason** (one: `packages/db/src/driver/sqlite-wasm.ts:495`, `no-this-alias` disabled with an explanatory comment mirroring better-sqlite3's transaction shape; and one intentional `@ts-expect-error` in a negative type test, `packages/db/tests/review-service.test.ts:471`).
- **Zero skipped/focused tests** (`describe.skip`, `it.skip`, `it.only`, `test.todo` — none exist anywhere).
- **Zero "not implemented" stubs**, zero `throw new Error('TODO')` patterns.
- **143/143 API handler files are registered** in `apps/web/src/hub/handlers-registry.ts`, each has a 1:1 `app/api/**/route.ts` shim, and both directions are test-enforced (`apps/web/tests/hub-registry.test.ts`, `tests/route-safety.test.ts`).
- **Migrations 001–026 are contiguous**, all registered in order in `packages/db/src/migrations/index.ts`, runner enforces strictly increasing ids (`packages/db/src/migrations/runner.ts:99`).
- **Append-only rule (AGENTS.md rule 8) holds everywhere** — the undo path correctly uses `revlog_undos` tombstones instead of ever touching `revlog`.
- **All 12 exercise types** have schema + `grade()` + renderer + tests (compile-time-complete via the `INPUTS` map in `apps/web/src/ui/exercises/inputs.tsx:727-740`).
- **All 14 AI features** have a prompt, a handler, and a manual mode, with `assertEveryFeatureHasManualMode()` test-enforced (`packages/core/src/ai/manual.ts:258`).
- **Rule 1 (no raw fetch in UI) currently holds** — an exhaustive sweep of `apps/web/src` + `apps/web/app` excluding transport/server/hub found only react-query `refetch()` false positives.

However, the audit did find real work — none of it marked with a TODO, because the repo's discipline means incompleteness hides in _structure_ rather than comments. **26 findings** were confirmed, in six categories:

| Category                     | Count | Headline items                                                                                                                                                                                                                                                                                                                       |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0 — correctness             | 5     | exam submit bypasses the one-grading-path rule (writes mastery + elo_events by hand); root `worker:deploy` script is a silent no-op; XP awarding duplicated across 12+ sites with no central service; dead `next lint` script; dead `plugin-updater` dependency                                                                      |
| P1 — half-wired features     | 6     | haptics have no persisted setting and are wired only into the review page; online/social handlers bypass the native HTTP bridge (CORS-dependent on Windows/Android); six registered endpoints have no UI caller; two manual modes never surfaced in UI; extension "friction capture" unimplemented; worker self-hosting docs missing |
| P2 — missing feature surface | 3     | "Deck Doctor" promised in README/CHANGELOG but nonexistent (decision: **build it**); 33 of 92 tables have no repo functions (13 domains persist inline in handlers); 13 core domains unreachable from MCP and CLI                                                                                                                    |
| P3 — test coverage debt      | 4     | 4 core modules with zero unit tests; ~30 handler folders with zero coverage of any kind; 9+ e2e user flows uncovered; Playwright UI smoke suite never runs in CI                                                                                                                                                                     |
| P4 — docs/CI/env hygiene     | 8     | README deferred-roadmap stale (3/6 shipped); ARCHITECTURE/AGENTS maps omit two apps; MCP tool count stale (14 → 27); table count stale (45 → 92); learning-science.md self-contradiction on leaderboards; plan-M19-M21 stale; 6 env vars undocumented; CI lacks commitlint/prettier/fetch-lint; 4 orphan scripts                     |
| Process (not code)           | 1     | the real two-device sync drill (Windows ↔ Android) planned "before closing M19" — physical, cannot be done in code                                                                                                                                                                                                                   |

### 1.2 Why the gaps exist (root-cause analysis)

1. **Discipline concentrated on the visible layers.** The registry/CI tests enforce handler→route wiring (rule 3) and AI manual modes (rule 9) mechanically, so nothing there can rot. But 7 of the 13 hard rules in AGENTS.md have **no automated enforcement at all** — rules 1 (raw fetch), 5 (zod boundaries), 6 (withTransaction), 7 (single grading path), 8 (append-only), 11 (Markdown rendering), 12 (secrets) rely on review discipline. Rule 7 is the one that demonstrably broke (F-01).
2. **Parallel growth of hosts without a parity gate.** MCP grew from 14 to 27 tools and CLI from 8 to 13 commands as features shipped on the web, but no test or check compares the three surfaces. Thirteen domains now exist that an agent or terminal user simply cannot touch (F-14).
3. **Docs as marketing outpaced docs as spec.** README and CHANGELOG name features ("Deck Doctor") that were scoped but never built (F-12), while ARCHITECTURE/ENGINE-REFERENCE carry numbers from an earlier era (14 tools, 45 tables) (F-20). Nothing validates doc claims against code.
4. **Coverage followed commits, not risk.** The newest features (cognitive expansion wave) landed with tests; older, riskier plumbing (backup, sync, push, import/export) never got any (F-16/F-17). The Playwright suite exists and works but was never added to CI (F-18).
5. **Native path is the least-traveled path.** Everything ships in the web bundle, but the native (Tauri webview) runtime diverges silently: outbound `fetch` from handlers only bridges for AI traffic (F-07), and a dependency (`plugin-updater`) was added for an update feature that was never wired (F-05).

### 1.3 Execution decision (approved)

- **Deck Doctor will be built** (F-12) — UI panel on the decks page running the existing 20-Rules linter with one-click fixes, matching the README description.
- **All phases P0→P4 will be executed** on the current branch, one Conventional Commit per finding, per the roadmap in §6.

### 1.4 Effort summary

| Phase | Findings  | New/changed files (approx)          | New tests  | Relative size        |
| ----- | --------- | ----------------------------------- | ---------- | -------------------- |
| P0    | F-01…F-05 | ~20                                 | ~6 suites  | Small, high value    |
| P1    | F-06…F-11 | ~25 + 1 migration                   | ~8 suites  | Medium               |
| P2    | F-12…F-14 | ~45 (13 repos, ~26 MCP/CLI, doctor) | ~15 suites | Large                |
| P3    | F-15…F-18 | ~35 test files                      | 35 suites  | Large but mechanical |
| P4    | F-19…F-26 | ~15 (mostly docs/config)            | 0          | Small                |

---

## 2. Audit methodology

### 2.1 Scans performed

All scans ran against tracked files only (`git grep`), so build output and `node_modules` were excluded by construction. The working tree was clean at audit time; every file:line anchor below was verified against the tree at `99aca25`.

**Scan 1 — unfinished-work markers.**

| Pattern                                                                 | Raw hits | Real signal                                                                                                                                     |
| ----------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `TODO\|FIXME\|XXX\|HACK` (case-insensitive)                             | 14       | 2 real — both benign (Tauri-generated file, scaffolder template); 12 false positives (docs prose, test fixture strings)                         |
| `not implemented\|notimplemented\|unimplemented`                        | 0        | none                                                                                                                                            |
| `placeholder\|stubbed\|for now\|coming soon\|temporar\|WIP`             | ~215     | ~211 benign HTML `placeholder=` attributes; 4 mildly interesting (all cleared on inspection; see Appendix A)                                    |
| `@ts-ignore\|@ts-expect-error\|@deprecated\|eslint-disable\|as any`     | 2        | both justified/intentional (listed in §1)                                                                                                       |
| `.skip(\|\.only(\|it.todo\|test.todo\|xit(\|xdescribe(`                 | 13 raw   | 0 real — all matched `process.exit(`/`app.exit(`/`exit(` via the unanchored `xit\(` pattern; verified with stricter patterns                    |
| `throw new Error(['"](TODO\|Not implemented\|Unreachable\|unsupported)` | 0        | none                                                                                                                                            |
| `experimental\|beta\|draft` in ts/tsx/md                                | 48       | nearly all local `draft` state vars and fixture names; 2 noteworthy (migration 025's documented draft-schema shim; a stale ideas checklist row) |

**Scan 2 — feature-surface cross-check.**

- Enumerated all 43 `app/**/page.tsx` files and extracted every transport call (`apiGet/apiSend/apiUpload/apiStream/apiDownload` from `@/lib/transport`) with its literal URL.
- Enumerated all 143 `src/server/handlers/**/route.ts` files with exported HTTP methods.
- Read `apps/web/src/hub/handlers-registry.ts` in full (143 imports, 143 `add()` calls, dynamic-segment matcher) and every `app/api/**/route.ts` shim.
- Read `apps/web/src/components/nav.ts` in full and cross-checked against pages.
- Read `packages/core/src/ai/transport.ts` (`AI_FEATURES`) and `packages/core/src/ai/manual.ts` (`MANUAL_MODES`); grepped `requireAI(` across handlers and `TransportPanel`/`useManualMode` across UI.
- Read `packages/core/src/practice/{schema,grade,catalog}.ts` and `apps/web/src/ui/exercises/inputs.tsx`.
- Enumerated core domains vs `packages/db/src/repos/*` vs MCP tool list vs CLI command list vs `apps/server/src/routes.ts`.
- Read `docs/README.md`, `docs/learning-science.md`, `ARCHITECTURE.md`, `docs/ENGINE-REFERENCE.md`, `docs/native.md`, `docs/TEST_INFRA.md`, `docs/PLAN-M6-M10.md`, `docs/PLAN-RESEARCH.md`, `docs/plan-M19-M21.md`, `README.md` and verified every promised feature/technique→code link.
- Audited root + workspace `package.json` scripts and every referenced target in `scripts/`.

**Scan 3 — data layer / tests / native / infra.**

- Read `packages/db/src/schema.ts` (92 tables), `migrations/index.ts` (26 entries), `runner.ts`, `review-service.ts`.
- Grepped for FSRS/XP/mastery/Elo writes outside `review-service.ts` (rule-7 bypass hunt) and for any UPDATE/DELETE against the four append-only tables (rule 8).
- Inventoried all 128 test files and mapped them to domains/handlers; identified folders with zero coverage.
- Read `apps/native/src-tauri/tauri.conf.json`, capabilities, Rust command list; read `src/hub/worker.ts`/`protocol.ts`/`net-bridge.ts` for native-runtime parity.
- Read `apps/web/src/lib/transport.ts` (all five seams) and grepped raw `fetch(` across UI code.
- Read `eslint.config.mjs`, `.github/workflows/{ci,native}.yml`, `.github/pull_request_template.md`, `.husky/*`; compared AGENTS.md's 13 hard rules to what is actually enforced.
- Compared `.env.example` to every `process.env` usage.
- Checked git state: `git log --oneline -40`, `git diff main...HEAD --stat` (247 files, +20,720/−1,406), branch ancestry (`m20-wave2` fully merged — no stranded work).

### 2.2 What the scans deliberately did NOT flag

To keep this report actionable, the following were inspected and explicitly cleared:

- `placeholder=` React attributes (211 hits) — all are honest input hints, not stubs.
- The word "draft" in `draftSchema`, fixture names ("Concept Beta", "Obsolete Draft"), and JSON Schema draft 2020-12 references.
- Test-fixture strings like `'xxx {"a": [1, 2} yyy'` (garbage-input test for `extractJson`) and `'zzzqqqxxx'` (no-hits search test).
- `packages/db/src/migrations/025-cognitive-upsert-keys.ts` — a _permanent, documented_ compatibility shim repairing DBs created from a pre-release draft of migration 024. Intentional tech debt; not schedulable work.
- `apps/native/src-tauri/gen/android/gradle.properties` TODO — Tauri-generated, regenerated on build.
- The `m20-wave2` worktree branch — verified fully merged (ancestor of the current branch), nothing stranded.

---

## 3. System inventory

Verified at audit time. Counts are the basis for the stale-doc corrections in P4 (F-20).

### 3.1 Pages (43)

`/` dashboard · `/analytics` · `/audio-commute` · `/backup` · `/canvas` · `/constellation` · `/courses` (+ `/courses/new`, `/courses/course`, `/courses/exam`, `/courses/lesson`, `/courses/certificate`) · `/curriculum` · `/debate` · `/decks` · `/exam-sim` · `/feynman` · `/focus` · `/games` · `/graph` · `/habits` · `/ideas` · `/ingest` · `/journal` · `/mindmap` · `/motivation` · `/notes` · `/online` · `/palace` · `/palace-3d` · `/physiology` · `/planner` · `/quotes` · `/reading` · `/review` · `/search` · `/settings` · `/sleep-tmr` · `/tutor` · `/voice-tutor` · `/weakness` · `/weekly` · `/world`.

Nav (`apps/web/src/components/nav.ts`): 38 entries across four groups (Learn / Explore / Discipline / Create & Analyze). The five `courses/*` sub-pages are linked, not nav-listed — a deliberate exception to "navigation comes only from nav.ts" that AGENTS.md §5 should document (F-26).

### 3.2 API handlers (143 files = 143 shims = 143 registry entries)

Full method inventory is in Appendix B. Notable: the `calendar` handler is served under the alias key `calendar.ics` (shim `app/api/calendar.ics/route.ts` ↔ handler dir `handlers/calendar/`) — intentional, verified consistent.

### 3.3 AI features (14)

`tutor-session-summary` · `nl-search` · `tutor-grade` · `feynman-student` · `feynman-grader` · `course-generator` · `cloze-generator` · `coach` · `council-optimist` · `council-skeptic` · `council-domain-expert` · `council-devils-advocate` · `brainwrite` · `freetext-rubric` — plus one AI surface outside `AI_FEATURES`: the voice tutor (`tutor/voice-session/route.ts:132`), which has an explicit offline Socratic fallback. Full matrix in Appendix C.

### 3.4 Exercise types (12)

mcq · multi · truefalse · numeric · typein · cloze · ordering · parsons · matching · categorize · freetext · code. Schema (`packages/core/src/practice/schema.ts:171-184`), graders (`grade.ts:241-249`, dispatch maps — type-complete), renderers (`inputs.tsx:727-740`, exhaustively typed), tests (`packages/core/tests/practice.test.ts` covers all 12). Matrix in Appendix D.

### 3.5 Database (92 tables, 25 repo modules, migrations 001–026)

92 `= table(` definitions in `packages/db/src/schema.ts` (1,752 lines). 33 tables have **no** typed repo functions and are accessed inline by handlers (full list in F-13). Views: `v_true_retention`, `v_daily_reviews`, `v_xp_daily` (`packages/db/src/index.ts:231-245`). Append-only tables: `revlog`, `xp_events`, `friction_events`, `elo_events`, `course_exam_attempts`, `reminder_log`, `reminder_clicks`, `card_attempt_images`, `exposure_events`.

### 3.6 Hosts

| Host                            | Surface                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Web (`apps/web`)                | 43 pages, 143 handlers, hub worker for native                                                                                                 |
| Native (`apps/native`)          | Tauri 2 shell; 3 Rust commands (focus lock) in `src-tauri/src/focus.rs`; OPFS sqlite-wasm via hub worker                                      |
| MCP (`apps/mcp`)                | 27 built-in tools (6 curriculum + 3 cognitive + 18 in `index.ts`) + plugin contributions; 3 resources                                         |
| CLI (`apps/cli`)                | 13 commands (capture, today, stats, review, focus, quote, search, fsrs, starter, sync, curriculum, workload, exposure) + plugin contributions |
| Headless server (`apps/server`) | 8 routes (`/health`, `/decks`, `/cards`, `/today`, `/stats`, `/plugins`, `/review`, `/review/batch`)                                          |
| Worker (`apps/worker`)          | Cloudflare worker: rooms, boss raids, library share — **absent from ARCHITECTURE.md/AGENTS.md maps**                                          |
| Extension (`apps/extension`)    | Browser extension: quick-add, save-to-read, context-menu capture — **absent from ARCHITECTURE.md/AGENTS.md maps**                             |

### 3.7 Tests (128 unit/test files + 12 e2e + Playwright)

`packages/core` 68 · `packages/db` 29 · `apps/web` 15 (+1 Playwright spec) · `apps/extension` 3 · `apps/worker` 1 · root `tests/e2e` 12. Zero skipped. Coverage holes are catalogued in F-15/F-16/F-17.

### 3.8 CI

`.github/workflows/ci.yml`: typecheck → lint (`eslint .`) → unit tests (workspaces) → db:push+db:seed → e2e → build → web:tauri. `.github/workflows/native.yml`: Windows NSIS/MSI + Android APK on main/tags. Missing from CI: Playwright UI smoke, commitlint, `prettier --check` (§10).

### 3.9 Git state

Branch `feat/cognitive-expansion`, 54 commits ahead of `main`, clean tree, no remote tracking configured. Branch themes: the "Cognitive Power Expansion" wave (workload balancer, exposure ledger, BKT pretesting, Brier/calibration analytics, weakness radar v2, exam simulator, Whisper STT/voice tutor, dialectic arena, palace-3d, multimodal ingest, GKT cognitive load, circadian commute, TMR sleep, soundscape/haptics/E-Ink Zen, MCP+CLI parity, extension capture) followed by a hardening tail. Zero-diff areas on the branch vs `main`: `packages/ai-adapters`, `apps/server`, `apps/native`.

---

## 4. Findings index

Every finding's full spec is in §5. IDs are stable and referenced by the roadmap (§6) and commit messages.

| ID   | Phase | Area              | Severity | Title                                                                                                                                      |
| ---- | ----- | ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| F-01 | P0    | db / web handlers | **High** | Exam submit writes mastery + elo_events by hand, bypassing the one-grading-path rule                                                       |
| F-02 | P0    | root scripts      | High     | Root `worker:deploy` is a silent no-op                                                                                                     |
| F-03 | P0    | db / multi-host   | Medium   | XP awarding duplicated across 12+ sites with no central service                                                                            |
| F-04 | P0    | web scripts       | Medium   | Dead `next lint` script (removed in Next 16)                                                                                               |
| F-05 | P0    | web/native deps   | Low      | Dead `@tauri-apps/plugin-updater` dependency (update feature never wired)                                                                  |
| F-06 | P1    | web/native        | Medium   | Haptics: no persisted setting, wired only into the review page                                                                             |
| F-07 | P1    | web hub / native  | Medium   | Online/social handlers bypass the native HTTP bridge (CORS-dependent)                                                                      |
| F-08 | P1    | web UI            | Medium   | Six registered endpoints have no UI caller                                                                                                 |
| F-09 | P1    | web UI / core ai  | Medium   | Manual modes defined but not surfaced: `tutor-session-summary`, `nl-search`                                                                |
| F-10 | P1    | extension         | Medium   | Extension "friction capture" (M21 plan item) unimplemented                                                                                 |
| F-11 | P1    | docs              | Medium   | Worker self-hosting docs promised but missing                                                                                              |
| F-12 | P2    | core/db/web       | **High** | "Deck Doctor" promised in README/CHANGELOG, no code exists — build it                                                                      |
| F-13 | P2    | db                | Medium   | 33 of 92 tables have no repo functions; 13 domains persist inline in handlers                                                              |
| F-14 | P2    | mcp / cli         | Medium   | 13 core domains unreachable from MCP and CLI                                                                                               |
| F-15 | P3    | core tests        | Medium   | Core modules with zero unit tests: habits, media, quotes, reading, bkt                                                                     |
| F-16 | P3    | web tests         | High     | ~30 handler folders with zero coverage of any kind                                                                                         |
| F-17 | P3    | e2e               | Medium   | Nine+ e2e user flows uncovered (backup/sync/AI-stream/images/apkg/world/dialectic/palace-3d/workload)                                      |
| F-18 | P3    | CI                | Medium   | Playwright UI smoke suite exists but never runs in CI                                                                                      |
| F-19 | P4    | docs              | Low      | README "Roadmap (deferred)" stale: 3 of 6 items shipped                                                                                    |
| F-20 | P4    | docs              | Medium   | ARCHITECTURE/AGENTS maps omit `apps/worker`+`apps/extension`; MCP "14 tools" → 27; ENGINE-REFERENCE "45 tables" → 92; stale optimizer note |
| F-21 | P4    | docs              | Low      | learning-science.md: "no leaderboards" principle contradicted by shipped leaderboard; stale M3/M4/M5 legend                                |
| F-22 | P4    | docs              | Low      | plan-M19-M21: M20/M21 items shipped but plan still lists them as future                                                                    |
| F-23 | P4    | env               | Low      | `.env.example` missing 5 documented-by-usage vars (`VAPID_*`, `LEARNING_HUB_TARGET`, `NEXT_PUBLIC_LEARNING_HUB_TARGET`)                    |
| F-24 | P4    | CI/lint           | Medium   | CI lacks commitlint + prettier check; rule 1 (raw fetch in UI) unenforced by eslint                                                        |
| F-25 | P4    | scripts           | Low      | `build:packages` skips ai-adapters; 4 orphan utility scripts                                                                               |
| F-26 | P4    | docs              | Low      | TEST_INFRA.md stale (missing curriculum-agents + Playwright); AGENTS.md §5 nav exception undocumented                                      |
| —    | —     | process           | n/a      | Real two-device sync drill (Windows ↔ Android) — physical action, tracked in plan-M19-M21, out of code scope                               |

---

## 5. Detailed fix specifications

Each spec follows the same template so the roadmap (§6) can be executed mechanically. Code sketches are illustrative — implementations must match surrounding code idiom (AGENTS.md §4.3) and carry JSDoc on every export.

### F-01 — Exam submit writes mastery + elo_events by hand, bypassing the one-grading-path rule

| Field           | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase      | F-01 / P0                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Area            | `packages/db` (missing service), `apps/web/src/server/handlers/curriculum/exam`                                                                                                                                                                                                                                                                                                                                                                                            |
| Severity        | High (AGENTS.md hard-rule violation, correctness of mastery model)                                                                                                                                                                                                                                                                                                                                                                                                         |
| Evidence        | `apps/web/src/server/handlers/curriculum/exam/route.ts:125-175` — the `submit` action recomputes BKT via `applyReviewToMastery` and Elo via `eloUpdate`, then writes `db.update(mastery).set({ pKnown, attempts, correct, elo })` (line 139) and inserts `eloEvents` directly (lines 148, 167). Contrast the sanctioned pattern one directory over: `handlers/curriculum/practice/route.ts:37` carries an explicit comment invoking Rule #7 and defers to the shared path. |
| Also implicated | The exam handler deliberately skips FSRS/revlog (exam answers are not card reviews) — that part is _correct by design_; the violation is the hand-rolled mastery/Elo write, duplicated from the practice path.                                                                                                                                                                                                                                                             |

#### Problem statement

AGENTS.md rule 7: _"One grading path. Card/exercise grades go through `executeReview` / `executeBatchReview` (`packages/db/src/review-service.ts`). Never update FSRS/XP/mastery by hand."_ The exam submit handler performs exactly the forbidden write: it owns a private copy of the BKT + Elo update logic that also lives in the practice path. Two copies of the mastery-update math can (and over time will) drift — a change to `eloUpdate` K-factor handling or BKT parameters applied in one place and not the other produces silently inconsistent `mastery` rows and `elo_events` for the same skill depending on whether the learner practiced or took an exam.

#### Root cause

The exam feature was added (M20 wave) with a legitimate need to _not_ touch FSRS state, and the path of least resistance was to copy the mastery/Elo snippet from the practice handler rather than extract a shared function. Nothing in CI detects this class of violation (see §10 — rule 7 has no enforcement).

#### Fix design

1. Create a new module `packages/db/src/mastery-service.ts` (sibling of `review-service.ts`) exporting the mastery/Elo application as the single canonical function:

   ```ts
   /**
    * Apply one graded skill response to the BKT/Elo mastery model.
    * The single canonical path for mastery updates (AGENTS.md rule 7):
    * both curriculum practice and exam submit route through here.
    * Writes: mastery row (upsert), one append-only elo_events row on rating change.
    * Must be called inside the caller's withTransaction.
    */
   export function applySkillResponse(
     tx: Tx, // transaction handle type from review-service
     input: { skillId: string; correct: boolean; atMs?: number; eloK?: number },
   ): { pKnown: number; elo: number; ratingBefore: number; ratingAfter: number }
   ```

   - Internally: load the `mastery` row, call `applyReviewToMastery(...)` and `eloUpdate(...)` from `packages/core` (the same functions the handlers import today), upsert the row, insert the `elo_events` row with `ratingBefore`/`ratingAfter`/`outcome`.
   - The exam path passes its own `eloK` (exam K-factor may differ — preserve current exam-handler constants exactly so behavior is unchanged, only _located_ differently).

2. Rewrite `handlers/curriculum/exam/route.ts` submit to call `applySkillResponse` per answered skill inside its existing `withTransaction` (async work before, events after commit — rule 6).
3. Rewrite `handlers/curriculum/practice/route.ts` to call the same function, replacing its inline copy (the rule-7 comment there is replaced by the structural guarantee).
4. Grep-verify no other site writes `mastery` or `eloEvents` outside the service (expected result: zero, except the service itself and test fixtures).

#### Files to touch

- `packages/db/src/mastery-service.ts` (new)
- `packages/db/src/index.ts` (export)
- `apps/web/src/server/handlers/curriculum/exam/route.ts`
- `apps/web/src/server/handlers/curriculum/practice/route.ts`
- `packages/db/tests/mastery-service.test.ts` (new)
- `apps/web/tests/curriculum-api.test.ts` (extend: exam submit assertions unchanged but now exercise the shared path)

#### Test plan

- Unit (`packages/db/tests/mastery-service.test.ts`): correct answer raises `pKnown` and Elo; wrong answer lowers both; `elo_events` row appended with before/after; idempotent within a transaction; exam K-factor preserved (golden values compared against the current handler's outputs — snapshot the existing behavior first).
- Regression: existing `apps/web/tests/curriculum-api.test.ts` exam-submit tests must pass **unchanged** (the refactor is behavior-preserving; this is the acceptance bar).

#### Acceptance criteria

- [ ] No `db.update(mastery)` or `db.insert(eloEvents)` anywhere in `apps/web/src` or `apps/cli`/`apps/mcp` (grep-clean).
- [ ] Exam + practice both call `applySkillResponse`.
- [ ] All existing curriculum tests pass without modification.
- [ ] New unit suite covers the service directly.

#### Risks & mitigations

- _Behavioral drift during extraction_ → mitigate with the golden-value snapshot test written BEFORE the refactor (capture current exam-submit mastery/elo outputs, assert unchanged after).
- _Transaction semantics_ → the service takes the tx handle; it never opens its own transaction (documented in JSDoc) — keeps rule 6 intact.

#### Estimate

~0.5 day. Commit: `fix(db): route exam grading through a shared mastery service`.

---

### F-02 — Root `worker:deploy` is a silent no-op

| Field      | Value                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| ID / Phase | F-02 / P0                                                                                             |
| Area       | root `package.json`, `apps/worker/package.json`                                                       |
| Severity   | High (operational: deployments silently do not happen)                                                |
| Evidence   | Root `package.json:15`: `"worker:deploy": "npm run worker:deploy -w @learning-hub/worker --if-present |     | (cd apps/worker && npx wrangler deploy)"`. `apps/worker/package.json:7-12`defines`deploy`, **not** `worker:deploy`. With `--if-present`, npm exits **0** when the named script is absent, so the ` |     | ` fallback — the only path that actually deploys — never runs. |

#### Problem statement

`npm run worker:deploy` always succeeds while doing nothing. Anyone relying on it (CHANGELOG references `npm run worker:deploy`) believes they deployed the worker (rooms, boss raids, library share) when they didn't. This is the worst class of script bug: exit 0 + no effect.

#### Root cause

The script was written expecting the workspace to define `worker:deploy`; the workspace defines `deploy`. The `--if-present` flag — added defensively to avoid a hard failure — converted a loud breakage into a silent one. The `||` fallback cannot catch an exit-0 no-op.

#### Fix design

Minimal and unambiguous — fix the name mismatch and drop the dead fallback:

```jsonc
// root package.json
"worker:deploy": "npm run deploy -w @learning-hub/worker"
```

Optionally also add a smoke guard: `apps/worker/package.json` gains nothing new; instead, verify in CI-adjacent tooling that every `-w <pkg> <script>` root script actually exists (see §10.4, script-drift check).

#### Files to touch

- `package.json` (root, one line)
- `docs/plans/MASTER-FIX-PLAN.md` records the decision; CHANGELOG gets a line under the next release heading.

#### Test plan

- Manual: `npm run worker:deploy --dry-run` path (wrangler supports `--dry-run`) to prove the correct script resolves; document the expected output in the commit message.
- Add a tiny script-drift check to `scripts/` (see §10.4) that parses root `package.json` scripts of the form `npm run X -w Y` and asserts `apps/Y/package.json` defines `X` — wired as `npm run check:scripts` and included in `check`.

#### Acceptance criteria

- [ ] `npm run worker:deploy` resolves to the worker's `deploy` script.
- [ ] Script-drift check added and green.

#### Risks & mitigations

- _Wrangler missing locally_ → out of scope; the deploy script already requires it. The fix is about correct wiring, not provisioning.

#### Estimate

~0.5 hour. Commit: `fix(root): repair worker:deploy script wiring`.

---

### F-03 — XP awarding duplicated across 12+ sites with no central service

| Field                                                             | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase                                                        | F-03 / P0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Area                                                              | `packages/db` (missing repo/service), 12 call sites across `apps/cli`, `apps/web/src/server/handlers/*`, `packages/db/src/repos/*`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Severity                                                          | Medium (rule 7 letter violation: "never update XP by hand"; rule 8 intact since all sites are insert-only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Evidence (all `db.insert(xpEvents)` sites outside review-service) | `apps/cli/src/index.ts:305` · `apps/web/src/server/handlers/achievements/route.ts:140` · `handlers/ai/feynman/grade/route.ts:94` · `handlers/curriculum/lessons/[id]/route.ts:57` · `handlers/curriculum/route.ts:121` · `handlers/focus/[id]/route.ts:61` · `handlers/habits/checkin/route.ts:40` · `handlers/ideas/evolve/route.ts:60` · `handlers/journal/route.ts:78` · `handlers/quests/route.ts:158` · `packages/db/src/repos/dialectic.ts:92` · `packages/db/src/repos/social.ts:127` (plus the canonical insert inside `review-service.ts` which already exists and stays). |

#### Problem statement

The XP _amount_ formula is re-derived at every feature site (constant per source, occasionally with feature-local multipliers). AGENTS.md rule 7 says never update XP by hand; the letter is systematically not enforced for non-grade XP sources. Consequences: amounts drift between hosts (CLI vs web), there is no single place to audit/adjust the XP economy, and any future XP feature (streak multipliers, world-economy conversions) would multiply the duplication.

#### Root cause

`review-service.ts` centralizes the _grade_ XP path, but no equivalent exists for the "behavioral" XP sources (journaling, habit check-ins, focus sessions, quests, ideas, feynman grades, achievements, dialectic turns, social wins). Each feature added its own insert because each was small.

#### Fix design

1. Add `packages/db/src/repos/xp.ts`:

   ```ts
   /** XP sources with their canonical amounts. The single table of the XP economy. */
   export const XP_SOURCES = {
     journal: 25,
     habit: 15,
     focus: 30,
     quest: 20,
     idea: 10,
     feynman: 60,
     achievement: 50,
     dialectic: 20,
     social: 15,
   } as const
   // ^ values MUST be taken from the current per-site constants — snapshot first, do not rebalance in this commit.

   /**
    * Append one xp_events row (rule 8: insert-only). Canonical XP path for all
    * non-grade sources; card grades keep going through review-service.
    * Must be called inside the caller's withTransaction.
    */
   export function awardXp(
     tx: Tx,
     input: {
       source: keyof typeof XP_SOURCES
       amountOverride?: number
       meta?: Record<string, unknown>
     },
   ): void
   ```

   - `amountOverride` is allowed but must be justified at the call site with a comment (keeps flexibility without inviting silent rebalances).
   - JSDoc cites rule 7/8 and states the invariant: insert-only, transaction-scoped, never deletes.

2. Migrate all 12 sites to `awardXp`, preserving each site's current amount exactly (snapshot test first, like F-01).
3. Leave `review-service.ts`'s internal insert as-is (it is the grade path; optionally route it through the same insert helper for one shared shape).

#### Files to touch

- `packages/db/src/repos/xp.ts` (new) + `repos/index.ts` export
- The 12 call sites listed above
- `packages/db/tests/xp-award.test.ts` (new)

#### Test plan

- Unit: each source inserts one row with the canonical amount; `amountOverride` honored; no update/delete APIs exist on the repo (type-level guarantee).
- Snapshot: before refactor, dump `(source, amount)` pairs from a scripted review of all 12 sites into the test as golden values; assert equality after migration.
- Existing suites touching XP (`packages/db/tests/elo-xp-journal.test.ts`, e2e tier1 analytics) must pass unchanged.

#### Acceptance criteria

- [ ] Grep `db.insert(xpEvents)` across `apps/` → only zero hits (all via `awardXp`); in `packages/` → review-service + xp repo only.
- [ ] Golden-value test proves no XP economy change.

#### Risks & mitigations

- _Accidental rebalance while migrating_ → golden values captured first; any intentional rebalance is a separate, explicit commit.
- _Circular imports_ → `repos/xp.ts` imports only schema + core types; hosts import the repo — dependency arrow stays `apps → db` (never inverted).

#### Estimate

~1 day (12 sites + tests). Commit: `feat(db): centralize XP awarding in awardXp service`.

---

### F-04 — Dead `next lint` script (removed in Next 16)

| Field      | Value                                                                                                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-04 / P0                                                                                                                                                                                          |
| Area       | `apps/web/package.json`                                                                                                                                                                            |
| Severity   | Medium (dead tooling; CI unaffected because root runs `eslint .`)                                                                                                                                  |
| Evidence   | `apps/web/package.json:20` — `"lint": "next lint"`; repo pins `next: ^16.4.5` (`apps/web/package.json:47`). `next lint` was removed in Next 16; running `npm run lint -w @learning-hub/web` fails. |

#### Problem statement

The workspace lint script is broken. Anyone linting the web workspace directly hits an error; only the root `eslint .` works. Misleading surface area for contributors.

#### Fix design

Replace with a flat ESLint invocation scoped to the workspace:

```jsonc
"lint": "eslint ."
```

(run from the workspace dir; the root `eslint.config.mjs` is discovered by upward search, matching how the root script behaves). Alternatively simply delete the script — but keeping a working one preserves muscle memory and workspace parity.

#### Files to touch

- `apps/web/package.json` (one line)

#### Test plan

- `npm run lint -w @learning-hub/web` exits 0.

#### Acceptance criteria

- [ ] Workspace lint script runs clean.

#### Risks & mitigations

- None. Pure tooling.

#### Estimate

~10 minutes. Commit: `chore(web): replace dead next lint script with eslint`.

---

### F-05 — Dead `@tauri-apps/plugin-updater` dependency (update feature never wired)

| Field      | Value                                                                                                                                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-05 / P0                                                                                                                                                                                                                                                                                             |
| Area       | `apps/web/package.json`, `apps/native/src-tauri/*`                                                                                                                                                                                                                                                    |
| Severity   | Low (dead dependency; also misleading — implies an updater exists)                                                                                                                                                                                                                                    |
| Evidence   | `apps/web/package.json:41` depends on `@tauri-apps/plugin-updater`; it is absent from `apps/native/src-tauri/Cargo.toml`, from `lib.rs` plugin registration, from `capabilities/*`, and has **zero imports** anywhere in `apps/web/src`. `tauri.conf.json` has no `plugins` section / updater config. |

#### Problem statement

A dependency implying an auto-update feature was added but the entire feature (Rust plugin registration, capability, updater endpoint config, UI check) was never built. It ships in the bundle for nothing and misleads anyone auditing native capabilities.

#### Root cause

A capability was planned during native bring-up, the npm side was installed, and the rest of the work never happened — leaving exactly the kind of half-wiring that marker scans cannot see (no TODO, no stub).

#### Fix design (decision: remove; wire the real updater later as its own feature)

1. Remove `@tauri-apps/plugin-updater` from `apps/web/package.json` dependencies; `npm install` to update the lockfile.
2. Note the deferred feature in `docs/native.md` next to the existing "release signing not configured" honesty note: _"Auto-update via the Tauri updater plugin is planned but not wired; do not add the npm dependency until the full chain (Cargo plugin + capability + conf) lands."_
3. If a future feature request lands, the full chain to build is documented here as the checklist: Cargo.toml dep → `lib.rs` `.plugin(tauri_plugin_updater::Builder::build())` → `capabilities/default.json` `updater:default` → `tauri.conf.json` `plugins.updater` (pubkey + endpoints) → UI check → release-signing prerequisite.

#### Files to touch

- `apps/web/package.json`, `package-lock.json`
- `docs/native.md` (one note)

#### Test plan

- `npm run web:tauri` still builds (dependency removal cannot break it — verified by the zero-import grep).
- Native CI (`native.yml`) unaffected.

#### Acceptance criteria

- [ ] Dependency gone; `git grep plugin-updater` matches only this plan doc and the native.md note.

#### Risks & mitigations

- None. Removal of an unused dependency.

#### Estimate

~15 minutes. Commit: `chore(native): remove unwired plugin-updater dependency`.

### F-06 — Haptics: no persisted setting, wired only into the review page

| Field      | Value                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| ID / Phase | F-06 / P1                                                                                                                            |
| Area       | `apps/web` (settings, review/exam-sim/voice-tutor pages), `packages/db` (schema + migration 027), `apps/web/src/platform/haptics.ts` |
| Severity   | Medium (feature half-wired; commit `c89e61e` scoped it to "review cognitive telemetry and tactile haptics" but only review got it)   |
| Evidence   | `apps/web/src/platform/haptics.ts:12-17,26,29-33,56,70,85` — Tauri `plugin:haptics                                                   | impact`/`vibrate`invocation with`navigator.vibrate`web fallback; **called only from`app/review/page.tsx:352-404`**; no user setting exists (grep of settings page + settings handler + schema returns nothing for haptics); unit-tested in `tests/calm-sensory.test.ts`but always-on. Desktop capability absent by design (mobile-only`capabilities/mobile.json`); desktop falls back to `navigator.vibrate`. |

#### Problem statement

Three gaps make haptics half-wired:

1. **No off switch.** A user who finds vibration distracting has no way to disable it; the setting isn't in `user_settings` at all. This contradicts the repo's own "calm by default" UI principle — a sensory feature should be opt-out at minimum.
2. **Inconsistent coverage.** The commit that introduced haptics names exam-sim and voice-tutor contexts implicitly (sensory wave), but only the review page calls it. High-stakes surfaces (exam simulator grading) are exactly where tactile feedback matters most.
3. **No setting plumbing pattern.** The settings page/handler have no key for it, so adding one now also establishes the pattern for future sensory prefs (soundscape intensity, etc.).

#### Root cause

The sensory commit wired the platform module and one consumer but stopped short of the settings/persistence layer and the other consumers. No test enforces "sensory features must have a persisted setting."

#### Fix design

1. **Schema + migration 027** (rule 4: `schema.ts` AND migration, never renumber):

   ```ts
   // packages/db/src/schema.ts — inside user_settings definition
   hapticsEnabled: integer('haptics_enabled', { mode: 'boolean' }).notNull().default(true),

   // packages/db/src/migrations/027-haptics-setting.ts
   export const hapticsSetting: Migration = { id: 27, name: 'haptics-setting',
     up(ctx) { ctx.addColumn('user_settings', 'haptics_enabled', 'INTEGER NOT NULL DEFAULT 1') } }
   ```

   Append to `MIGRATIONS` in `migrations/index.ts`. (Drizzle `NOT NULL DEFAULT 1` is backfill-safe on existing rows; the column read on fresh DBs comes from schema.ts.)

2. **Settings surface:** add the key to the settings zod schema (`handlers/settings/route.ts`), the settings page (Discipline/sensory section, one `Toggle` — one primary action per screen, calm defaults), and the settings PUT path. The web settings handler validates via zod (rule 5).
3. **Platform module:** extend `apps/web/src/platform/haptics.ts` with a module-level enabled flag + `setHapticsEnabled(v: boolean)`; when disabled, every call becomes a no-op (keep the API shape — callers unchanged). Persist the flag from settings on load (AppShell/ThemeSync pattern: read `user_settings`, apply).
4. **Wire the missing surfaces:** `app/exam-sim/page.tsx` (grade submission: success tick, error nudge) and `app/voice-tutor/page.tsx` (turn boundaries) call the existing haptic helpers, mirroring review/page.tsx:352-404.
5. **Telemetry honesty:** no new handler needed — this is a client-side preference persisted via the existing settings handler.

#### Files to touch

- `packages/db/src/schema.ts`, `packages/db/src/migrations/027-haptics-setting.ts`, `packages/db/src/migrations/index.ts`
- `apps/web/src/server/handlers/settings/route.ts` (zod + persistence)
- `apps/web/app/settings/page.tsx` (toggle UI)
- `apps/web/src/platform/haptics.ts` (flag + no-op behavior + JSDoc)
- `apps/web/app/exam-sim/page.tsx`, `apps/web/app/voice-tutor/page.tsx`
- `apps/web/src/components/ThemeSync.tsx`-adjacent settings loader (apply flag at boot)
- Tests: `packages/db/tests/migrations.test.ts` (idempotent column add), `apps/web/tests/calm-sensory.test.ts` (extend: disabled → no vibrate calls), settings handler test

#### Test plan

- Migration: fresh DB gets the column with default 1; existing DB upgraded by 027 keeps rows and default applies.
- Unit: `setHapticsEnabled(false)` → `impact()`/`vibrate()` produce zero invocations (mock the Tauri invoke + navigator.vibrate).
- Handler: settings PUT with `hapticsEnabled: false` persists; GET round-trips; zod rejects junk.
- UI: manual check at 360px width — toggle inside settings section, ≥44px target.

#### Acceptance criteria

- [ ] Toggle persists and survives reload on web and (by settings-table parity) native.
- [ ] Disabling silences every wired surface.
- [ ] exam-sim + voice-tutor emit haptics on grade/turn events.
- [ ] Migration 027 registered and ordered; `npm run db:push` clean.

#### Risks & mitigations

- _Desktop `navigator.vibrate` differences_ → unchanged behavior; the flag gates all backends uniformly.
- _Settings schema drift between zod and DB_ → single source: derive the zod enum/keys from the schema column list where the handler already does; add a test that PUT-then-GET round-trips every settings key.

#### Estimate

~0.5 day. Commit: `feat(sensory): persist haptics setting and wire exam-sim and voice-tutor`.

---

### F-07 — Online/social handlers bypass the native HTTP bridge (CORS-dependent on native)

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ID / Phase | F-07 / P1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Area       | `apps/web/src/hub/worker.ts`, `apps/web/src/lib/net-host.ts`/`net-bridge.ts`, handlers: `online/identity`, `online/raids`, `online/rooms`, `online/library`, `social/leaderboard/sync`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Severity   | Medium (native-behavior asymmetry; online features can silently fail on Windows/Android)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Evidence   | `apps/web/src/hub/worker.ts:75-78` — only AI-adapter traffic is routed through `createBridgedFetch` + `setNetworkFetch`. Handler-level outbound fetches: `handlers/online/identity/route.ts:99`, `handlers/online/raids/route.ts:21`, `handlers/online/rooms/route.ts:26,69`, `handlers/online/library/route.ts:55,88`, `handlers/social/leaderboard/sync/route.ts:20,27`. Under the hub worker (native), these run as **webview `fetch`** — subject to CORS unless the remote server sends permissive headers. `capabilities/default.json` grants `http:default` (allow all URLs), and `src/lib/net-host.ts:18` already provides the native-bridge fetch — it is just not plumbed for these handlers. |

#### Problem statement

AGENTS.md rule 1 is not violated (handlers are backend, not UI), but the _spirit_ of the bridge — all network traffic on native flows through the CORS-free Rust HTTP plugin — is only half-implemented. AI traffic was bridged (worker.ts:75-78); everything else in handlers talks to remote servers directly from the webview. On `tauri://localhost` origins, a strict remote (e.g., a Cloudflare worker without CORS headers, or a user's self-hosted loopback server) will fail with opaque CORS errors on native while working fine on web — a bug class that is invisible in web-only tests and CI.

#### Root cause

`createBridgedFetch` was built for the AI adapter seam (`setNetworkFetch` in `packages/ai-adapters`) and never generalized to handler-level outbound calls. The online/social handlers were written against the web target first.

#### Fix design

1. **Generalize the seam.** In `apps/web/src/server/` add `net.ts` (runtime-neutral): a `remoteFetch(url, init)` helper that (a) on web target, calls global `fetch`; (b) on hub/native target, posts to a well-known hub-protocol endpoint (`net/fetch`) that the worker routes through the bridge. Implementation choice: extend `src/hub/worker.ts` to register a `net` fetch handler in its registry that calls `createBridgedFetch` for arbitrary URLs (keeping the existing AI-specific bridging untouched), and give handlers an injected `remoteFetch` port (same pattern as `src/server/storage.ts` — no static node/platform imports in handlers, ESLint-clean).
2. **Migrate the five handlers** to `remoteFetch` with exact same request/response shapes (no API change): identity (server registration/lookup), raids (worker POST), rooms (worker join/list), library (share fetch/import), leaderboard sync.
3. **Keep web behavior byte-identical** — on web, `remoteFetch` is `fetch`, so the web target and CI are unaffected.

#### Files to touch

- `apps/web/src/server/net.ts` (new, runtime-neutral port)
- `apps/web/src/hub/worker.ts` (bridge route for net fetches)
- `apps/web/src/lib/net-host.ts` / `net-bridge.ts` (expose a generic fetch if not already)
- The 5 handler files listed above
- Tests: `apps/web/tests/hub-registry.test.ts` unaffected; new `apps/web/tests/net-bridge.test.ts` asserting (a) web target passes through, (b) hub target routes via the protocol, (c) the five handlers call the port (fixture-injected port).

#### Test plan

- Unit with injected ports: each handler works against a stub `remoteFetch` (request shape assertions).
- Hub protocol test: worker receives `net/fetch` request, calls bridged fetch, returns status/body — assert with a mocked bridge.
- Manual native check (documented as manual because it needs a real webview): register an online server from the Windows app and confirm the request appears in the worker's logs (or a local echo server) with no CORS error.

#### Acceptance criteria

- [ ] No handler imports `fetch` directly for remote calls; all go through the port.
- [ ] Web e2e suite (`routes-smoke`, tier1) passes unchanged.
- [ ] Hub-registry + route-safety tests stay green.

#### Risks & mitigations

- _Streamed responses_ → none of the five handlers stream; enforce a plain-JSON contract in the port and document it.
- _Circular dependency between hub and server_ → port injection keeps the arrow one-way (`handlers ← injected port`), same as `storage.ts`.

#### Estimate

~1 day. Commit: `fix(native): bridge handler outbound fetches through the hub net port`.

---

### F-08 — Six registered endpoints have no UI caller

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ID / Phase | F-08 / P1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Area       | `apps/web` pages/components vs `src/server/handlers/*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Severity   | Medium (dead backend surface = maintenance cost + false advertising; each needs a UI home or deletion)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Evidence   | Exhaustive URL sweep of every page/component transport call vs the registry. Called only by e2e/tests, never by UI: ① `/api/review/stats` (`handlers/review/stats/route.ts`) ② `/api/share/export` (`handlers/share/export/route.ts`; Online page only imports via `/api/share/import`, `online/page.tsx:694`) ③ `/api/distractions` CRUD (`handlers/distractions/route.ts` + `distraction_apps`/`friction_events`; the focus page logs leaks via `/api/friction`, `focus/page.tsx:419`) ④ `/api/reminders/click` (`handlers/reminders/click/route.ts`; `src/platform/reminders.ts` calls only plan:81 and log:91; `public/sw.js` has no click reporter) ⑤ `/api/audio/sessions` (`handlers/audio/sessions/route.ts`; commute/sleep pages use circadian/tmr routes) ⑥ `/api/curriculum/graph/remedial` (`handlers/curriculum/graph/remedial/route.ts`; graph page uses only `/api/curriculum/graph/dependencies`). |

#### Problem statement

Six endpoints are fully built (handler + shim + registry + smoke tests) but unreachable from any screen. Each represents a designed-but-unshipped UX: review-stats panel, share-string export, distraction logging, reminder engagement tracking, generic audio session CRUD, and the remedial-path suggestion engine. Unshipped endpoints rot: nobody exercises them when changing schemas, and their zod/repo assumptions drift.

#### Root cause

Backend-first development: the handler waves landed ahead of (or without) their UI counterparts, and no check compares registry keys to UI call sites (the existing `route-safety.test.ts` only validates the reverse: UI calls → registry).

#### Fix design (per endpoint)

1. **`/api/review/stats`** → add a _Deck stats_ panel to the analytics page (or the review page's deck header): today/7d/30d counts, average ease, lapse rate — data the analytics page's aggregate view doesn't show per-deck. Small `Panel` + `ProgressBar` composition from `@/ui`.
2. **`/api/share/export`** → add _Share deck string_ to the decks page deck-row action menu (next to existing import on Online page): POST, copy the returned share string to clipboard, with the same peer-instructions hint the import side shows.
3. **`/api/distractions`** → the focus page already logs friction; add the _distraction app log_ (the `distraction_apps` table this route manages) as a section on the focus page: list + add/remove allowlist-style entries, feeding the existing friction gate.
4. **`/api/reminders/click`** → wire the engagement loop: `public/sw.js` notification click handler POSTs the reminder id (already the notification's data payload) to the endpoint; add a small "engagement %" stat to the planner page's reminders panel. Requires care: sw.js fetch must be resilient (fire-and-forget, ignore failures — notifications must never fail to open because telemetry failed).
5. **`/api/audio/sessions`** → **decision: remove.** Its consumers use the purpose-built circadian/tmr routes; generic CRUD has no UX. Delete handler + shim + registry entry + smoke-test import, and note the removal in CHANGELOG. (Removal, not addition, is the honest fix; the schema table stays — `audio_sessions` remains referenced by repos.)
6. **`/api/curriculum/graph/remedial`** → add _Suggest remedial path_ to the graph page: when a skill has weak mastery ancestors, show the remedial chain returned by this engine as an annotated path (the endpoint already computes it; the UI is a list + link-to-lesson).

#### Files to touch

- `apps/web/app/analytics/page.tsx` (stats panel)
- `apps/web/app/decks/page.tsx` (share export action)
- `apps/web/app/focus/page.tsx` (distraction log section)
- `apps/web/public/sw.js` + `apps/web/src/platform/reminders.ts` (click POST) + `apps/web/app/planner/page.tsx` (engagement stat)
- `apps/web/app/graph/page.tsx` (remedial path UI)
- Delete: `apps/web/src/server/handlers/audio/sessions/route.ts`, `apps/web/app/api/audio/sessions/route.ts`, registry import+add, smoke-test import
- Tests: extend page-level route-safety coverage by _having real callers_ (that's the point); UI tests where patterns exist.

#### Test plan

- Route-safety test now passes for the right reason (UI calls exist) — add assertions that each endpoint has ≥1 non-test caller via the existing url-extraction helper.
- Handler tests for the newly-UI-exercised endpoints were previously zero (see F-16) — the handler suites added in P3 cover them; here, minimal page smoke via the existing Playwright spec pattern where feasible.
- Manual: click each new UI affordance at 360px width.

#### Acceptance criteria

- [ ] Every registry key except intentionally headless ones (none today besides `calendar.ics` which IS consumed by the calendar subscription URL) has a UI caller — verified by the url-sweep helper.
- [ ] `/api/audio/sessions` fully removed (handler, shim, registry, tests).

#### Risks & mitigations

- _sw.js breakage_ → keep the click POST in a `try/catch` with `void` (never `await` in the click path).
- _Scope creep on focus page_ → the distraction section reuses the existing allowlist list UI pattern; no new components unless a pattern repeats (§5 UI rule).

#### Estimate

~1.5 days total. Commits: one per endpoint group — `feat(web): surface review stats panel` · `feat(web): deck share-string export` · `feat(web): distraction log on focus page` · `fix(reminders): report notification clicks` · `refactor(web): remove unconsumed audio sessions route` · `feat(web): remedial path suggestions on graph page`.

---

### F-09 — Manual modes defined but not surfaced: `tutor-session-summary`, `nl-search`

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-09 / P1                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Area       | `apps/web/app/tutor/page.tsx`, `apps/web/app/search/page.tsx`, `packages/core/src/ai/manual.ts`                                                                                                                                                                                                                                                                                                                                                                        |
| Severity   | Medium (Rule 9 at risk: "every AI feature has a manual mode — works with provider `none`". The data exists; the UI never shows it, so provider-less users get a degraded fallback instead of the guided manual path)                                                                                                                                                                                                                                                   |
| Evidence   | `packages/core/src/ai/manual.ts:216-226` — `tutor-session-summary` manual mode fully specified (steps: re-read transcript, list every question you could not answer, …), **never fetched/rendered** (tutor page only wires `tutor-grade`, tutor/page.tsx:112). `manual.ts:227-236` — `nl-search` manual steps never displayed; `handlers/search/nl/route.ts:47-49,78-85` silently falls back to keyword-split, so users get results but never the guided instructions. |

#### Problem statement

Rule 9's contract is not just "a manual path exists in the handler" — the repo's own pattern (TransportPanel + `useManualMode`) treats the manual mode as _user-facing instructions_. For these two features the manual mode is unreachable data: a provider-less user on the tutor page can never see "how to do this by hand", and the search page's fallback is silent. The handler-level degradation prevents dead-ends, but the guided alternative — the actual point of rule 9 — is lost.

#### Root cause

The two features were built with handler-side fallbacks and the manual modes were registered to satisfy the enforced invariant, but the UI wiring step (fetch `GET /api/ai/transport?feature=…` → render steps) was skipped.

#### Fix design

1. **Tutor page:** after a session, when the summary action fails with `needsSetup` (or when no provider is configured at all), render a `Panel` titled "Do it by hand" with the `tutor-session-summary` manual steps (fetched via the existing `GET /api/ai/transport?feature=tutor-session-summary` envelope the tutor page already uses for `tutor-grade`). Mirror the exact pattern at tutor/page.tsx:355 (TransportPanel) — the summary case gets steps + a textarea to paste/write the summary, persisted to the session via the existing summary POST (raw-transcript path already accepts it).
2. **Search page:** when `POST /api/search/nl` returns `needsSetup`, render the `nl-search` manual steps above the keyword-split results ("try: deck:anatomy heart", quoted phrases, tag filters…) instead of silently showing fallback results. Keep the fallback results — show them _plus_ the guidance.
3. **Invariant upgrade:** extend the rule-9 test (`packages/core/tests/ai-registry.test.ts` or a new `apps/web/tests/manual-mode-surface.test.ts`) to assert that every feature whose manual mode has UI-able steps is _referenced_ by some page's `useManualMode(feature)` call — turning the silent gap into a CI failure. (Scan `app/**` for `useManualMode('...')` literals and diff against `MANUAL_MODES` keys; allowlist text-only features like `feynman-student` whose manual mode is "do it with a real person".)

#### Files to touch

- `apps/web/app/tutor/page.tsx`, `apps/web/app/search/page.tsx`
- `packages/core/src/ai/transport.ts` (no schema change expected — the transport GET envelope already carries manual mode; verify)
- `apps/web/tests/manual-mode-surface.test.ts` (new invariant test)

#### Test plan

- Unit: the invariant test fails today (proves it catches the bug) and passes after wiring.
- Handler: no change — existing degradation tests stand.
- UI manual: set provider `none` in settings → tutor summary shows steps; search shows guided hints above results.

#### Acceptance criteria

- [ ] With provider `none`, both features present their manual-mode steps in the UI.
- [ ] The surface invariant is test-enforced.

#### Risks & mitigations

- _Over-warning_ (showing manual steps to users who have a provider) → render only on `needsSetup`/provider-none state, same conditionals the TransportPanel pattern already uses.

#### Estimate

~0.5 day. Commit: `feat(ai): surface manual modes for tutor summary and natural-language search`.

---

### F-10 — Extension "friction capture" (M21 plan item) unimplemented

| Field      | Value                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ID / Phase | F-10 / P1                                                                                                                                                                                                                                                                                                                                                          |
| Area       | `apps/extension`                                                                                                                                                                                                                                                                                                                                                   |
| Severity   | Medium (the only plan-M19-M21 M21 item without code)                                                                                                                                                                                                                                                                                                               |
| Evidence   | `docs/plan-M19-M21.md` M21 lists "extension build-out — save-page-to-read + quick-add cards (done, commit d0cde48, `apps/extension/src/capture.ts`)" and "friction capture" — **no friction-capture code exists** in `apps/extension` (grep over the workspace; `manifest.json:5` only describes allowlist/friction-gate enforcement for the _web_ focus feature). |

#### Problem statement

The M21 plan promised a browser-extension counterpart to the friction system: when the user hits a blocked/distraction site during a focus session (the web app's friction gate runs in-app only), the extension should log a friction event. Today the loop is one-sided: the web app logs friction inside its own pages, but real friction (the user navigating away to a distracting site) happens in the browser, where only the extension can see it.

#### Fix design

1. **Message channel:** `apps/extension/src/friction.ts` — content/background listener for navigation events to domains on the user's distraction allowlist. The extension already syncs minimal state with the web app (`src/state.ts`, `capture.ts`); extend the pairing payload to carry the focus state (in-session? allowlist domains?) — the web app endpoint for this is the existing `GET /api/focus/bridge` (already wired: `handlers/focus/bridge/route.ts`, called from `focus/page.tsx`).
2. **Capture:** during an active focus session, a navigation to an allowlisted (blocked) domain records a friction event via `POST /api/friction` (existing endpoint, `handlers/friction/route.ts`) with `trigger: 'extension'`, `delaySec` measured as time from session start to navigation, `proceeded: true`.
3. **Calm by default:** no popups, no counters in the extension UI beyond the existing popup status line; friction logging is silent telemetry consistent with the focus page's honest-leak philosophy.
4. **Tests:** extension test runner (vitest, 3 existing suites as the pattern) — unit-test the decision function (in-session + blocked domain → event; not in session → ignore; allowlisted-but-allowed domain → ignore).

#### Files to touch

- `apps/extension/src/friction.ts` (new), `src/service-worker.ts` (wire listener), `src/state.ts` (extend sync payload), `manifest.json` (host permissions already broad for capture — verify)
- `apps/extension/tests/friction.test.ts` (new)
- `docs/plan-M19-M21.md` M21 item → ✅ after merge

#### Test plan

- Unit: decision table above (≥6 cases).
- Integration manual: pair extension with dev web app, start focus max session, navigate to blocked domain, verify `friction_events` row via `/api/friction` GET.

#### Acceptance criteria

- [ ] Friction events from the browser reach the same `friction_events` table the web focus page writes.
- [ ] Extension stays passive (no UI interruption).

#### Risks & mitigations

- _Privacy_ → friction events are local (append-only table, E2EE sync via the existing backup pipeline); document in the extension README section.
- _Chromium MV3 service-worker lifetime_ → listeners must be registered at the top level (existing capture.ts pattern already follows this).

#### Estimate

~0.5–1 day. Commit: `feat(extension): friction capture during focus sessions`.

---

### F-11 — Worker self-hosting docs promised but missing

| Field      | Value                                                                                                                                                                                                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-11 / P1                                                                                                                                                                                                                                                                                          |
| Area       | `docs/`                                                                                                                                                                                                                                                                                            |
| Severity   | Medium (explicit deliverable in the active plan; worker is a shipped component with deploy tooling)                                                                                                                                                                                                |
| Evidence   | `docs/plan-M19-M21.md:56` — "publish self-hosting docs for the worker"; no such doc in `docs/` (worker deploy is only mentioned in CHANGELOG M18 and `docs/adr/0001`). `apps/worker` exists with `wrangler`-based deploy (`apps/worker/package.json`, root `worker:deploy` — itself broken, F-02). |

#### Problem statement

The Cloudflare worker (rooms, boss raids, library share) is the only multi-user component, deployed with `npm run worker:deploy`, and its self-hosting story exists nowhere: no env/bindings list, no D1 setup, no custom-domain notes, no cost/limits discussion. Anyone self-hosting must reverse-engineer `wrangler.toml` and source.

#### Fix design

Write `docs/worker-self-hosting.md` covering (all content extracted from the actual code — no speculation):

1. What the worker does (rooms/WS relay, boss raids via `apps/worker/src/boss-raid.ts`, library share) and what it does NOT do (no auth beyond pairing codes; data lives on devices).
2. Prereqs: Cloudflare account, `wrangler`, D1 binding, KV/DO bindings as actually declared in `wrangler.toml` (list each binding, its purpose, and the source file that consumes it).
3. Deploy: `npm run worker:deploy` (post-F-02 wiring) and the manual `cd apps/worker && npx wrangler deploy` fallback; `wrangler dev` for local.
4. Configuring the web app to point at it: the online page/server registration flow (`POST /api/online/identity`, `online_servers` table) — where the self-hosted URL goes.
5. The VAPID push integration if the worker touches it (per audit, `VAPID_*` belongs to `apps/server` — clarify the split to prevent confusion, tying into F-23).
6. Limits & costs (D1 row limits, WS connections), upgrade/teardown.

#### Files to touch

- `docs/worker-self-hosting.md` (new)
- `docs/README.md` index (add the link)
- `docs/plan-M19-M21.md:56` → ✅

#### Test plan

- Follow the doc on a scratch Cloudflare account (or `wrangler dev` locally) and confirm each step works as written; note anything that diverged and fix the doc.

#### Acceptance criteria

- [ ] A newcomer can deploy the worker following only the doc + repo.

#### Risks & mitigations

- _Doc rot_ → the doc cites exact source files per binding; the `docs:curriculum`-style drift concern is acknowledged (a full doc-drift test system is out of scope here; §10 adds the PR-template checklist item).

#### Estimate

~0.5 day. Commit: `docs(worker): self-hosting guide for the rooms/raids worker`.

### F-12 — "Deck Doctor" promised in README/CHANGELOG, no code exists — build it

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-12 / P2                                                                                                                                                                                                                                                                                                                                                                                   |
| Area       | `packages/core` (doctor module), `apps/web` (handler + shim + registry + decks page)                                                                                                                                                                                                                                                                                                        |
| Severity   | High (public-facing docs promise a feature that does not exist)                                                                                                                                                                                                                                                                                                                             |
| Evidence   | `README.md:42` and `CHANGELOG.md:112` name "Deck Doctor". `grep -rin doctor` matches **only** these two files. The engine underneath exists — the 20-Rules linter (`packages/core/src/linter.ts`, rules W1–W19 at lines 235-354, cited by `docs/learning-science.md`) — but there is no "Deck Doctor" UI or API anywhere. **Approved decision: build it**, matching the README description. |

#### Problem statement

Docs promise a one-click deck health check ("Deck Doctor") that was scoped, named in the README, and never built. The honest fix — per the repo's own rule ("when this file and the code disagree, the code wins — then fix this file") — is either removing the claim or building the feature. Decision taken: build it, because the underlying engine (the linter) is complete and battle-tested, so the feature is mostly _surfacing_ + _fix actions_.

#### Problem definition (what Deck Doctor is, per README + engine reality)

A per-deck health panel that:

1. Runs every applicable linter rule over the deck's cards;
2. Presents findings grouped by rule with severity and example cards;
3. Offers **one-click fixes** for the mechanical rules and guided fixes for the human-judgment ones;
4. Shows a summary "deck health" line so the fix loop feels closed.

#### Fix design

**Layer 1 — core (`packages/core/src/doctor.ts`, new):**

```ts
/**
 * Deck Doctor: turns linter findings into an actionable, fixable plan.
 * Pure logic — no I/O (core rule). Wraps lintDeck() results with fix intents.
 */
export type DoctorAction =
  | { kind: 'delete-card'; cardId: string; rule: string; reason: string }      // leeches, dupes
  | { kind: 'suspend-card'; cardId: string; rule: string }                     // optionally suspend instead of delete
  | { kind: 'rename-deck'; deckId: string; to: string; rule: string }          // W-rule deck naming
  | { kind: 'regenerate-cloze'; cardId: string; rule: string }                 // flag for the cloze pipeline
  | { kind: 'manual'; rule: string; cardIds: string[]; hint: string }          // human-judgment rules (W10 clarity, W11…)

export interface DeckDiagnosis { deckId: string; healthScore: number; findings: LintFinding[]; actions: DoctorAction[] }

export function diagnoseDeck(input: { deck: DeckRow; cards: CardRow[] }): DeckDiagnosis
export function applyDoctorAction(...)  // returns the DB-neutral patch/delist ops the handler executes
```

- `healthScore`: 0–100, deterministic from findings (document the formula; e.g. `100 − Σ severityWeights`, clamped).
- Every rule maps to either a mechanical action (delete/suspend/rename) or a `manual` hint citing the rule's research note in `docs/learning-science.md`.

**Layer 2 — handler (`apps/web/src/server/handlers/decks/doctor/route.ts`, new):**

- `GET /api/decks/doctor?deckId=` → run `diagnoseDeck` via a repo read (`packages/db/src/repos/learning.ts` — deck + cards already have readers) and return the diagnosis (zod-validated output, rule 5).
- `POST /api/decks/doctor` `{ deckId, actions: DoctorAction[] }` → apply the mechanical actions inside one `withTransaction` (rule 6): deletes go through the existing card-delete repo path (which respects revlog append-only via tombstones), suspend toggles `cards.suspended`, rename updates the deck. XP/mastery are NOT touched here (no grading). Multi-row writes transactional; events after commit.
- Shim `app/api/decks/doctor/route.ts` + registry `import * as decksDoctor from '../server/handlers/decks/doctor/route'; add('decks/doctor', decksDoctor)` (rule 3; hub-registry test enforces).

**Layer 3 — UI (`apps/web/app/decks/page.tsx`, new panel):**

- A _Doctor_ button per deck (and in the deck editor) opening a `Sheet` (from `@/ui`): health score header, findings list grouped by rule with counts, one-click fix buttons for mechanical actions, "how to fix" hints for manual ones, and a re-run button. Calm defaults: destructive fixes (delete) require one confirmation; suspend is the suggested default for leeches (matches learning-science guidance).
- Mobile-first: the Sheet works at 360px; touch targets ≥44px; no horizontal scroll.

#### Files to touch

- `packages/core/src/doctor.ts` + `packages/core/tests/doctor.test.ts` (new)
- `apps/web/src/server/handlers/decks/doctor/route.ts` (new) + shim + registry
- `apps/web/app/decks/page.tsx` (panel)
- `apps/web/tests/decks-doctor.test.ts` (handler suite)

#### Test plan

- Core: diagnosis over fixture decks — deck with leeches → suspend/delete actions; duplicate card pairs flagged once; healthy deck → healthScore 100, zero actions; manual rules produce hints not actions; deterministic scoring.
- Handler: GET returns diagnosis for seeded deck; POST applies actions transactionally (verify cards deleted/suspended/deck renamed atomically — inject a failure to prove rollback); zod rejects malformed actions.
- UI: 360px manual check; the doctor sheet opens from deck row and deck editor.

#### Acceptance criteria

- [ ] README "Deck Doctor" claim becomes true; CHANGELOG gains the feature entry.
- [ ] Every linter rule reachable through the doctor UI (covered or explicitly listed as manual-hint).
- [ ] Registry/safety tests green; new route tested.

#### Risks & mitigations

- _Destructive actions_ → delete requires confirm; every POST action is individually logged in the response summary so users see exactly what changed; undo relies on existing backup/export (document that in the sheet footer).
- _Score gaming/confusion_ → keep the score simple and documented; it is a nudge, not a grade.

#### Estimate

~1.5 days. Commit: `feat(decks): Deck Doctor — linter-driven deck health with one-click fixes`.

---

### F-13 — 33 of 92 tables have no repo functions; 13 domains persist inline in handlers

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-13 / P2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Area       | `packages/db/src/repos/*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Severity   | Medium (architecture-consistency debt; the direct cause of F-14 — handlers query drizzle inline, so nothing else can reuse the queries)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Evidence   | `packages/db/src/repos/index.ts` re-exports 23 repo modules covering 59 of 92 tables. Tables with **no** typed repo API: `notes`, `note_links`, `note_bullets`, `revlog_undos`, `images`, `mnemonic_tables`, `sources`, `highlights`, `sq3r_sessions`, `goals`, `habits`, `habit_logs`, `commitments`, `journal_entries`, `quotes`, `goals_quotes`, `idea_links`, `quests`, `achievements`, `elo_events`, `distraction_apps`, `ifthen_plans`, `routines`, `routine_steps`, `physio_log`, `canvases`, `chat_sessions`, `study_plans`, `schema_migrations`, `sync_tombstones`, `sync_configs`, `sync_devices`. (`search.ts`/`retrieval.ts` touch a few via raw-SQL FTS only.) |

#### Problem statement

AGENTS.md §5: _"Put reusable queries in `packages/db/src/repos/<domain>.ts` so web, MCP and CLI share them."_ Inline persistence means each domain's queries are trapped in `apps/web` handlers — the direct cause of the 13-domain MCP/CLI gap (F-14). It also means query logic (filters, ordering, date-window math) is duplicated or web-shaped and untestable in `packages/db` where the strong test fixtures live.

#### Root cause

Repos grew opportunistically: a repo was extracted when a _second_ caller appeared, and for most domains the second caller (MCP/CLI) never came — so nothing forced the extraction. The docstring in `repos/index.ts` even encodes this policy ("put a query here as soon as a second caller needs it"); F-14 makes the second caller arrive _by plan_, which flips the policy trigger.

#### Fix design

Extract repos in **domain batches** (one commit per batch, pure moves — no behavior change):

| Batch                        | New repo module(s)                                                                                                            | Tables moved                                             | Primary caller today                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| B1 notes/journal             | `repos/notes.ts`, `repos/journal.ts`                                                                                          | `notes`, `note_links`, `note_bullets`, `journal_entries` | handlers notes, journal                                        |
| B2 habits/commitments        | `repos/habits.ts`, `repos/commitments.ts`                                                                                     | `habits`, `habit_logs`, `commitments`                    | handlers habits, commitments                                   |
| B3 reading                   | `repos/reading.ts`                                                                                                            | `sources`, `highlights`, `sq3r_sessions`                 | handlers reading (+ sq3r/highlights/ingest/exposure)           |
| B4 goals/quests/achievements | `repos/goals.ts` (goals + goals_quotes + ifthen_plans), `repos/quests.ts` (quests + achievements)                             | 5 tables                                                 | handlers goals, quests, achievements, motivation page          |
| B5 quotes/ideas-links        | `repos/quotes.ts`                                                                                                             | `quotes`, `goals_quotes`*, `idea_links`                  | handlers quotes, ideas (*goals_quotes belongs with B4; adjust) |
| B6 physio/canvases/chat      | `repos/physio.ts`, `repos/canvas.ts` (canvases + chat_sessions)                                                               | 3 tables                                                 | handlers physio, canvas, tutor/chat                            |
| B7 images/sync/infra         | `repos/images.ts`, `repos/sync-meta.ts` (sync_configs, sync_devices, sync_tombstones), leave `schema_migrations` runner-owned | 6 tables                                                 | handlers images, sync, backup                                  |
| B8 focus extras              | `repos/focus-extras.ts` (distraction_apps, routines, routine_steps)                                                           | 3 tables                                                 | handlers distractions, focus                                   |
| B9 misc                      | `repos/images.ts` images already in B7; `mnemonic_tables` → `repos/memory.ts` (palaces repo neighborhood)                     | 1 table                                                  | handlers palace/memory features                                |

Rules for every batch:

- Pure move: same SQL semantics (filters, ordering, column selection), parameterized by explicit arguments — no hidden `Date.now()` inside repos (time comes in as a parameter; keeps tests deterministic).
- Every exported function gets JSDoc (what + why + units/invariants).
- Handlers switch to repo calls; **zero behavior change** verified by the existing handler/e2e suites.
- `repos/index.ts` re-exports each new module; the repo-count docs (F-20) updated after the batches land.
- `elo_events` and `revlog_undos` move into the mastery-service work (F-01) rather than a generic repo — they are grading-path internals; only expose narrowly-typed helpers there.
- `schema_migrations` stays runner-owned (no repo — deliberate, note it in index.ts).

#### Files to touch

- `packages/db/src/repos/*.ts` (9 new modules) + `repos/index.ts`
- The corresponding handler files in `apps/web/src/server/handlers/**` (switch to repo imports)
- `packages/db/tests/<batch>-repo.test.ts` per batch (B1–B9)

#### Test plan

- Per batch: repo unit tests with the established db-test fixture pattern (see `packages/db/tests/*-repo.test.ts`), covering the happy path + the filter/edge cases the handler tests previously exercised implicitly.
- The existing web handler + e2e suites are the behavior-preservation net; they must pass unchanged.

#### Acceptance criteria

- [ ] Table-without-repo count drops from 33 to the deliberate-exception set (`schema_migrations` only, plus grading internals owned by F-01's service).
- [ ] `git grep "from '@/lib/db'"` in handlers shows only imports for transaction scope, not raw queries (spot audit).

#### Risks & mitigations

- _Mechanical-move regressions_ → pure-move discipline + the existing suites; keep diffs reviewable (one batch per commit).
- _Over-abstraction_ → repos expose only what current callers need; no speculative APIs.

#### Estimate

~2–3 days total. Commits: `refactor(db): extract notes and journal repos` (and one per batch).

---

### F-14 — 13 core domains unreachable from MCP and CLI

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-14 / P2                                                                                                                                                                                                                                                                                                                                                                                                            |
| Area       | `apps/mcp`, `apps/cli`, (dep: F-13 repos)                                                                                                                                                                                                                                                                                                                                                                            |
| Severity   | Medium (agent/terminal parity gap; the repo's whole pitch is "one codebase, every platform" incl. agents)                                                                                                                                                                                                                                                                                                            |
| Evidence   | Domains with zero MCP tool and zero CLI command: habits, journal, physio, reading, gkt, guilds/social, world, dialectic, boss/games, spatial palaces, audio/TMR, cognitive-load telemetry, study-plan/agenda. Persistence exists (tables; repos after F-13). MCP has 27 tools today (`apps/mcp/src/index.ts` + `tools/curriculum.ts` + `tools/cognitive.ts`); CLI has 13 commands (`apps/cli/src/index.ts:557-623`). |

#### Problem statement

An agent driving Learning HUB over MCP (or a user in a terminal) can manage reviews, curriculum, ideas, notes, goals, focus, and workload — but cannot log a habit, write a journal entry, read physiology data, manage reading sources, or query the study plan. The gap is not conceptual: the queries exist (trapped in handlers until F-13), the zod schemas exist in core, and both hosts have established tool-registration patterns (`ctx.mcpTools`/`ctx.cliCommands` plugin points, `apps/mcp/src/tools/*` modules).

#### Fix design

Add MCP tools + CLI commands per domain, in **parity batches** (one commit per batch after its F-13 repos land). Design rules:

- **Tool surface = the domain's real verbs, kept minimal.** MCP tools are for agents; CLI commands are for humans. Each domain gets 1–3 MCP tools and 1 CLI command with subcommands where natural.
- **zod at every boundary** (rule 5): tool args validated with schemas imported from `packages/core` (extend the domain schema files where needed).
- **One grading path preserved** (rule 7): any tool that records a _review_ must call `executeReview`; tools that log events (journal/habit/physio) go through repos + `awardXp` (F-03), never hand-rolled FSRS/mastery writes.
- **Manual mode n/a** — these are not AI features.
- **Tests:** every new MCP tool gets a case in `tests/e2e/tier1-features/api-mcp-tools.test.ts` pattern; CLI commands in `tests/e2e/tier1-features/cli-commands.test.ts` pattern; TEST_INFRA.md updated (F-26).

| Batch | Domain         | MCP tools (suggested)                  | CLI command (suggested)          | Notes                                                                        |
| ----- | -------------- | -------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| C1    | habits         | `habit_list`, `habit_checkin`          | `habits list                     | checkin                                                                      | history`                                  | tzOffset param pattern from web handler           |
| C1    | journal        | `journal_write`, `journal_search`      | `journal write                   | show`                                                                        | weekly rollup stays web-side              |
| C1    | physio         | `physio_log` (get+put)                 | `physio`                         | sleep/exercise/caffeine fields from core `physio.ts`                         |
| C2    | reading        | `reading_list`, `reading_add`          | `reading list                    | add                                                                          | finish`                                   | sources CRUD; highlights stay web-only (UI-heavy) |
| C2    | study-plan     | `study_plan_get`, `study_plan_set`     | `plan today                      | week`                                                                        | reuses core `ics`/planner logic           |
| C2    | gkt            | `gkt_session` (start/answer)           | `gkt drill`                      | uses `repos/gkt`                                                             |
| C3    | dialectic      | `dialectic_arena` (list/propose/vote)  | `debate list                     | open`                                                                        | repos/dialectic exists                    |
| C3    | spatial        | `palace_list`, `palace_add_locus`      | `palace list                     | add`                                                                         | 3D scene authoring stays web-only         |
| C3    | world          | `world_state`, `world_market_buy`      | `world status                    | market`                                                                      | coin economy reads/writes via repos/world |
| C3    | guilds/social  | `guild_list`, `guild_join`             | `guild list                      | join`                                                                        | leaderboards stay web/worker-side         |
| C4    | audio/TMR      | `audio_schedule` (commute/tmr get/set) | `audio schedule`                 | no audio playback from hosts — scheduling only                               |
| C4    | cognitive-load | `cognitive_load_report`                | `focus load` (report subcommand) | reads `cognitive_telemetry_events` via repo                                  |
| C4    | boss/games     | `boss_status` (read-only)              | `games status`                   | battle _participation_ is web/worker realtime; agents get observability only |

Deliberate exclusions (documented, not gaps): realtime/social _participation_ flows that require the worker WebSocket; visual editors (canvas, mindmap, palace-3D authoring); the E-Ink/soundscape settings surfaces.

#### Files to touch

- `apps/mcp/src/tools/{habits,journal,physio,reading,plan,gkt,dialectic,spatial,world,social,audio,cognitive}.ts` (new tool modules, registered in `apps/mcp/src/index.ts`)
- `apps/cli/src/index.ts` (new commands + subcommand dispatch)
- `packages/core/src/<domain>` schema extensions where tool args need them
- e2e: `tests/e2e/tier1-features/api-mcp-tools.test.ts`, `tests/e2e/tier1-features/cli-commands.test.ts` (extend), plus `docs/ENGINE-REFERENCE.md` tool list (F-20 updates counts)

#### Test plan

- Every tool: valid-args happy path + zod-rejection case, against the seeded db (e2e harness pattern already used for the 27 existing tools).
- Every CLI command: run via the existing CLI e2e harness; assert output shape.
- Rule-7 guard: no new tool imports FSRS/mastery write paths directly (grep check in the batch commits).

#### Acceptance criteria

- [ ] All 13 domains reachable from both hosts (or explicitly documented as excluded with reason).
- [ ] MCP tool count in docs updated from 27 → new total; CLI command list likewise.

#### Risks & mitigations

- _Tool sprawl confusing agents_ → tool descriptions follow the existing house style (one line what + units/invariants); namespaced like the curriculum tools; documented in ENGINE-REFERENCE.
- _XP double-award via both hosts_ → awardXp is insert-only per event with idempotency keys where the source supports it (habit date-unique, journal date-unique) — same guarantees the web handlers already rely on.

#### Estimate

~3–4 days total. Commits: `feat(mcp,cli): habits/journal/physio parity` (per batch).

### F-15 — Core modules with zero unit tests: habits, media, quotes, reading, bkt

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ID / Phase | F-15 / P3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Area       | `packages/core/tests`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Severity   | Medium (pure-logic modules — the cheapest, highest-value tests in the repo)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Evidence   | `src/habits.ts` (dopamine menu, habit-loop model) — no test imports it · `src/media.ts` (podcast script + study guide generation) — only consumer is `handlers/ai/generate/route.ts` · `src/quotes.ts` (`dailyQuote`) — used via barrel in `handlers/quotes/route.ts:5` · `src/reading.ts` (incremental reading, highlight strength) — only e2e-covered · `src/bkt.ts` — only indirect coverage via `curriculum.test.ts:18` (no dedicated suite for the BKT math itself) · `src/curriculum/pedagogy.ts` — covered only incidentally inside curriculum suites · `src/ai/{json,manual,port,prompts,settings}.ts` — only suite-level coverage via ai-registry/ai-transport tests. |

#### Problem statement

These modules are pure logic — the layer where the repo's architecture says tests are cheap and mandatory ("add tests for every new function", AGENTS.md §4.5). Their behavior (quote rotation, habit streak/freezes math, BKT posterior updates, highlight strength decay, podcast script structure) is currently guarded only by incidental integration paths. A regression in BKT, for example, silently corrupts the mastery model — exactly the module that deserves a dedicated suite.

#### Fix design

One suite per module, following the existing core test idiom (fixture builders, table-driven cases, no mocks — pure functions):

| Suite                    | Must cover                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/habits.test.ts`   | habit-loop model fields; dopamine menu item validation; streak computation incl. freezes and the weekend amulet (`src/streaks.ts:71` interplay); date-boundary cases (tzOffset handling mirrored from the web handler) |
| `tests/media.test.ts`    | podcast script structure (segments, lengths, card references); study-guide output shape; deterministic output for fixed input; the manual-mode integration points                                                      |
| `tests/quotes.test.ts`   | `dailyQuote` rotation (no repeats within window, deterministic per day), tags/context filtering                                                                                                                        |
| `tests/reading.test.ts`  | incremental-reading scheduling; highlight strength decay + triage transitions; SQ3R step model (`extractSurveyHeadings` already covered in reading handler tests — keep the boundary here)                             |
| `tests/bkt.test.ts`      | posterior update direction/magnitude for correct/incorrect; `isMastered`/`unlockProbability` thresholds; DEFAULT_BKT parameter sanity; convergence over long sequences                                                 |
| `tests/pedagogy.test.ts` | `examCountdownPlan`, `optimalGapDays`, `backwardDesign`, `buildMockExam`, `expressiveWritingPrompt`, `BLOOM_VERBS` — the public API list from `docs/learning-science.md`                                               |

The ai/* micro-modules get covered as a byproduct of the invariant test in F-09 plus one `tests/ai-modules.test.ts` for `extractJson` edge cases beyond the existing garbage-input case (nested arrays, fenced JSON, trailing prose).

#### Files to touch

- 7 new test files in `packages/core/tests/` (no source changes unless tests expose real bugs — if they do, fix the bug in the same commit and say so in the message).

#### Test plan

- This work _is_ the test plan. Run `npm test -w @learning-hub/core` and `npm run typecheck`.

#### Acceptance criteria

- [ ] Every module listed above has a dedicated suite with ≥8 meaningful cases.
- [ ] Coverage of `packages/core/src` no longer has zero-hit files (spot check via the test-file↔source mapping).

#### Risks & mitigations

- _Tests exposing real bugs_ → expected and welcome; each bug fixed in its own commit referencing the test.

#### Estimate

~1.5 days. Commit: `test(core): dedicated suites for habits, media, quotes, reading, bkt, pedagogy`.

---

### F-16 — ~30 handler folders with zero coverage of any kind

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-16 / P3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Area       | `apps/web/tests` (handler suites)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Severity   | High (the largest coverage hole; several of these are data-critical: backup, sync, push, import/export, fsrs/optimize)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Evidence   | Dedicated handler test files exist only for curriculum, review, insights/untested, goals, audio/circadian/commute (+ `routes-smoke.test.ts` shallow import checks for ~44 shims). Handler folders with **no** test of any kind: backup, calendar, canvas, commitments, dashboard, distractions, embeddings/index, export, friction, fsrs/optimize, images, import, ingest, onboarding, palace, physio, plugins, push, quotes, search (+nl), spatial, starter, study-plan, sync, timeline, tutor, weekly, workload, world (7 routes), dialectic, ideas (5 routes), notes (2 routes). Several are e2e-covered (ideas/notes/world-adjacent), but **backup/export/import/sync/push/fsrs-optimize/workload/tutor/dialectic/spatial/palace have zero automated coverage anywhere**. |

#### Problem statement

The riskiest code in the repo — data backup/restore, cloud sync, FSRS optimization (which _rewrites memory state of every card in a deck_), push delivery, import parsing — has no tests. The repo's own test culture (68 core suites, 29 db suites) demonstrates the standard; the handler layer simply predates or bypassed it.

#### Fix design

Handler suites follow the two established patterns:

- **Full behavior suite** (pattern: `tests/goals-ifthen.test.ts`, `tests/curriculum-api.test.ts`) — for handlers with real logic: backup (merge modes), sync (device roster, E2EE round-trip with the existing `sync-crypto` helpers), push (subscription lifecycle), fsrs/optimize (weights applied + undo), workload (balance/catch_up due-shifts), import (format parsing incl. adversarial fixtures already used by `scripts/adversarial-challenger1-anki.ts`), export (deck/APKG/JSON formats), images (upload/serve), search + search/nl (FTS + manual fallback), onboarding/detox, weekly, dashboard, timeline, starter, calendar (ics shape).
- **Smoke + contract suite** (pattern: existing `routes-smoke.test.ts` entries) — for thin CRUD: canvas, commitments, distractions, friction, palace (+[id]), physio, plugins/contributions, quotes, spatial, study-plan, tutor, world (7 routes), dialectic, ideas (5), notes (2), embeddings/index, ingest, mindmaps (already partly smoke-covered — extend to behavior where cheap).

Priority order (risk-ranked): backup → sync → fsrs/optimize → import/export → push → workload → search/nl → the rest.

Each suite: Request→Response via the handler export (no HTTP server needed — the handlers are runtime-neutral by design), zod-rejection cases, auth-less happy path (handlers have no auth by design), and for sync/backup the **round-trip property**: export → wipe → import → identical row sets (the strongest single assertion this whole plan can add).

#### Files to touch

- ~30 new/extended files in `apps/web/tests/` (grouped: ~10 full suites + ~6 smoke-extended files covering the remaining folders)

#### Test plan

- `npm test -w @learning-hub/web` must pass with all new suites; each new suite also runs in the root `npm test` workspace fan-out.

#### Acceptance criteria

- [ ] Every handler folder in the audit list has ≥1 suite (full or smoke+contract).
- [ ] The backup/export/import round-trip property test exists and passes.
- [ ] fsrs/optimize test asserts weights land on cards and an undo path exists.

#### Risks & mitigations

- _Test runtime growth_ → these are node-side handler tests (no browser); the suite stays fast. Watch CI duration after landing; parallelize via existing vitest config if needed.

#### Estimate

~3 days (risk-ranked; the top 6 suites are the 80% value). Commit: `test(web): handler suites for uncovered routes (risk-ranked)` — plus split commits if the diff gets large.

---

### F-17 — Nine+ e2e user flows uncovered

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-17 / P3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Area       | `tests/e2e/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Severity   | Medium (flows that span multiple handlers/features — the classes of bugs unit tests cannot see)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Evidence   | Existing coverage: db integrity, deck/card CRUD, review queue/FSRS, notes+ideas+graph, focus+goals+habits, curriculum+analytics+reading, CLI, MCP, curriculum-agents, tier2 boundary validation, tier3 cross-feature, tier4 application scenarios. Uncovered flows identified by the audit: **backup/export/import round-trip · cloud sync (mock-WebDAV convergence exists in `packages/db/tests/sync-devices.test.ts` — extend to the HTTP API surface) · AI chat streaming surface · images upload→review attempt-image · APKG import · world economy loop · dialectic arena flow · palace-3d CRUD · workload rebalancing · reminders/notification engine · web push delivery (requires VAPID env in harness) · native hub-worker path (documented-manual; needs a Tauri context)**. |

#### Problem statement

Cross-feature flows are where rule interactions bite (e.g., import → linter → review → xp events; backup merge after a sync convergence). None of the multi-step data-critical journeys are exercised end-to-end today.

#### Fix design

Add to `tests/e2e/` (following the tier structure):

| New file                           | Flow                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `tier2/backup-roundtrip.test.ts`   | seed → export (merge + full modes) → mutate → restore → row-set equality; includes images + attempt images                  |
| `tier2/sync-api.test.ts`           | two "devices" through the HTTP sync API surface (roster, push/pull, tombstones), building on the db-level convergence tests |
| `tier2/import-apkg.test.ts`        | APKG fixture → import → decks/cards shaped correctly → first review path                                                    |
| `tier3/world-economy.test.ts`      | coins → market buy → plot/avatar state transitions + ledger append-only check                                               |
| `tier3/dialectic-flow.test.ts`     | arena open → turn → verdict → xp via awardXp                                                                                |
| `tier3/workload-rebalance.test.ts` | overload deck → balance + catch_up → due windows shifted, revlog untouched                                                  |
| `tier3/palace3d-crud.test.ts`      | palace + 3d scene CRUD + card locus assignment                                                                              |
| `tier3/images-flow.test.ts`        | upload → serve → attempt-image attach → review with image                                                                   |
| `tier4/ai-streaming.test.ts`       | ai/chat stream surface with a scripted provider (manual-mode-aware: provider none → transport envelope)                     |

Native hub-worker path: remains a **manual checklist item** (needs a webview; document the steps in docs/native.md — no CI claim).

#### Files to touch

- 9 new e2e files + `docs/TEST_INFRA.md` listing update (F-26)

#### Test plan

- `npm run test:e2e` green including the new files; watch for the VAPID env the push flow needs (F-23 documents the vars; the push e2e is optional/documented if env is absent — skip-by-missing-env, never skip silently in code).

#### Acceptance criteria

- [ ] All listed flows have automated coverage except the documented manual ones (native worker, push-without-VAPID).

#### Risks & mitigations

- _E2E flakiness_ → all flows are API/db level (no browser) except ai-streaming, which uses a scripted provider — deterministic by construction.

#### Estimate

~2 days. Commit: `test(e2e): cover backup roundtrip, sync API, apkg, world, dialectic, workload, palace3d, images, ai-streaming`.

---

### F-18 — Playwright UI smoke suite exists but never runs in CI

| Field      | Value                                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ID / Phase | F-18 / P3                                                                                                                                                                                                                                                                                                          |
| Area       | `.github/workflows/ci.yml`, `apps/web/playwright.config.ts`, `apps/web/tests/ui/smoke.spec.ts`                                                                                                                                                                                                                     |
| Severity   | Medium (the only real-browser test in the repo — dashboard → review → lesson → backup export/restore in Chromium — is dead weight until CI runs it)                                                                                                                                                                |
| Evidence   | `apps/web/package.json:20`-adjacent `test:ui` script → Playwright, `testDir './tests/ui'`, `UI_SMOKE_PORT` env (playwright.config.ts:22,29,30); `tests/ui/smoke.spec.ts` + `tests/ui/setup/with-test-server.mjs` exist and work locally; `ci.yml` has no Playwright step; TEST_INFRA.md doesn't mention the suite. |

#### Problem statement

A working browser smoke suite was built and then never wired into CI — the exact "half-wired" pattern this plan keeps finding. Every UI regression (broken import, hydration crash, nav regression) currently reaches users before any test sees it.

#### Fix design

1. Add a CI job/step after the existing e2e step: `npm run test:ui` with `UI_SMOKE_PORT` pinned, browser install step (`npx playwright install --with-deps chromium`), artifact upload of `test-results/` + `playwright-report/` on failure.
2. Keep it on the same ubuntu runner (headless Chromium) to avoid matrix cost; set a generous timeout (the suite boots the Next server via `with-test-server.mjs`).
3. TEST_INFRA.md gains the suite description (with F-26).
4. Optionally gate on `workflow_dispatch` + main-branch pushes first (smoke suites can be flaky on shared runners) — start on main pushes + PRs; downgrade to scheduled if flaky, never silently.

#### Files to touch

- `.github/workflows/ci.yml`
- `docs/TEST_INFRA.md`

#### Test plan

- The CI run itself is the test; locally `npm run test:ui` must pass before pushing the change.

#### Acceptance criteria

- [ ] CI includes the Playwright step and reports failures as job failures with artifacts.

#### Risks & mitigations

- _Runner flakiness_ → retries configured in playwright.config (already standard); artifact upload for diagnosis; documented fallback to scheduled runs if the runner is the bottleneck.

#### Estimate

~2 hours. Commit: `ci: run the Playwright UI smoke suite`.

### F-19 — README "Roadmap (deferred)" stale: 3 of 6 items shipped

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-19 / P4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Area       | `README.md` (lines 174-180)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Severity   | Low (reader trust)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Evidence   | README deferred roadmap: "Multi-device sync v1 (E2EE)" — **shipped** (migration 021, `packages/db/src/sync.ts`, sync roster + convergence tests, CHANGELOG M19) · "AI video-call roleplay" — genuinely still deferred, no code (never started) · "Party boss battles" — **shipped** (`apps/worker/src/boss-raid.ts`, CHANGELOG M21) · "FSRS optimizer UI" — **shipped** (`packages/core/src/fsrs-optimizer.ts`, `handlers/fsrs/optimize/route.ts`, settings/page.tsx:608) · "Browser-extension friction capture" — partial (quick-add + save-to-read done; capture lands via F-10) · "Full CRDT sync" — deferred by design (`docs/plan-M19-M21.md:28`). |

#### Problem statement

The "deferred" list advertises as future work three things users already have, which erodes trust in the README the same way GAP-14 (Deck Doctor) does in the opposite direction.

#### Fix design

Rewrite the section to the truth:

```markdown
## Roadmap (deferred)

- AI video-call roleplay — deliberate: synchronous video adds hosting cost and
  complexity; the voice tutor (offline-capable) covers the pedagogy today.
- Full CRDT sync — LWW sync v1 is live; CRDT merge is the follow-up when
  concurrent-edit evidence justifies it (see docs/plan-M19-M21.md).
```

(The two shipped items move out of the list entirely — they live in the CHANGELOG/systems list where they already appear; no need to double-list.)

#### Files to touch

- `README.md` (section rewrite, ~10 lines)

#### Test plan

- None (docs). Sanity: `grep -n "Deck Doctor\|Roadmap" README.md` consistent after all P4 doc commits.

#### Acceptance criteria

- [ ] Every remaining roadmap item is genuinely unbuilt; every shipped item is off the list.

#### Risks & mitigations

- None.

#### Estimate

~30 minutes. Commit: `docs(readme): refresh deferred roadmap to reality`.

---

### F-20 — Doc drift: monorepo maps omit two apps; MCP "14 tools" → 27; "45 tables" → 92; stale optimizer note

| Field      | Value                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-20 / P4                                                                                               |
| Area       | `ARCHITECTURE.md`, `AGENTS.md`, `docs/ENGINE-REFERENCE.md`, `README.md`                                 |
| Severity   | Medium (AGENTS.md is the operating manual for every future agent — a wrong map is a wrong mental model) |
| Evidence   | ① `ARCHITECTURE.md:41` "apps/mcp                                                                        | MCP stdio server: 14 tools + 3 resources"; `README.md:67` and `README.md:121` repeat "14 tools" — actual: **27 built-in** (+ plugin contributions). ② ARCHITECTURE.md and AGENTS.md §2 maps list only web/server/mcp/cli/native — `apps/worker` (Cloudflare worker) and `apps/extension` (browser extension) exist, ship scripts/tests, and are referenced by root `worker:deploy` and CHANGELOG. ③ `docs/ENGINE-REFERENCE.md:49` "45 tables, pushed" — actual **92** (`grep -c "= table(" schema.ts`). ④ `docs/ENGINE-REFERENCE.md:27` "personalization: collect revlog rows; optimizer integration is deferred" — the optimizer exists (`packages/core/src/fsrs-optimizer.ts` + settings UI). ⑤ `README.md:81-88` provider table omits the `google` Gemini adapter that ARCHITECTURE.md:36 lists and `@ai-sdk/google` ships. |

#### Problem statement

The repo's three "source of truth" docs (AGENTS.md, ARCHITECTURE.md, ENGINE-REFERENCE.md) all carry stale numbers and an incomplete map. Every future agent/human reads these first; wrong maps produce wrong plans.

#### Fix design

1. **Maps:** AGENTS.md §2 and ARCHITECTURE.md monorepo map gain:

   ```
   apps/worker          Cloudflare worker: rooms, boss raids, library share (deploy: npm run worker:deploy)
   apps/extension       Browser extension: quick-add cards, save-to-read, friction capture (M21)
   ```

   plus the dependency note: `apps/worker` uses `packages/db`-adjacent types only (verify actual imports and document honestly; do not invent a dependency arrow that doesn't exist).

2. **Counts:** "14 tools" → "27 built-in tools + plugin contributions" (single phrasing, all three files). ENGINE-REFERENCE "45 tables" → "92 tables (see schema.ts; migrations 001–026)" — and add a pointer that the number is regenerated by the audit script in §10.4 so it can be re-verified.
3. **Optimizer note:** ENGINE-REFERENCE personalization line becomes "personalization: on-device FSRS optimization (`packages/core/src/fsrs-optimizer.ts`), integrated via `/api/fsrs/optimize` and the settings UI".
4. **Provider table:** README gains the `google` row (model naming per `@ai-sdk/google`, BYO key), matching ARCHITECTURE.md.
5. After F-13/F-14 land, the repo counts in these docs get their _final_ values (repos 25 → 34, MCP 27 → ~40) — do the count updates in the same commits that change reality, then this finding's commit fixes the already-stale ones.

#### Files to touch

- `AGENTS.md`, `ARCHITECTURE.md`, `docs/ENGINE-REFERENCE.md`, `README.md`

#### Test plan

- `packages/core/tests/curriculum-docs.test.ts` covers curriculum-doc drift only; add the lightweight doc-count check to the §10.4 script (counts `= table(` and MCP tool registrations, greps the docs for the number — fails on drift).

#### Acceptance criteria

- [ ] All four docs agree with the code; the drift check is CI-green.

#### Risks & mitigations

- _Docs churn_ → the drift check only pins the numbers most likely to rot (tables, tools), not prose.

#### Estimate

~3 hours. Commit: `docs: sync architecture maps and engine counts with the code`.

---

### F-21 — learning-science.md: "no leaderboards" principle contradicted by shipped leaderboard; stale legend

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-21 / P4                                                                                                                                                                                                                                                                                                                                                                     |
| Area       | `docs/learning-science.md`                                                                                                                                                                                                                                                                                                                                                    |
| Severity   | Low (internal contradiction in the research-grounding doc)                                                                                                                                                                                                                                                                                                                    |
| Evidence   | learning-science.md §6 SDT entry (~lines 329-331) claims "no leaderboards" as a design principle; a leaderboard system ships: `handlers/social/leaderboard/route.ts` + `games/page.tsx:610-633` UI + guilds. Also: the status legend (line 12) references "M3/M4/M5 of the current expansion" while the active plan is M19–M21 (numbering rot; every item in the file is ✅). |

#### Problem statement

The learning-science doc is the repo's contract that every feature is research-grounded. An internal contradiction ("no leaderboards" + shipped leaderboards) undermines that contract: either the principle is wrong, or the feature label is. Reality: the shipped system is **opt-in, cohort-scoped, and non-ranking by default** (guilds + seasons with personal-best framing), which is compatible with SDT if described honestly — the doc's absolute phrasing is what's wrong.

#### Fix design

1. Rewrite the SDT bullet: _"Leaderboards are opt-in and cohort-scoped (guilds), framed on personal-best trajectories rather than global ranking — preserving competence and relatedness without social-comparison pressure (see `social/leaderboard`, `guilds`)."_ — grounded in the actual feature semantics.
2. Fix the legend numbering (M3/M4/M5 → "the cognitive expansion milestones (see docs/plan-M19-M21.md)").

#### Files to touch

- `docs/learning-science.md` (two spots)

#### Test plan

- None.

#### Acceptance criteria

- [ ] No statement in the doc contradicts shipped behavior.

#### Risks & mitigations

- None.

#### Estimate

~20 minutes. Commit: `docs(learning-science): reconcile leaderboard principle and milestone numbering`.

---

### F-22 — plan-M19-M21: M20/M21 items shipped but plan still lists them as future

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-22 / P4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Area       | `docs/plan-M19-M21.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Severity   | Low                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Evidence   | Still listed as future although shipped: exam simulator (`app/exam-sim/page.tsx` + `handlers/curriculum/exam/simulator/route.ts`, CHANGELOG released) · weakness radar v2 (`curriculum/skills/weakness-v2`) · voice tutor (`app/voice-tutor/page.tsx` + `tutor/voice-session`) · Whisper STT groundwork (`lib/stt-client.ts`) · FSRS optimizer UI (settings:154,219 + decks:142). Honest exceptions: "Real two-device sync drill" (📋 physical, stays open) · "per-deck retune with forecast preview" nuance may remain (verify at fix time; mark honestly) · "extension friction capture" → ✅ after F-10 · "worker self-hosting docs" → ✅ after F-11. |

#### Problem statement

The active plan document is the tracker for exactly the work this master plan executes; leaving shipped items unchecked and landed items unmarked makes it useless as a tracker.

#### Fix design

- Mark all shipped items ✅ with the evidence file path (matching the file's existing status-line convention).
- Keep genuinely-open items 🚧/📋: device drill (physical), forecast-preview nuance (verify), plus a new pointer: "ongoing fixes → see docs/plans/MASTER-FIX-PLAN.md".

#### Files to touch

- `docs/plan-M19-M21.md`

#### Test plan

- None.

#### Acceptance criteria

- [ ] The plan doc's checkboxes match reality after P0–P4.

#### Risks & mitigations

- None.

#### Estimate

~30 minutes. Commit: `docs(plan): mark shipped M20/M21 items and link the master fix plan`.

---

### F-23 — `.env.example` missing five documented-by-usage vars

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-23 / P4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Area       | `.env.example`, `docs/api-server.md`, `docs/plugins.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Severity   | Low (self-hosters discover required vars by crash)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Evidence   | Used in code but absent from `.env.example` and docs: `VAPID_PUBLIC_KEY` (`apps/server/src/push.ts:21`, `apps/server/src/digest.ts:60`, `apps/web/src/server/handlers/push/route.ts:16`), `VAPID_PRIVATE_KEY` (`push.ts:22`, `digest.ts:60`), `VAPID_SUBJECT` (`push.ts:26`) — web-push for the headless server · `LEARNING_HUB_TARGET` (`apps/web/next.config.ts:14`, set by `scripts/tauri-web.mjs:25` — build tooling, not user-facing) · `NEXT_PUBLIC_LEARNING_HUB_TARGET` (derived by next.config.ts:38, consumed at `src/lib/transport.ts:42`). |

#### Problem statement

The push feature silently no-ops (or errors) without VAPID keys, and nothing tells a self-hoster those keys exist. The two TARGET vars are tooling-internal but deserve a "do not set by hand" note so future debugging isn't confusing.

#### Fix design

`.env.example` gains (with comments stating optional/required and where consumed):

```bash
# Web-push (headless server digest + /api/push). Optional: push disabled when unset.
# Generate: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com

# Build-target selectors — set by scripts (tauri-web.mjs / next.config.ts). Do not set by hand.
# LEARNING_HUB_TARGET=web|tauri
# NEXT_PUBLIC_LEARNING_HUB_TARGET=web|tauri
```

`docs/api-server.md` documents the push env trio; `docs/plugins.md` webhook section cross-references. (UI_SMOKE_PORT stays Playwright-internal, documented in TEST_INFRA.md by F-26 instead.)

#### Files to touch

- `.env.example`, `docs/api-server.md`, `docs/plugins.md`

#### Test plan

- Follow-up in F-17's push e2e: harness sets the trio, proving the docs' instructions work.

#### Acceptance criteria

- [ ] Every `process.env` key used in production code is either in `.env.example` (user-facing) or documented as tooling-internal.

#### Risks & mitigations

- None.

#### Estimate

~1 hour. Commit: `docs(env): document web-push VAPID keys and build-target selectors`.

---

### F-24 — CI lacks commitlint + prettier check; rule 1 (raw fetch in UI) unenforced by eslint

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-24 / P4                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Area       | `.github/workflows/ci.yml`, `eslint.config.mjs`, `.husky/*`                                                                                                                                                                                                                                                                                                                                                                                       |
| Severity   | Medium (7 of 13 AGENTS.md hard rules have zero enforcement; commit messages validated only by local hooks)                                                                                                                                                                                                                                                                                                                                        |
| Evidence   | ① commitlint runs only via the local husky `commit-msg` hook (`.husky/commit-msg`); CI never validates commit titles. ② `format:check` script exists (`package.json:25`) but isn't in CI. ③ Rule 1 (no raw fetch in UI) has no lint rule — today it holds only by convention; `route-safety.test.ts` checks transport-call shape but cannot detect raw `fetch(`. Rules 5/6/7/8/11/12 similarly unenforced (see §10 for the enforcement strategy). |

#### Problem statement

Local hooks are skipped by `--no-verify` and don't exist for fresh clones' first contributions; CI is the only enforcement point everyone shares. Meanwhile the single most native-breaking mistake an AI contributor can make (raw `fetch` in UI — rule 1) is invisible to every check.

#### Fix design

1. **CI commitlint:** a step running `npx commitlint --from origin/main --to HEAD` (or `--from <merge-base>`) on PRs — validates every commit title, not just the pushed HEAD.
2. **CI prettier:** `npm run format:check` step (fail on unformatted files; contributor fix is `npm run format`).
3. **ESLint rule-1 enforcement:** in `eslint.config.mjs`, scope a `no-restricted-syntax` block to the UI globs (`apps/web/app/**`, `apps/web/src/components/**`, `apps/web/src/ui/**`, `apps/web/src/platform/**` — explicitly NOT `src/lib`, `src/server`, `src/hub`):

   ```js
   { files: ['apps/web/app/**', 'apps/web/src/{components,ui,platform}/**'],
     rules: { 'no-restricted-syntax': ['error',
       { selector: "CallExpression[callee.name='fetch']",
         message: 'Raw fetch in UI code breaks native apps — use apiGet/apiSend/apiUpload/apiStream/apiDownload from @/lib/transport (AGENTS.md rule 1).' } ] } }
   ```

   `refetch()` (react-query) is unaffected — it's a method call, not a bare `fetch` identifier.

4. **Rules without mechanical enforcement (5/6/7/8/11/12):** document the review-only status honestly in AGENTS.md (a table of rule → enforcement mechanism: lint rule / test / PR checklist / review), added by this finding. Rule 7 gets a _structural_ guard from F-01 (grep test asserting no mastery/elo writes outside the service — cheap and effective); rule 8 gets the same treatment (grep test for UPDATE/DELETE against append-only tables in non-test code) — both as part of this finding's test additions (see §10.3).

#### Files to touch

- `.github/workflows/ci.yml` (two steps)
- `eslint.config.mjs` (scoped rule)
- `packages/db/tests/rules-guard.test.ts` (new: rule 7 + rule 8 grep guards)
- `AGENTS.md` (rule-enforcement table)

#### Test plan

- eslint: a fixture file with `fetch(` in a UI glob must fail lint locally (temporary fixture, removed after verifying).
- rules-guard test: passes on the current tree (post-F-01/F-03 it must, by construction); commit it and watch CI.

#### Acceptance criteria

- [ ] CI validates commit titles + formatting.
- [ ] Raw fetch in UI is a lint error, with the message pointing at the transport API.
- [ ] Rule-enforcement table exists in AGENTS.md; rules 7/8 have CI guards.

#### Risks & mitigations

- _False-positive fetch selector_ → the selector matches bare identifier calls only; audit hits before landing (expected: zero in UI globs).
- _commitlint on long-lived branches_ → `--from` uses merge-base so only branch commits are judged.

#### Estimate

~0.5 day. Commit: `ci: enforce commitlint, prettier, and the raw-fetch ban`.

---

### F-25 — `build:packages` skips ai-adapters; four orphan utility scripts

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-25 / P4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Area       | root `package.json`, `scripts/`                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Severity   | Low (consistency debt; no current breakage)                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Evidence   | ① Root `build:packages` builds core + db + cli but not `packages/ai-adapters`, which has a `build` script — inconsistent (workspaces TS imports make it harmless today, but the build contract should be complete). ② Four scripts referenced by no npm script and no doc: `scripts/extract-pdfs.mjs`, `scripts/import-math333.mjs`, `scripts/adversarial-challenger1-anki.ts`, `scripts/stress-m2-fsrs-game-analytics.ts`. (`math-333/**` is eslint-ignored — a one-time migration corpus.) |

#### Problem statement

Half-built packaging contract plus dead one-off scripts that look supported but aren't — both are mild traps for contributors.

#### Fix design

1. `build:packages` → `npm run build -w @learning-hub/core -w @learning-hub/db -w @learning-hub/ai-adapters -w @learning-hub/cli` (complete the set).
2. Move the four one-offs to `scripts/archive/` with a two-line README (`scripts/archive/README.md`: "One-off data utilities kept for provenance; not wired to npm scripts; see headers for usage."). `adversarial-challenger1-anki.ts`'s _fixtures_ remain referenced by the import tests — verify the test's import path still resolves after the move (update it if it points into scripts/).

#### Files to touch

- `package.json`, `scripts/archive/*` (moves) + `scripts/archive/README.md`
- Any test importing a moved script path (verify: `git grep adversarial-challenger1-anki`)

#### Test plan

- `npm run build:packages` green; affected tests still resolve their imports.

#### Acceptance criteria

- [ ] Every script in `scripts/` top level is wired or archived; build:packages builds all four packages with build scripts.

#### Risks & mitigations

- _Test import breakage_ → grep before moving; update in the same commit.

#### Estimate

~1 hour. Commit: `chore(scripts): complete build:packages and archive one-off utilities`.

---

### F-26 — TEST_INFRA.md stale; AGENTS.md nav exception undocumented

| Field      | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID / Phase | F-26 / P4                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Area       | `docs/TEST_INFRA.md`, `AGENTS.md`                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Severity   | Low                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Evidence   | ① TEST_INFRA.md directory layout (lines 30-53) omits `tests/e2e/tier1-features/curriculum-agents.test.ts` and `helpers/rows.ts` (both exist), and never mentions the Playwright UI suite (`apps/web/tests/ui/smoke.spec.ts`, `npm run test:ui`). ② AGENTS.md §5 UI: "Navigation comes only from `src/components/nav.ts`" — five `courses/*` sub-pages are linked but not nav-listed (deliberate: they're detail views), which the rule as written forbids. |

#### Problem statement

The test-infra doc misses a whole suite and a shipped test file; the UI rule criminalizes a deliberate pattern without acknowledging it — every future reader flags the course sub-pages as violations (the audit itself did).

#### Fix design

1. TEST_INFRA.md: add `curriculum-agents.test.ts` + `helpers/rows.ts` to the layout; a "UI smoke (Playwright)" section describing `npm run test:ui`, the server-boot helper, and the CI step (F-18); after F-17/F-16 land, the tier file lists get their new entries in the same commit that adds them (keep this doc current going forward).
2. AGENTS.md §5 UI bullet becomes: "Navigation comes only from `src/components/nav.ts` (exception: detail pages reached by in-app links, e.g. `/courses/new`, `/courses/course`, `/courses/exam`, `/courses/lesson`, `/courses/certificate` — they must be link-reachable, never orphaned)."

#### Files to touch

- `docs/TEST_INFRA.md`, `AGENTS.md`

#### Test plan

- None.

#### Acceptance criteria

- [ ] TEST_INFRA lists every existing e2e file and the Playwright suite; AGENTS.md documents the nav exception.

#### Risks & mitigations

- None.

#### Estimate

~1 hour. Commit: `docs: refresh TEST_INFRA and document the course sub-page nav exception`.

## 6. Phased roadmap and commit sequence

### 6.1 Dependency graph

```
F-04, F-05 ──────────────► (independent, land first)
F-02 ─────────────────────► (independent)
F-01 (mastery service) ───► F-24 (rules-guard test asserts the clean state)
F-03 (awardXp) ───────────► F-14 batches C1-C4 (tools reuse awardXp)
F-13 (repos B1-B9) ───────► F-14 (MCP/CLI need shared queries)
F-12 (Deck Doctor) ───────► independent (any time after F-03 — doctor POST writes cards, not XP)
F-06 (haptics migration 027) ► (needs migration slot; must precede any other migration)
F-07 (net bridge) ────────► independent
F-08 (dead endpoints) ────► F-16 (handler suites should cover the kept endpoints)
F-09 (manual modes) ──────► independent
F-10 (extension) ─────────► F-22 (plan doc status)
F-11 (worker docs) ───────► F-22 (plan doc status)
F-15 (core tests) ────────► independent
F-16 (handler tests) ─────► F-17 (e2e builds on stable handler behavior)
F-17 (e2e) ───────────────► F-18 (CI step runs the whole e2e+ui stack)
F-19…F-26 (docs/CI/env) ──► last; F-20/F-26 absorb the counts/lists changed by earlier phases
```

Ordering rule: **migrations first** (F-06 owns migration 027 — if any later finding needs a migration, it takes 028+), then P0 correctness, then features, then tests, then docs.

### 6.2 Commit sequence (atomic, Conventional Commits, commitlint-clean)

| #     | Commit                                                                                                          | Finding    | Gate before commit                              |
| ----- | --------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------- |
| 1     | `docs: add master fix plan from full project audit`                                                             | (this doc) | doc complete, ≥5000 lines                       |
| 2     | `chore(web): replace dead next lint script with eslint`                                                         | F-04       | workspace lint runs                             |
| 3     | `chore(native): remove unwired plugin-updater dependency`                                                       | F-05       | web:tauri builds                                |
| 4     | `fix(root): repair worker:deploy script wiring`                                                                 | F-02       | script-drift check green                        |
| 5     | `fix(db): route exam grading through a shared mastery service`                                                  | F-01       | golden tests + curriculum suites unchanged-pass |
| 6     | `feat(db): centralize XP awarding in awardXp service`                                                           | F-03       | golden values + 12 sites migrated               |
| 7     | `feat(sensory): persist haptics setting and wire exam-sim and voice-tutor`                                      | F-06       | migration 027 + settings round-trip             |
| 8     | `fix(native): bridge handler outbound fetches through the hub net port`                                         | F-07       | web e2e unchanged + port tests                  |
| 9     | `feat(web): surface review stats panel`                                                                         | F-08①      | route-safety + 360px check                      |
| 10    | `feat(web): deck share-string export`                                                                           | F-08②      | ditto                                           |
| 11    | `feat(web): distraction log on focus page`                                                                      | F-08③      | ditto                                           |
| 12    | `fix(reminders): report notification clicks`                                                                    | F-08④      | sw resilient POST                               |
| 13    | `refactor(web): remove unconsumed audio sessions route`                                                         | F-08⑤      | registry tests green                            |
| 14    | `feat(web): remedial path suggestions on graph page`                                                            | F-08⑥      | ditto                                           |
| 15    | `feat(ai): surface manual modes for tutor summary and natural-language search`                                  | F-09       | invariant test passes                           |
| 16    | `feat(extension): friction capture during focus sessions`                                                       | F-10       | extension tests                                 |
| 17    | `docs(worker): self-hosting guide for the rooms/raids worker`                                                   | F-11       | doc follows-on-scratch verified                 |
| 18    | `feat(decks): Deck Doctor — linter-driven deck health with one-click fixes`                                     | F-12       | core+handler+UI tests                           |
| 19–27 | `refactor(db): extract <batch> repos` (B1…B9)                                                                   | F-13       | per-batch repo tests + handler suites unchanged |
| 28–31 | `feat(mcp,cli): <batch> parity` (C1…C4)                                                                         | F-14       | tool e2e + cli e2e                              |
| 32    | `test(core): dedicated suites for habits, media, quotes, reading, bkt, pedagogy`                                | F-15       | core suites green                               |
| 33–34 | `test(web): handler suites for uncovered routes` (split risk-ranked)                                            | F-16       | web tests green                                 |
| 35    | `test(e2e): cover backup roundtrip, sync API, apkg, world, dialectic, workload, palace3d, images, ai-streaming` | F-17       | test:e2e green                                  |
| 36    | `ci: run the Playwright UI smoke suite`                                                                         | F-18       | CI green locally via act-equivalent dry run     |
| 37    | `docs(readme): refresh deferred roadmap to reality`                                                             | F-19       | —                                               |
| 38    | `docs: sync architecture maps and engine counts with the code`                                                  | F-20       | doc-count check green                           |
| 39    | `docs(learning-science): reconcile leaderboard principle and milestone numbering`                               | F-21       | —                                               |
| 40    | `docs(plan): mark shipped M20/M21 items and link the master fix plan`                                           | F-22       | —                                               |
| 41    | `docs(env): document web-push VAPID keys and build-target selectors`                                            | F-23       | —                                               |
| 42    | `ci: enforce commitlint, prettier, and the raw-fetch ban`                                                       | F-24       | lint fixture verified then removed              |
| 43    | `chore(scripts): complete build:packages and archive one-off utilities`                                         | F-25       | build:packages green                            |
| 44    | `docs: refresh TEST_INFRA and document the course sub-page nav exception`                                       | F-26       | —                                               |

Notes:

- Each row's "gate" is the AGENTS.md §6 bar for that change (typecheck + lint + touched-tests; UI changes also get the 360px check).
- Commits 9-14 (F-08) can compress if review prefers fewer commits; the endpoint-per-commit split exists to keep destructive-adjacent changes (route removal, sw.js) isolated.
- The physical two-device sync drill (process item) is **not** a commit — it remains tracked in plan-M19-M21 with the manual checklist from F-11's neighbor docs.

### 6.3 Phase exit criteria

| Phase | Exit when                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| P0    | All 5 commits landed; rules-guard test (F-24's guard, landed early as part of F-01 verification) green; full `check` passes      |
| P1    | All 6 findings landed; every registry key has a UI caller (F-08 sweep green); haptics toggle round-trips on web + native build   |
| P2    | Deck Doctor shipped end-to-end; no zero-repo domain remains except deliberate exceptions; MCP/CLI parity batches landed with e2e |
| P3    | No uncovered handler folder; e2e flow list covered; CI runs Playwright                                                           |
| P4    | All doc commits landed; doc-count drift check in CI; honest final report (what was verified vs not) written                      |

---

## 7. New feature specifications

Detailed product-level specs for the features this plan _adds_ (beyond wiring). §5 already gives the engineering view; this section is the UX/behavior contract.

### 7.1 Deck Doctor (F-12)

**User story.** _As a learner with a bloated deck, I want to see what's wrong with it and fix the mechanical problems in one click, so that my reviews stay worth my time._

**Entry points.** Decks page deck-row "Doctor" action; deck editor "Run Doctor" button.

**Flow.**

1. Panel opens with a running state ("Reading 214 cards…").
2. Results header: health score (0-100, one decimal suppressed — integer), one-sentence verdict ("Mostly healthy — 3 fixable issues"), card count.
3. Findings list grouped by rule id (W1…W19) with: rule name, plain-language why (one line, citing the learning-science principle), affected card count, expandable example cards (max 3 shown, "+N more").
4. Fix affordances per rule group: mechanical rules → "Fix all N" button + per-card checkbox list; manual rules → "How to fix" disclosure with the rule's guidance and a link to the learning-science doc section.
5. Applying fixes: destructive (delete) shows a single confirm with exact count ("Delete 7 cards? This can be undone only via a backup."); suspend is offered as the safer default for leeches with a hint why.
6. After apply: summary toast ("Fixed 3 rules: 7 cards suspended, 1 deck renamed"), score re-computed, findings list refreshes.

**Empty states.** Healthy deck → honest empty state: "Nothing to fix. Run the doctor again after importing." (EmptyState from `@/ui`).

**Out of scope (explicit).** No auto-fix without user action; no scheduled background doctoring; no cross-deck operations (per-deck only, v1).

### 7.2 Friction capture (extension, F-10)

**User story.** _As a learner in a focus session, I want my real-world leaks (browser detours) recorded, so that the friction analytics reflect reality, not just in-app behavior._

**Behavior.** Silent. When paired with the web app AND an active focus-max session exists (via `GET /api/focus/bridge`), navigation to a blocked domain writes one friction event (`trigger: 'extension'`). No UI beyond the existing popup status line ("Friction capture: on"). When not paired or not in session: nothing happens, no storage, no network.

**Edge cases.** MV3 service-worker wake: listeners registered top-level; event POST is fire-and-forget with a single retry on network failure; failure never blocks the navigation.

### 7.3 UI surfaces for dead endpoints (F-08)

| Surface                 | Home                                                  | Behavior summary                                                                   |
| ----------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Review stats panel      | Analytics page, "Per-deck" section                    | per-deck today/7d/30d review counts, lapse rate bars; uses `GET /api/review/stats` |
| Share deck string       | Decks page deck-row menu → "Share…"                   | `POST /api/share/export`, clipboard copy, hint text mirroring the import side      |
| Distraction log         | Focus page, "Distraction apps" section                | list/add/remove entries feeding the friction gate; uses `/api/distractions` CRUD   |
| Reminder click tracking | `public/sw.js` + planner reminders panel engagement % | fire-and-forget `POST /api/reminders/click` on notification open                   |
| Remedial path           | Graph page, weak-skill inspector                      | "Suggest remedial path" → annotated chain from `/api/curriculum/graph/remedial`    |

(⑥ `/api/audio/sessions` is removed rather than surfaced — decision rationale in F-08.)

### 7.4 Manual-mode surfacing (F-09)

**Tutor summary.** On `needsSetup` for `tutor-session-summary`: a "Do it by hand" panel with the manual steps (from the transport envelope), a textarea, and a save action persisting through the existing raw-transcript path.

**NL search.** On `needsSetup` for `nl-search`: results still show (keyword-split fallback), with a "Search tips" strip above listing the manual-mode steps — guidance, never a gate.

### 7.5 MCP/CLI parity (F-14) — agent ergonomics

- Tool descriptions follow house style: one line of _what_, one line of _units/invariants_ (e.g. `habit_checkin`: "Check in a habit for a local date. Idempotent per (habitId, date) — re-checkin updates, never duplicates.")
- CLI output is line-oriented, pipe-friendly (`habits history --days 7 | grep …`), no spinners, no TTY assumptions beyond isatty color.
- Every tool/command returns the domain's real data, not booleans, so agents can chain (list → act → verify).

---

## 8. Database and migration plan

### 8.1 Migration inventory for this plan

| Migration             | Finding | Contents                                                   | Notes                                                                                     |
| --------------------- | ------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `027-haptics-setting` | F-06    | `user_settings.haptics_enabled INTEGER NOT NULL DEFAULT 1` | The only schema change in P0–P1; rule 4 compliant (schema.ts + migration, never renumber) |

If later findings need more migrations during execution, they take 028+ in landing order. Fresh DBs get everything from `schema.ts` via drizzle-kit; existing DBs via the migration runner (`assertMigrationOrder` keeps ids strictly increasing — verified by `packages/db/tests/migrations.test.ts:93`).

### 8.2 Schema hygiene during repo extraction (F-13)

Repo extraction is query-moving only — no schema edits. Two intentional non-changes are documented so nobody "fixes" them later:

- `revlog_undos` stays a repo-free grading internal (F-01 service owns it).
- `schema_migrations` stays runner-owned; never expose CRUD for it.

### 8.3 Append-only discipline (standing rule)

All new code paths in this plan that touch `revlog`, `xp_events`, `friction_events`, `elo_events`, `exposure_events`, `course_exam_attempts`, `reminder_log`, `reminder_clicks`, `card_attempt_images` are **insert-only**. The rules-guard test (F-24) greps production code for UPDATE/DELETE against these tables and fails CI on any hit (test fixtures exempted by path).

### 8.4 Backup/restore interaction

F-13's `sync-meta` repo (`sync_configs`, `sync_devices`, `sync_tombstones`) must preserve the existing invariant that `sync_configs` is never exported by backup (whitelist behavior in the backup path). The round-trip e2e (F-17) asserts this explicitly: restore must not resurrect another device's sync configuration.

---

## 9. Test plan

### 9.1 New suites by layer

| Layer        | Suites                                                                                                                                                   | Pattern source                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| core         | doctor (F-12), habits, media, quotes, reading, bkt, pedagogy, ai-modules (F-15)                                                                          | existing fixture-builder idiom in `packages/core/tests`      |
| db           | mastery-service (F-01), xp-award (F-03), 9 repo batches (F-13), migration 027 (extend migrations.test)                                                   | `packages/db/tests/*-repo.test.ts`                           |
| web handlers | ~10 full suites + smoke extensions for ~30 folders (F-16), decks/doctor (F-12), net-bridge (F-07), manual-mode invariant (F-09), settings haptics (F-06) | `tests/goals-ifthen.test.ts`, `tests/curriculum-api.test.ts` |
| web UI       | Playwright smoke extensions for doctor panel + stats panel (F-12/F-08, opportunistic)                                                                    | `tests/ui/smoke.spec.ts`                                     |
| e2e          | backup roundtrip, sync API, apkg import, world, dialectic, workload, palace3d, images, ai-streaming (F-17) + MCP/CLI tool cases for F-14 batches         | tier structure in `tests/e2e`                                |
| extension    | friction decision table (F-10)                                                                                                                           | existing 3 suites                                            |

### 9.2 Golden-value discipline

For every behavior-preserving refactor (F-01 mastery, F-03 XP, F-13 repos), golden values are captured **before** the change and asserted **after**: current outputs are snapshotted into the new tests as literals. This converts "should be behavior-preserving" into a checked claim.

### 9.3 Determinism rules

- Repos and services take time as a parameter (`atMs`), never call `Date.now()` internally.
- E2E uses the seeded db fixtures; no sleeps; provider-dependent flows use scripted/manual-mode providers.

### 9.4 Verification commands (the §6 gate, per commit)

```bash
npm run typecheck && npm run lint && npm test
npm run test:e2e        # after e2e-affecting commits
npm run web:tauri       # after transport/native-affecting commits
# UI changes additionally: manual 360px check (per AGENTS.md §6)
```

---

## 10. CI and rule-enforcement plan

### 10.1 Current enforcement matrix (after this plan)

| AGENTS.md rule                     | Enforcement after this plan                      | Mechanism                                                                      |
| ---------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1 — no raw fetch in UI             | **new** (F-24)                                   | eslint `no-restricted-syntax` on UI globs                                      |
| 2 — runtime-neutral handlers       | existing                                         | eslint `no-restricted-imports` (handlers/hub/lib)                              |
| 3 — registry completeness          | existing                                         | `tests/hub-registry.test.ts` + `route-safety.test.ts`                          |
| 4 — schema+migration pairing       | review (as before) + migrations.test idempotency | PR checklist                                                                   |
| 5 — zod boundaries                 | review (as before)                               | PR checklist + handler suites assert zod rejections                            |
| 6 — transactional multi-row writes | review (as before)                               | PR checklist                                                                   |
| 7 — one grading path               | **new** (F-01 + F-24)                            | structural: shared service + `rules-guard` grep test                           |
| 8 — append-only                    | **new** (F-24)                                   | `rules-guard` grep test                                                        |
| 9 — AI manual modes                | existing (test) + **strengthened** (F-09)        | `assertEveryFeatureHasManualMode` + UI-surface invariant test                  |
| 10 — native origin unchanged       | review                                           | PR checklist                                                                   |
| 11 — untrusted content not HTML    | review                                           | PR checklist                                                                   |
| 12 — no secrets                    | review                                           | PR checklist                                                                   |
| 13 — don't weaken tests            | **new** (F-24)                                   | commitlint CI (titles) + review; PR template keeps the explanation requirement |

### 10.2 CI pipeline after this plan

```
typecheck → lint (incl. fetch ban) → format:check → commitlint (PR commits)
→ unit tests (workspaces) → db:push + db:seed → e2e → Playwright UI smoke
→ build → web:tauri
```

### 10.3 The rules-guard test (added with F-24, depends on F-01/F-03)

`packages/db/tests/rules-guard.test.ts`:

- Scans production source (glob lists, not `git grep` at runtime — deterministic in CI) for `db.update(mastery)`, `db.insert(eloEvents)` outside `mastery-service.ts` → fail with file list.
- Scans for UPDATE/DELETE against the append-only tables outside test paths → fail with file list.
- This is a _cheap, honest_ guard: it can't prove semantic correctness, but it pins the structural violations this audit actually found.

### 10.4 Script-drift check (added with F-02)

`scripts/check-package-scripts.mjs` (wired as `npm run check:scripts`, included in `check`):

- Every root script of form `npm run X -w Y` must have `X` in `apps/Y/package.json`.
- Every file in `scripts/` top level must be referenced by a package.json script, a doc, or live in `scripts/archive/`.
- Doc-count pins: `= table(` count in schema.ts vs the number ENGINE-REFERENCE claims; MCP tool registration count vs ARCHITECTURE/README claims (F-20).

---

## 11. Risk register

| Risk                                                 | Likelihood | Impact | Mitigation                                                                                    | Trigger to revisit               |
| ---------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------- | -------------------------------- |
| F-01 extraction changes exam grading behavior subtly | Low        | High   | golden-value snapshot before refactor; existing curriculum suites must pass unchanged         | any golden mismatch              |
| F-03 changes XP amounts accidentally                 | Low        | Medium | golden `(source, amount)` pairs; rebalances only as explicit separate commits                 | any golden mismatch              |
| Migration 027 breaks native runtime DDL              | Low        | Medium | native worker's runtime DDL applies the same additive column; `web:tauri` + app:dev smoke     | any push/run failure on device   |
| F-07 net bridge changes web behavior                 | Low        | High   | web target passes through untouched; full e2e before commit                                   | any e2e diff                     |
| Repo extraction (F-13) introduces query drift        | Medium     | Medium | pure-move discipline, one batch per commit, existing suites as the net                        | any handler/e2e failure          |
| MCP/CLI parity (F-14) double-awards XP across hosts  | Low        | Medium | idempotency keys where sources support them (habit/journal date-unique); awardXp single shape | any duplicate xp_events in tests |
| Playwright in CI is flaky on shared runners          | Medium     | Low    | retries, artifact upload, fallback to scheduled runs — never silent                           | 2+ flaky CI runs in a week       |
| Handler-test suite runtime grows CI past budget      | Medium     | Low    | node-side tests are fast; parallelize via vitest config if needed                             | CI duration > 2× baseline        |
| Scope creep inside F-08 UI work                      | Medium     | Low    | each surface is a separate commit with its own gate                                           | any commit mixing two surfaces   |
| Doc-count checks rot if docs restructure             | Low        | Low    | checks pin specific files/lines; failures are loud and self-explanatory                       | any false CI failure             |

---

## 12. Verification checklist

Final gate, per AGENTS.md §6 ("before you say done"):

- [ ] `npm run typecheck` — clean.
- [ ] `npm run lint` — 0 errors (warnings reviewed).
- [ ] `npm test` — all workspaces green, including the ~45 new suites.
- [ ] `npm run test:e2e` — green including the 9 new flow files.
- [ ] `npm run check:scripts` — green (script drift).
- [ ] `npm run web:tauri` — bundle builds; `npm run preview:tauri` smoke on :4173.
- [ ] `npm run app:dev` — Windows app boots (manual spot check of haptics setting + online handlers through the bridge).
- [ ] Every UI change checked at 360px width, no horizontal scroll, ≥44px targets.
- [ ] `apps/web/tests/hub-registry.test.ts` + `route-safety.test.ts` green after every route-touching commit.
- [ ] `git log --oneline origin/main..HEAD` (or `main..HEAD`) reads as the §6.2 sequence; commitlint clean.
- [ ] CHANGELOG updated where user-visible features landed (Deck Doctor, haptics setting, share export, distraction log, remedial path, MCP/CLI tools).
- [ ] Honest final report: what was verified, what was not (e.g., physical device drills, real Cloudflare deploy, real web-push delivery with production VAPID keys).

---

## 13. Implementation runbooks (commit-by-commit)

Each runbook is an executable checklist for the corresponding row of §6.2. Format:
**Pre-flight** (must be true before starting) → **Steps** (in order) → **Post-flight** (verification gate) → **Rollback** (if the gate fails and the cause is not immediately fixable).

Standing rules for every runbook, not repeated per entry:

- Work on `feat/cognitive-expansion`; the tree must be clean before each commit (`git status --porcelain` empty).
- Every commit passes: `npm run typecheck` && `npm run lint` && the tests named in its Post-flight (full `npm test` before each phase boundary).
- Every new export carries JSDoc (what + why + units/invariants) per AGENTS.md §4.4.
- Never `--no-verify` the husky hooks; if commitlint rejects a title, fix the title.
- UI steps include the 360px check; native-adjacent steps include the `npm run web:tauri` build.

---

### Runbook for commit 1 — `docs: add master fix plan from full project audit`

**Pre-flight:** this document exists at `docs/plans/MASTER-FIX-PLAN.md`, ≥5000 lines (`wc -l`), contains all 26 findings with evidence anchors.
**Steps:**

1. Verify line count and that no internal anchor markers (`<!-- SECTION… -->`) remain: `git grep -c "SECTION-" docs/plans/MASTER-FIX-PLAN.md` must be 0.
2. Add the doc to `docs/README.md` index under a "Plans" line, one sentence of description.
3. `git add docs/plans/MASTER-FIX-PLAN.md docs/README.md && git commit`.
   **Post-flight:** commit lands; `git show --stat` lists exactly those two files.
   **Rollback:** revert the commit; the plan lives in the session until re-added.

### Runbook for commit 2 — `chore(web): replace dead next lint script with eslint` (F-04)

**Pre-flight:** `npm run lint -w @learning-hub/web` currently fails (verify once, capture the error for the commit body).
**Steps:**

1. Edit `apps/web/package.json`: `"lint": "next lint"` → `"lint": "eslint ."`.
2. Run `npm run lint -w @learning-hub/web` — must exit 0 with no output beyond ESLint's.
   **Post-flight:** workspace lint green; root `npm run lint` unchanged.
   **Rollback:** trivial revert.

### Runbook for commit 3 — `chore(native): remove unwired plugin-updater dependency` (F-05)

**Pre-flight:** `git grep -rn "plugin-updater" apps/web/src apps/native/src-tauri` returns only `apps/web/package.json`.
**Steps:**

1. Remove `"@tauri-apps/plugin-updater"` from `apps/web/package.json` dependencies.
2. `npm install` to sync the lockfile; confirm no other package depends on it (`grep -n "plugin-updater" package-lock.json` → only removal diff).
3. Add the one-sentence honesty note to `docs/native.md` near the release-signing note.
   **Post-flight:** `npm run web:tauri` completes; `git grep plugin-updater` matches only the native.md note and this plan.
   **Rollback:** revert; dependency was inert either way.

### Runbook for commit 4 — `fix(root): repair worker:deploy script wiring` (F-02)

**Pre-flight:** confirm the no-op: `npm run worker:deploy` exits 0 without invoking wrangler (run once to record; safe because it does nothing).
**Steps:**

1. Root `package.json:15` → `"worker:deploy": "npm run deploy -w @learning-hub/worker"`.
2. Write `scripts/check-package-scripts.mjs` (see §10.4): parses root scripts matching `npm run X -w Y`, asserts `X` exists in that workspace's package.json; also flags unreferenced top-level `scripts/` files; also pins doc counts (§10.4) — **ship the doc-count pins only after F-20 fixes the docs** (have the script read the numbers from the docs and fail with a clear message; if it fails at this commit, pin the counts in commit 38 instead and keep this script limited to script-drift).
3. Root `package.json` scripts: add `"check:scripts": "node scripts/check-package-scripts.mjs"`; append `check:scripts` to the `check` composite.
   **Post-flight:** `npm run check:scripts` green; `npm run worker:deploy -- --dry-run` resolves the worker's deploy script (wrangler dry-run; if wrangler is absent locally, `npm run deploy -w @learning-hub/worker --dry-run` still proves script resolution — record which was run).
   **Rollback:** revert; keep the script-drift checker as its own follow-up commit if entangled.

### Runbook for commit 5 — `fix(db): route exam grading through a shared mastery service` (F-01)

**Pre-flight:** `apps/web/tests/curriculum-api.test.ts` green; `packages/db/tests` green.
**Steps:**

1. **Snapshot first:** write `packages/db/tests/mastery-golden.test.ts` that drives the _current_ exam submit handler against a seeded fixture and records (skillId → pKnown, attempts, correct, elo, elo_events before/after) as literals. Run it, copy the recorded values into the test body as expectations. (If extraction proves behavior-preserving, this test passes before AND after.)
2. Create `packages/db/src/mastery-service.ts` with `applySkillResponse(tx, input)` per the F-01 sketch: loads mastery, applies `applyReviewToMastery` + `eloUpdate` from core, upserts, appends elo_events. Preserve the exam handler's current K-factor constant as the default; practice passes its own if different (inspect both handlers' constants first and record them in JSDoc).
3. Export from `packages/db/src/index.ts`.
4. Rewrite `handlers/curriculum/exam/route.ts` submit to call the service inside its existing transaction; delete the inline mastery/elo writes.
5. Rewrite `handlers/curriculum/practice/route.ts` to call the service; keep its Rule-7 comment, now pointing at the service.
6. Write `packages/db/tests/mastery-service.test.ts` (unit cases from F-01's test plan).
7. Grep gate: `git grep -n "db.update(mastery)\|db.insert(eloEvents)" apps/ packages/db/src` → only `mastery-service.ts` hits.
   **Post-flight:** mastery-golden (unchanged), mastery-service unit, curriculum-api suites all green; typecheck/lint.
   **Rollback:** if golden test mismatches after refactor, diff the service math against both original handler snippets; the mismatch is always a constant (K, BKT params) — fix the service to match the golden values, not the test.

### Runbook for commit 6 — `feat(db): centralize XP awarding in awardXp service` (F-03)

**Pre-flight:** commit 5 landed; `packages/db/tests/elo-xp-journal.test.ts` green.
**Steps:**

1. **Snapshot first:** for each of the 12 sites, record `(file:line, source string, amount, meta shape)` into `packages/db/tests/xp-golden.test.ts` as a table; add assertions after migration that `awardXp` with each site's inputs produces exactly that row.
2. Create `packages/db/src/repos/xp.ts`: `XP_SOURCES` map + `awardXp(tx, input)` (insert-only; JSDoc cites rules 7/8; `amountOverride` requires a call-site comment).
3. Export via `repos/index.ts`.
4. Migrate the 12 sites (one sub-step each, run the site's test after each): cli/index.ts:305 · achievements:140 · ai/feynman/grade:94 · curriculum/lessons/[id]:57 · curriculum:121 · focus/[id]:61 · habits/checkin:40 · ideas/evolve:60 · journal:78 · quests:158 · repos/dialectic.ts:92 · repos/social.ts:127. Each site's source key must match its semantics (e.g. feynman grade → `feynman`); where the site used a custom amount, pass `amountOverride` **with the justification comment**.
5. Grep gate: `git grep -n "db.insert(xpEvents)" apps/` → 0 hits; `git grep -n "insert(xpEvents)" packages/db/src` → review-service + repos/xp.ts only.
   **Post-flight:** xp-golden + elo-xp-journal + affected feature suites green.
   **Rollback:** per-site revert is safe (the repo function is additive).

### Runbook for commit 7 — `feat(sensory): persist haptics setting and wire exam-sim and voice-tutor` (F-06)

**Pre-flight:** migrations at 026; `npm run db:push` clean on a scratch DB.
**Steps:**

1. `packages/db/src/schema.ts`: add `hapticsEnabled` to `userSettings` (boolean, default true).
2. `packages/db/src/migrations/027-haptics-setting.ts` with `ctx.addColumn('user_settings', 'haptics_enabled', 'INTEGER NOT NULL DEFAULT 1')`; append to `MIGRATIONS`.
3. Extend `packages/db/tests/migrations.test.ts`: fresh-DB column present; an 026-era DB upgraded by 027 keeps rows (the idempotent-helper pattern from existing tests).
4. Settings handler: add the key to the settings zod schema + persistence (follow how `theme` is handled end-to-end).
5. Settings page: add the toggle in the sensory section (plain `Toggle` from `@/ui`, label "Haptics", one-line description).
6. `src/platform/haptics.ts`: module-level `enabled` flag + `setHapticsEnabled()`; disabled → all helpers no-op; JSDoc the invariant ("sensory features must be opt-out — calm by default").
7. Boot-time application: wherever settings load for ThemeSync (AppShell/ThemeSync path), also apply the haptics flag.
8. Wire `app/exam-sim/page.tsx` grade submission and `app/voice-tutor/page.tsx` turn boundaries with the same helpers review/page.tsx:352-404 uses.
9. Extend `apps/web/tests/calm-sensory.test.ts`: disabled flag → zero vibrate calls; enabled → calls flow through.
   **Post-flight:** db push clean on scratch; settings PUT/GET round-trip test; 360px check of settings section; `npm run web:tauri` builds.
   **Rollback:** revert; migration 027 is additive — but once _shipped_ to any real DB it must never be edited (rule 4); during this branch's lifetime a revert before any external DB saw 027 is acceptable.

### Runbook for commit 8 — `fix(native): bridge handler outbound fetches through the hub net port` (F-07)

**Pre-flight:** full web e2e green (baseline for behavior preservation).
**Steps:**

1. Create `apps/web/src/server/net.ts`: `remoteFetch(url, init)` port + `setRemoteFetch()` injector (mirror `storage.ts`'s port pattern; JSDoc the CORS rationale and the native asymmetry it fixes).
2. Hub worker: register a `net/fetch` protocol handler that forwards to the bridged fetch (`createBridgedFetch` path); extend `protocol.ts` types; keep AI bridging untouched.
3. Inject the implementation at boot: web target → global fetch; hub target → the bridged route (wire where the worker sets `setNetworkFetch` today, worker.ts:75-78 neighborhood).
4. Migrate the five handlers to `remoteFetch` (identity, raids, rooms ×2, library ×2, leaderboard/sync ×2) — no shape changes; assert request/response parity in the handler tests.
5. `apps/web/tests/net-bridge.test.ts`: pass-through on web; protocol routing on hub; per-handler port-injection tests.
   **Post-flight:** full e2e green (unchanged behavior on web); hub-registry + route-safety green; manual native smoke note recorded (register a server from `npm run app:dev` against a local echo server — if not possible in-session, state so in the final report).
   **Rollback:** revert; web behavior was never altered.

### Runbook for commit 9 — `feat(web): surface review stats panel` (F-08①)

**Pre-flight:** `/api/review/stats` handler exists; its response shape extracted by reading the handler (record the fields).
**Steps:**

1. Analytics page: add a "Per-deck activity" `Panel` in the existing layout flow; render today/7d/30d counts + lapse rate via `ProgressBar` from `@/ui`; one `apiGet('/api/review/stats')` call with the page's existing data-fetch pattern.
2. Empty state: honest `EmptyState` ("No reviews yet — stats appear after your first session").
3. Mobile check at 360px: panel stacks, no horizontal scroll.
   **Post-flight:** route-safety test (if extended to assert non-test callers per F-08's plan) green for this endpoint; manual 360px check noted.
   **Rollback:** revert (page-only).

### Runbook for commit 10 — `feat(web): deck share-string export` (F-08②)

**Pre-flight:** `/api/share/export` handler shape known (POST → share string).
**Steps:**

1. Decks page deck-row action menu: add "Share…" item.
2. Handler call: `apiSend('/api/share/export', { deckId })`; copy the returned string via the existing clipboard helper pattern used by TransportPanel.
3. Show the peer-hint copy the import side uses (`online/page.tsx` near :694) so both ends of the flow tell the same story.
   **Post-flight:** manual round-trip: export on deck A → import via Online page → deck appears; 360px check.
   **Rollback:** revert (page-only).

### Runbook for commit 11 — `feat(web): distraction log on focus page` (F-08③)

**Pre-flight:** `/api/distractions` GET/POST/DELETE shape known; focus page section layout understood.
**Steps:**

1. Focus page: "Distraction apps" section under the existing friction panel — list current entries, add input, remove buttons (≥44px targets).
2. Wire the three calls with the page's existing fetch pattern; keep one primary action per screen rule (add is the primary; remove is quiet).
   **Post-flight:** add/remove round-trip manually; 360px check.
   **Rollback:** revert (page-only).

### Runbook for commit 12 — `fix(reminders): report notification clicks` (F-08④)

**Pre-flight:** `public/sw.js` notification click handler located; `/api/reminders/click` payload schema read from the handler.
**Steps:**

1. In sw.js click handler: `try { fetch('/api/reminders/click', {…}) } catch {}` — fire-and-forget, never awaited in the click path; include the reminder id from the notification data payload.
2. Planner page reminders panel: small "engagement" stat consuming the click rate via the existing plan/log data (no new endpoint).
   **Post-flight:** manual notification click records a `reminder_clicks` row; navigation still instant.
   **Rollback:** revert (sw.js + page).

### Runbook for commit 13 — `refactor(web): remove unconsumed audio sessions route` (F-08⑤)

**Pre-flight:** final grep confirms zero non-test callers: `git grep -n "api/audio/sessions" apps/web/app apps/web/src/components apps/web/src/platform apps/web/src/lib`.
**Steps:**

1. Delete `src/server/handlers/audio/sessions/route.ts`, `app/api/audio/sessions/route.ts`, its registry import + `add()` line, and any smoke-test import of the shim.
2. CHANGELOG line noting the removal (the schema table `audio_sessions` stays — repos reference it).
   **Post-flight:** `tests/hub-registry.test.ts` + `route-safety.test.ts` green (they enumerate from the filesystem — the removal must make both _smaller_, not broken); full web unit run.
   **Rollback:** revert (pure deletion).

### Runbook for commit 14 — `feat(web): remedial path suggestions on graph page` (F-08⑥)

**Pre-flight:** `/api/curriculum/graph/remedial` response shape known (skill chain).
**Steps:**

1. Graph page: in the weak-skill inspector, "Suggest remedial path" button → renders the returned chain as an ordered list linking to lessons (link pattern reused from courses pages).
2. Empty/healthy state: "No remedial work needed for this skill."
   **Post-flight:** manual check on a course with weak ancestors; 360px check.
   **Rollback:** revert (page-only).

### Runbook for commit 15 — `feat(ai): surface manual modes for tutor summary and natural-language search` (F-09)

**Pre-flight:** `GET /api/ai/transport?feature=tutor-session-summary` returns the manual envelope (verify by reading transport handler); search page's needsSetup branch located.
**Steps:**

1. Tutor page: in the summary action's error path (and when provider is none), render "Do it by hand" panel with steps + textarea + save through the existing summary POST raw path.
2. Search page: on `needsSetup` from nl-search, render the "Search tips" strip above results from the nl-search manual steps.
3. New `apps/web/tests/manual-mode-surface.test.ts`: scan `app/**/*.tsx` for `useManualMode('…')` and the needsSetup render markers; diff against `MANUAL_MODES` keys minus the documented allowlist (text-only features); must pass — write it first, confirm it fails, then land the UI fixes in the same commit.
   **Post-flight:** provider `none` manual check of both surfaces; new test green.
   **Rollback:** revert (page + test).

### Runbook for commit 16 — `feat(extension): friction capture during focus sessions` (F-10)

**Pre-flight:** extension build + tests green; `handlers/focus/bridge` response shape known (in-session flag + allowlist).
**Steps:**

1. `apps/extension/src/friction.ts`: decision function (pure) — inputs `(sessionState, domain)` → event | null; decision table per F-10.
2. `service-worker.ts`: top-level webNavigation/webRequest listener (MV3-safe, mirroring capture.ts's registration pattern); on decision → measure `delaySec` from session start, POST `/api/friction` fire-and-forget with one retry.
3. `state.ts`: extend the pairing sync to pull focus-bridge state (in-session, blocked domains) on the existing cadence.
4. Popup status line: "Friction capture: on/off" (passive, no new controls).
5. `tests/friction.test.ts`: the ≥6 decision-table cases.
   **Post-flight:** extension tests green; manual integration noted (pair with dev app → navigate to blocked domain → row lands).
   **Rollback:** revert (extension-only).

### Runbook for commit 17 — `docs(worker): self-hosting guide for the rooms/raids worker` (F-11)

**Pre-flight:** `apps/worker/wrangler.toml` bindings enumerated; worker routes list read from `apps/worker/src/index.ts`.
**Steps:**

1. Write `docs/worker-self-hosting.md` per the F-11 outline — every binding traced to its consuming source file; deploy section uses the post-F-02 wiring; explicit "what the worker does NOT do" (no auth beyond pairing, data on devices).
2. `docs/README.md` index line; `docs/plan-M19-M21.md:56` → ✅ with the doc path as evidence.
   **Post-flight:** follow-the-doc pass against `wrangler dev` locally (or a scratch account if available); divergences fixed in the same commit.
   **Rollback:** revert (docs-only).

### Runbook for commit 18 — `feat(decks): Deck Doctor — linter-driven deck health with one-click fixes` (F-12)

**Pre-flight:** linter rule list extracted (`packages/core/src/linter.ts` W1–W19 with severities); card-delete repo path identified (tombstone-safe); decks page action-menu structure read.
**Steps:**

1. `packages/core/src/doctor.ts`: `diagnoseDeck` (group linter findings → `DoctorAction[]` + healthScore with documented formula) + `applyDoctorAction` returning DB-neutral ops; full JSDoc; deterministic (no Date.now).
2. `packages/core/tests/doctor.test.ts`: fixture decks — leech deck → suspend default; duplicate pair flagged once; healthy deck → 100/no actions; manual rules → hints; score determinism.
3. `apps/web/src/server/handlers/decks/doctor/route.ts`: GET (diagnose via repos/learning readers) + POST (apply mechanical actions in one `withTransaction`; zod-validated action list; per-action result summary; NO grading/XP writes).
4. Shim `app/api/decks/doctor/route.ts` + registry `add('decks/doctor', decksDoctor)` (rule 3).
5. `apps/web/tests/decks-doctor.test.ts`: GET diagnosis on seed; POST applies atomically (inject a mid-list failure → rollback proven); zod rejections.
6. Decks page: Doctor button (row menu + editor) → Sheet with score header, grouped findings, fix buttons (delete confirm; suspend default for leeches), manual-rule hints linking to learning-science; honest empty state.
7. README:42 and CHANGELOG: the promised feature now exists — CHANGELOG entry under the next unreleased heading.
   **Post-flight:** core+web tests; registry tests; 360px check of the sheet; `hub-registry` green.
   **Rollback:** revert; no schema change involved.

### Runbook for commits 19–27 — `refactor(db): extract <batch> repos` (F-13, one per batch)

Per batch (B1…B9 from the F-13 table):
**Pre-flight:** the batch's handler files read; current query semantics recorded (filters, ordering, column projection, date math — especially any hidden `Date.now()` → becomes `atMs` parameter).
**Steps:**

1. Create `packages/db/src/repos/<domain>.ts` with the moved queries as typed functions; JSDoc per export; re-export from `repos/index.ts`.
2. Switch the handler(s) to the repo calls; delete the inline drizzle code.
3. Write `packages/db/tests/<batch>-repo.test.ts` covering happy path + the filters/edges the handlers exercised.
4. Run the affected handler/e2e suites (must pass unchanged).
   **Post-flight (per batch):** typecheck/lint/batch tests + touched suites; grep confirms no other file still queries those tables inline.
   **Rollback:** per-batch revert (no cross-batch coupling).

Batch → primary handler files:

- B1 notes/journal → `handlers/notes/*`, `handlers/notes/[id]`, `handlers/cards/bullet` (note_bullets), `handlers/journal/*`
- B2 habits/commitments → `handlers/habits/*`, `handlers/commitments/*`
- B3 reading → `handlers/reading/*` (5 files)
- B4 goals/quests → `handlers/goals/*`, `handlers/quests/route.ts`, `handlers/achievements/route.ts`, `handlers/motivation`-adjacent callers
- B5 quotes/ideas-links → `handlers/quotes/route.ts`, `handlers/ideas/*` (idea_links only)
- B6 physio/canvas/chat → `handlers/physio/route.ts`, `handlers/canvas/*`, `handlers/tutor` chat-session persistence site
- B7 images/sync-meta → `handlers/images/*`, `handlers/sync/route.ts`, `handlers/backup` (sync whitelist assertion stays)
- B8 focus extras → `handlers/distractions/*` (post-F-08 the UI caller exists), `handlers/focus` routines sites
- B9 mnemonic → memory/palace handler sites

### Runbook for commits 28–31 — `feat(mcp,cli): <batch> parity` (F-14, C1…C4)

Per batch:
**Pre-flight:** the batch's repos exist (F-13 landed); MCP tool registration pattern read (`apps/mcp/src/index.ts`, `tools/curriculum.ts` as the reference style); CLI dispatch pattern read (`apps/cli/src/index.ts:557-623`).
**Steps:**

1. Core: extend domain schemas in `packages/core/src/<domain>` where tool args need validation types (zod).
2. MCP: `apps/mcp/src/tools/<domain>.ts` per the F-14 table (names, verbs); register in `index.ts`; descriptions in house style (what + units/invariants).
3. CLI: subcommands under the listed command names; line-oriented output; `--json` where it helps agents.
4. Rule-7 guard: no new file imports FSRS/mastery write paths (grep in the commit).
5. E2E: extend `tests/e2e/tier1-features/api-mcp-tools.test.ts` + `cli-commands.test.ts` — happy path + zod rejection per tool/command.
6. ENGINE-REFERENCE tool table + README counts updated in the final batch (31), so counts change once, at the end.
   **Post-flight (per batch):** mcp/cli e2e green; `npm run mcp` + `npm run cli` manual smoke of one tool/command per batch.
   **Rollback:** per-batch revert.

### Runbook for commit 32 — `test(core): dedicated suites for habits, media, quotes, reading, bkt, pedagogy` (F-15)

**Pre-flight:** module APIs read (function lists from source, not memory).
**Steps:**

1. Write the 7 suites per F-15's coverage table (table-driven cases; fixtures follow the existing core-test idiom).
2. Run each suite; any failure = real bug → fix in a separate commit referencing the test (`fix(core): <what the test caught>`) before this commit lands.
   **Post-flight:** `npm test -w @learning-hub/core` green; coverage spot-check shows no zero-hit module from the F-15 list.
   **Rollback:** revert (tests-only).

### Runbook for commits 33–34 — `test(web): handler suites for uncovered routes` (F-16, split by risk rank)

**Pre-flight:** handler signatures read per suite; fixture pattern from `tests/goals-ifthen.test.ts` understood.
**Steps (commit 33 = risk-ranked six):**

1. `backup.test.ts` — merge + full modes; **round-trip property** (export → wipe → restore → row-set equality incl. images; sync_configs NOT resurrected).
2. `sync.test.ts` — roster, push/pull, tombstones through the API surface.
3. `fsrs-optimize.test.ts` — weights land on deck cards; GET reports; undo path.
4. `import-export.test.ts` — format parsing (JSON + adversarial fixtures), export shapes.
5. `push.test.ts` — subscription lifecycle CRUD; VAPID-missing degradation.
6. `workload.test.ts` — balance/catch_up due-shifts in transaction; revlog untouched.
   **Steps (commit 34 = remaining folders):** smoke+contract suites for the rest per the F-16 list, grouped into a few files (`crud-smoke-1.test.ts`, `crud-smoke-2.test.ts`…) by fixture needs.
   **Post-flight:** `npm test -w @learning-hub/web` green; CI duration noted.
   **Rollback:** revert (tests-only).

### Runbook for commit 35 — `test(e2e): cover backup roundtrip, sync API, apkg, world, dialectic, workload, palace3d, images, ai-streaming` (F-17)

**Pre-flight:** commit 33's suites green (they share fixtures); e2e harness understood (`vitest.e2e.config.mjs`).
**Steps:**

1. Add the nine files from F-17's table; the ai-streaming one uses a scripted provider (no network).
2. `npm run test:e2e` — all green.
   **Post-flight:** full e2e run green; new files listed in TEST_INFRA (landed again in commit 44's doc refresh — keep the doc edit in THIS commit to avoid drift).
   **Rollback:** revert (tests-only).

### Runbook for commit 36 — `ci: run the Playwright UI smoke suite` (F-18)

**Pre-flight:** `npm run test:ui` passes locally.
**Steps:**

1. `ci.yml`: after the e2e step — `npx playwright install --with-deps chromium` (in the web workspace) → `npm run test:ui` → upload `test-results/` + `playwright-report/` artifacts `on: failure`.
2. TEST_INFRA.md mentions the CI step (one line; the full doc refresh is commit 44).
   **Post-flight:** first CI run on the branch green (or flake-diagnosed within the runbook — retries already configured).
   **Rollback:** revert (CI-only).

### Runbook for commits 37–44 — docs/CI/env hygiene (F-19…F-26)

These are doc/config commits; each is small and self-contained. Shared post-flight: `npm run check:scripts` (doc-count pins from commit 4's script must be green — if a pin was deferred to commit 38, it activates here).

- **37 (F-19):** README §Roadmap rewrite per F-19's block. Post: manual read-through.
- **38 (F-20):** AGENTS.md §2 + ARCHITECTURE.md maps gain worker+extension rows; "14 tools" → final count (after F-14: actual number at execution time); ENGINE-REFERENCE 92 tables + optimizer note; README provider table gains `google`. Post: `npm run check:scripts` doc pins green.
- **39 (F-21):** learning-science SDT bullet + legend numbering per F-21.
- **40 (F-22):** plan-M19-M21 checkboxes reconciled; pointer to this master plan.
- **41 (F-23):** `.env.example` + `docs/api-server.md` + `docs/plugins.md` per F-23.
- **42 (F-24):** ci.yml commitlint + format:check steps; `eslint.config.mjs` scoped fetch ban (verify with a temporary fixture, remove it); `packages/db/tests/rules-guard.test.ts` (mastery/elo + append-only grep guards — now passes by construction post-F-01/F-03); AGENTS.md rule-enforcement table. Post: lint fixture cycle completed and fixture deleted.
- **43 (F-25):** `build:packages` complete set; 4 scripts → `scripts/archive/` + README; verify `git grep adversarial-challenger1-anki` test imports and fix paths in-commit.
- **44 (F-26):** TEST_INFRA full refresh (layout incl. curriculum-agents + helpers/rows + Playwright section + the new e2e files from commit 35); AGENTS.md §5 nav exception sentence.

---

## 14. Test-case specifications

Enumerated cases for the highest-value new suites (the risk-ranked ones). Every case: **name → arrange/act/assert in one line**. Suites not enumerated here follow their finding's test plan (§5).

### 14.1 `packages/db/tests/mastery-golden.test.ts` + `mastery-service.test.ts` (F-01)

| Case                               | Assertion                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| golden: exam submit on seed course | recorded pKnown/attempts/correct/elo per skill match literals exactly                |
| golden: elo_events rows            | before/after values + outcome flags match; append-only (row count only grows)        |
| unit: correct answer raises pKnown | `applySkillResponse` returns pKnown' > pKnown for pKnown<1                           |
| unit: wrong answer lowers pKnown   | returns pKnown' < pKnown                                                             |
| unit: elo monotonicity             | correct → after ≥ before; wrong → after ≤ before (K>0)                               |
| unit: elo_events row shape         | (cardId-equivalent skill key, ratingBefore, ratingAfter, outcome) persisted          |
| unit: exam K preserved             | exam-path constant produces golden elo delta; practice-path constant likewise        |
| unit: no FSRS side effects         | cards row for the skill's deck unchanged (due/stability/difficulty) after exam apply |

### 14.2 `packages/db/tests/xp-golden.test.ts` + `repos xp` cases (F-03)

| Case                    | Assertion                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| golden table: 12 sites  | each site's (source, amount, meta shape) matches recorded literals via awardXp                               |
| unit: canonical amounts | awardXp(source) inserts exactly XP_SOURCES[source]                                                           |
| unit: override          | amountOverride honored; call sites that use it carry justification comments (asserted by grep in test setup) |
| unit: insert-only       | repo exports no update/delete functions (type-level + runtime check of module keys)                          |
| unit: transaction scope | calling outside a transaction throws (guards rule 6)                                                         |

### 14.3 `apps/web/tests/backup.test.ts` (F-16, risk #1)

| Case                             | Assertion                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| full export shape                | JSON contains decks/cards/settings/images; sync_configs absent                                   |
| merge import: new deck           | imported deck + cards appear; existing deck untouched                                            |
| merge import: conflict           | per the merge policy in source (assert documented behavior, not intuition)                       |
| round-trip                       | seed → export → wipe → restore → row-set equality across drizzle tables (whitelist) incl. images |
| round-trip: no sync resurrection | restore does not create sync_configs rows                                                        |
| encrypted payload                | passphrase flow round-trips (the page's encryption path exercised via handler)                   |
| zod rejections                   | malformed payloads rejected with envelope errors                                                 |

### 14.4 `apps/web/tests/sync.test.ts` (F-16, risk #2)

| Case                  | Assertion                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| device roster         | PUT registers device; GET lists it with lastSeen                                                      |
| push/pull convergence | two device contexts converge to identical row sets (mirrors db-level sync-devices test, through HTTP) |
| tombstones            | delete on A → absent after B pull; tombstone row exists                                               |
| E2EE round-trip       | crypto envelope encrypt/decrypt through the handler path                                              |
| rejection             | foreign-device push without registration rejected                                                     |

### 14.5 `apps/web/tests/fsrs-optimize.test.ts` (F-16, risk #3)

| Case                     | Assertion                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| optimize applies weights | seeded deck cards receive optimizer-derived fsrsWeights patch                                               |
| state rewrite scope      | only the target deck's cards change                                                                         |
| GET report               | returns current weights + deck stats (shape per handler)                                                    |
| golden                   | record pre/post (stability, difficulty) for 3 fixture cards — behavior-preservation guard for the repo path |

### 14.6 `apps/web/tests/workload.test.ts` (F-16, risk #6)

| Case                | Assertion                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| balance shifts due  | overloaded deck's cards' due dates spread into the target window; FSRS memory columns untouched |
| catch_up shifts due | overdue cards pulled inside horizon; revlog untouched                                           |
| transactional       | injected failure mid-shift → zero due dates changed                                             |
| report              | GET returns per-deck load numbers (shape per handler)                                           |

### 14.7 `apps/web/tests/decks-doctor.test.ts` (F-12)

| Case          | Assertion                                                     |
| ------------- | ------------------------------------------------------------- |
| GET diagnosis | seeded leech deck → suspend/delete actions; healthScore < 100 |
| GET healthy   | healthy deck → score 100, no actions                          |
| POST applies  | suspend/delete/rename applied; response summary lists each    |
| POST atomic   | injected failure → no partial application                     |
| zod           | unknown action kind rejected                                  |

### 14.8 `apps/web/tests/net-bridge.test.ts` (F-07)

| Case             | Assertion                                                                    |
| ---------------- | ---------------------------------------------------------------------------- |
| web pass-through | remoteFetch on web target calls global fetch with same args                  |
| hub routing      | hub target routes via net/fetch protocol → bridged fetch → response replayed |
| handler ports    | each of the 5 handlers honors an injected stub (request shape asserted)      |

### 14.9 Core suites (F-15) — case counts and focus

| Suite      | Min cases | Focus                                                                                |
| ---------- | --------- | ------------------------------------------------------------------------------------ |
| habits     | 10        | loop model, dopamine menu validation, streak freezes + weekend amulet, tz boundaries |
| media      | 8         | podcast segment structure, study-guide shape, determinism                            |
| quotes     | 8         | rotation no-repeat window, day determinism, tag filters                              |
| reading    | 10        | scheduling, highlight decay, triage transitions, SQ3R step model                     |
| bkt        | 12        | update direction/magnitude, thresholds, convergence, parameter sanity                |
| pedagogy   | 12        | each exported planner/design function happy + edge                                   |
| ai-modules | 8         | extractJson edge cases (nested, fenced, trailing prose), settings parse              |

### 14.10 E2E new files (F-17) — the one-assertion-each summary

| File                     | Core assertion                                                                |
| ------------------------ | ----------------------------------------------------------------------------- |
| tier2/backup-roundtrip   | row-set equality after export→wipe→restore                                    |
| tier2/sync-api           | two-device convergence through HTTP                                           |
| tier2/import-apkg        | apkg fixture → decks/cards shaped → first review OK                           |
| tier3/world-economy      | coins→market→state transitions; ledger append-only                            |
| tier3/dialectic-flow     | arena open→turn→verdict→xp via awardXp                                        |
| tier3/workload-rebalance | due windows shifted; revlog untouched                                         |
| tier3/palace3d-crud      | scene CRUD + locus assignment                                                 |
| tier3/images-flow        | upload→serve→attempt-image→review-with-image                                  |
| tier4/ai-streaming       | stream surface with scripted provider; needsSetup envelope with provider none |

## 15. Per-domain implementation reference (F-14 batches, C1–C4)

This section is the working reference for the MCP/CLI parity batches: verified schema columns (from `packages/db/src/schema.ts` at audit time), the repo functions to extract (F-13), and the tool/command contracts. **Everything here was read from source; where a detail must be re-verified at implementation time, it is marked ⚠︎verify.**

### 15.1 Batch C1 — habits, journal, physio

#### Domain: habits

**Tables (verified):**

```ts
habits:      id PK, name NOT NULL, cue, cueType ('time'|'location'|'preceding'|'emotional'|'people'),
             craving, response (two-minute-rule tiny version), reward, anchor (habit stacking),
             order INT default 0, archived BOOL default false, createdAt ISO
habit_logs:  id PK, habitId FK→habits, date 'YYYY-MM-DD', note, createdAt
             UNIQUE (habitId, date)  — habit_logs_day_idx
```

**Core module:** `packages/core/src/habits.ts` — habit-loop model (cue→craving→response→reward), dopamine menu. ⚠︎verify exported function names at implementation.

**Repo to create (`repos/habits.ts`, B2):**

```ts
listHabits(tx, { includeArchived?: boolean }): HabitRow[]            // ORDER BY habit_order
createHabit(tx, input: HabitInput): HabitRow                         // zod-validated via core schema
updateHabit(tx, id, patch): HabitRow                                  // name/cue/response/… /archived
deleteHabit(tx, id): void                                             // cascade: rows too (handler already decides policy ⚠︎verify)
checkInHabit(tx, { habitId, date, note? }): { created: boolean }      // upsert on (habitId,date) — idempotent
habitHistory(tx, { habitId?, from?, to?, tzOffset? }): HabitLogRow[]
```

**MCP tools:**

- `habit_list` — args: `{ includeArchived?: boolean }` → array of habits with current streak (streak math from core, not SQL).
- `habit_checkin` — args: `{ habitId: number, date?: 'YYYY-MM-DD' (default today via tzOffset), note?: string }` → `{ created, date }`. Description states the idempotency invariant: _unique per (habitId, date); re-check-in updates note, never duplicates_.

**CLI:**

```
hub habits list [--archived]            # table: id, name, streak, last 7 days as ✓/·
hub habits checkin <id> [--date YYYY-MM-DD] [--note …]
hub habits history <id> [--days N]
```

**Tests:** checkin idempotency (same date twice → 1 row, note updated); streak boundary at tzOffset; archived excluded from list default; MCP zod rejection for unknown habitId.

#### Domain: journal

**Tables (verified):**

```ts
journal_entries: id PK, date 'YYYY-MM-DD' UNIQUE, mood INT 1-5 (Daylio pattern),
                 smallWins, gratitude, worryDump (exam-expressive-writing outlet),
                 aiInsight, createdAt
```

**Core module:** `packages/core/src/journal.ts` (rule-based weekly rollup — the coach manual fallback). ⚠︎verify exports.

**Repo (`repos/journal.ts`, B1):** `getEntry(tx, date)`, `upsertEntry(tx, {date, …fields})` (date-unique upsert), `listEntries(tx, {from, to})`, `weeklyRollup(tx, {weekStart})` delegating to core.

**MCP tools:**

- `journal_write` — args `{ date?, mood? (1-5), smallWins?, gratitude?, worryDump? }` → saved entry. Idempotent per date (upsert).
- `journal_search` — args `{ q, from?, to? }` → matching entries (LIKE over text fields; FTS optional ⚠︎verify whether journal is in the FTS index).

**CLI:** `hub journal write [--date] [--mood 1-5] [--wins …] [--gratitude …] [--worry …]` · `hub journal show [date|week]`. Interactive prompt fallback when flags absent (only if isatty).

**Tests:** upsert same-date; mood range rejection; weekly rollup golden vs core function.

#### Domain: physio

**Tables (verified):**

```ts
physio_log: id PK, date UNIQUE, sleepHours REAL, sleepQuality INT 1-5,
            exerciseMinutes INT, exerciseHoursAfterLearning REAL,
            caffeineCutoffHour INT 0-23, arousal INT 1-10 (Yerkes-Dodson context), notes
```

**Core module:** `packages/core/src/physio.ts` — `yerkesDodsonZone`, `sleepVsRetention`, `exerciseNudge`, `caffeineCutoffAdvice` (verified cited in learning-science.md).

**Repo (`repos/physio.ts`, B6):** `getLog(tx, date)`, `upsertLog(tx, input)` (date-unique), `recentLogs(tx, {days})`.

**MCP tool:** `physio_log` — dual-purpose (get + put): args `{ date?, sleepHours?, sleepQuality?, exerciseMinutes?, … , notes? }`; omitting all measurement fields = read. Returns the stored row **plus** the core advice trio (zone/sleep/caffeine) so an agent gets actionable output in one call.

**CLI:** `hub physio [--date YYYY-MM-DD --sleep 7.5 --quality 4 --exercise 30 --cutoff 14 --arousal 5]` — read-only without flags, write with any flag.

**Tests:** upsert same-date; advice fields derived (golden vs core); arousal/quality range rejections.

### 15.2 Batch C2 — reading, study-plan, gkt

#### Domain: reading

**Tables (verified):**

```ts
sources:   id PK, kind (SourceKind), title NOT NULL, url, content NOT NULL (extracted full text),
           priority REAL default 50 (SuperMemo-style 0-100), position INT default 0 (%),
           status default 'queued' ('queued'|'reading'|'done'), addedAt, lastReadAt
           INDEX sources_priority_idx (priority)
highlights / sq3r_sessions: web-UI-heavy; excluded from host parity by design (F-14 exclusion list)
```

**Core module:** `packages/core/src/reading.ts` (incremental reading, highlight strength) + `packages/core/src/ingest.ts` (`extractSurveyHeadings`).

**Repo (`repos/reading.ts`, B3):** `addSource(tx, input)`, `listSources(tx, {status?})` (priority-ordered), `updateProgress(tx, {id, position?, status?})`, `getSource(tx, id)`. Highlights/sq3r stay in the web handlers even after B3 (only source CRUD moves).

**MCP tools:**

- `reading_list` — args `{ status?: 'queued'|'reading'|'done' }` → sources with priority + position.
- `reading_add` — args `{ title, content, url?, kind, priority? }` → source. Note: content is full extracted text — for URL sources an agent fetches first (hosts don't fetch; extraction is web-side ⚠︎verify).

**CLI:** `hub reading list [--status]` · `hub reading add --title … [--file <path>]` (file → read text locally) · `hub reading finish <id>`.

**Tests:** priority ordering; status filter; position update; CLI `--file` reading (temp file fixture).

#### Domain: study-plan / agenda

**Tables (verified):**

```ts
study_plans: id PK, weeklyMinutes INT NOT NULL, restDay INT nullable (0=Sun…6=Sat),
             plan JSON NOT NULL ({ weeks, blocks: [{day, minutes, courseId, label}] }),
             createdAt, updatedAt
```

**Core module:** `packages/core/src/study-plan.ts` + `packages/core/src/ics.ts` (verified: `ics` covered via `tests/study-plan.test.ts:3`).

**Repo (`repos/study-plan.ts`, B6):** `getPlan(tx)`, `setPlan(tx, input)` (single-plan table semantics ⚠︎verify), `deletePlan(tx)`.

**MCP tools:**

- `study_plan_get` — args `{ format?: 'json'|'summary' }` → plan or a human summary (this week's blocks).
- `study_plan_set` — args `{ weeklyMinutes, restDay? }` → regenerates the weekly template via core; returns the plan.

**CLI:** `hub plan today` (today's blocks + ICS export path `--ics out.ics`) · `hub plan week` · `hub plan set --minutes N [--rest-day N]`.

**Tests:** regeneration determinism; ICS output golden (existing core test pattern); rest-day exclusion.

#### Domain: gkt (generative knowledge tracing)

**Tables:** `gkt`-related state via `repos/gkt.ts` (exists). **Core:** `packages/core/src/gkt/*`.

**MCP tool:** `gkt_session` — args `{ action: 'start'|'answer', courseId?, item?, correct? }` → current session state; keeps BKT pretest semantics (no Elo writes — rule 7: routed through the same repo the practice handler uses).

**CLI:** `hub gkt drill [--course <id>]` — interactive question loop only if isatty; non-interactive prints the next item and exits.

**Tests:** start→answer sequence state machine; no elo_events written (grep assertion).

### 15.3 Batch C3 — dialectic, spatial, world, guilds

#### Domain: dialectic (arena)

**Table (verified):** `dialectic_arena_debates` (schema.ts:1709). **Core:** `packages/core/src/dialectic`. **Repo:** `repos/dialectic.ts` exists (and is an F-03 XP site — post-commit-6 it calls awardXp).

**MCP tool:** `dialectic_arena` — args `{ action: 'list'|'propose'|'turn'|'vote', debateId?, topic?, stance?, content? }`. Turn-taking semantics ⚠︎verify from `repos/dialectic.ts` (debate phases).

**CLI:** `hub debate list` · `hub debate open --topic …` · `hub debate turn <id> --content …`.

**Tests:** list/propose/turn happy path; XP awarded exactly once per turn (idempotency ⚠︎verify repo semantics).

#### Domain: spatial (memory palaces)

**Tables:** `palaces`, `palace_items` (existing repo: palace3d). **Core:** `packages/core/src/memory.ts` (MAJOR_SYSTEM etc.).

**MCP tools:** `palace_list` (palaces + item counts) · `palace_add_locus` — args `{ palaceId?, name?, locus, cardId? }` → attaches a card to the next free locus (lociIndex semantics ⚠︎verify).

**CLI:** `hub palace list` · `hub palace add <palace> --locus "front door" [--card <id>]`.

**Tests:** locus ordering; card attach idempotent per locus.

#### Domain: world (forest economy)

**Tables (verified):** `user_avatars`, `forest_plots`, `study_coin_ledger`, `market_items`, `user_world_settings` — all covered by `repos/world.ts`.

**MCP tools:** `world_state` (avatar + plots + balance — read-only) · `world_market_buy` — args `{ itemId }` → purchase; ledger row appended (append-only discipline; insufficient coins → explicit error envelope).

**CLI:** `hub world status` · `hub world market [buy <itemId>]`.

**Tests:** buy decrements balance exactly once; ledger append; insufficient-funds rejection.

#### Domain: guilds/social

**Tables:** `guilds`, `guild_members` (✔ guilds repo), `seasonal_progress`, `review_duels`, `friends` (✔ social repo). Leaderboards/raids deliberately excluded (worker/web realtime).

**MCP tools:** `guild_list` (guilds + member counts) · `guild_join` — args `{ guildId }` → membership row.

**CLI:** `hub guild list` · `hub guild join <id>` · `hub guild leave <id>`.

**Tests:** join/leave idempotency; member count consistency.

### 15.4 Batch C4 — audio/TMR, cognitive-load, boss

#### Domain: audio / circadian / TMR

**Tables:** `audio_sessions`, `circadian_audio_sessions`, `tmr_cues` — ✔ repos audio/circadian.

**MCP tool:** `audio_schedule` — args `{ kind: 'commute'|'tmr' }` → current scheduled sessions/cues (read-only; authoring stays web-side because cue signatures are generated during playback flows).

**CLI:** `hub audio schedule [--kind commute|tmr]`.

**Tests:** read-only shape; no playback side effects (pure read).

#### Domain: cognitive-load telemetry

**Tables:** `cognitive_telemetry_events` (cardId, responseLatencyMs, hesitationVariance, estimatedCli, flowZone, interventionApplied) — ✔ repo cognitive-telemetry. **Core:** `packages/core/src/cognitive-load` (`evaluateCognitiveLoad`).

**MCP tool:** `cognitive_load_report` — args `{ days? }` → aggregated flow-zone distribution + intervention counts (read-only analytics).

**CLI:** `hub focus load [--days N]` — subcommand of the existing `focus` command.

**Tests:** aggregation math golden over seeded events; empty range → honest empty result.

#### Domain: boss/games

**Tables:** `boss_battles`. Participation is realtime web/worker — hosts get **observability only** (documented exclusion).

**MCP tool:** `boss_status` — args `{}` → active/recent battles summary (read-only).

**CLI:** `hub games status`.

**Tests:** read-only; no battle mutation possible from tool surface (grep: no insert/update on boss_battles outside handler).

---

## 16. Remaining handler test specifications (F-16, folders not enumerated in §14)

Compact specs — each folder: **suite file → cases (arrange/act/assert in one line)**. All follow the handler-test pattern (direct Request→Response, seeded db fixtures, zod-rejection case in every suite).

| Suite                            | Cases                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search.test.ts` (+nl)           | q matches FTS across notes/cards/reading · empty q → empty envelope · tag-filter syntax · nl without provider → manual keyword-split plan applied · nl with provider stub → parsed plan used · zod: junk body |
| `weekly.test.ts`                 | GET aggregates 7d buckets · tzOffset shifts week boundary · coach envelope with provider stub · rule-based fallback when provider none                                                                        |
| `dashboard.test.ts`              | returns lesson_progress + exam_dates widgets · empty state shape                                                                                                                                              |
| `timeline.test.ts`               | days param windowing · event types mixed                                                                                                                                                                      |
| `insights` + `insights/untested` | existing suites cover — extend: untested card scoring edge (no revlog)                                                                                                                                        |
| `calendar.test.ts`               | ics shape: VCALENDAR/VEVENT count matches exam_dates · escaping of commas in titles                                                                                                                           |
| `starter.test.ts`                | GET lists starters · POST installs a starter (idempotent — second call no-ops or updates ⚠︎verify)                                                                                                             |
| `onboarding/detox.test.ts`       | GET status · POST completes wizard state                                                                                                                                                                      |
| `canvas.test.ts` (+[id])         | CRUD round-trip · PATCH partial fields                                                                                                                                                                        |
| `commitments.test.ts`            | stake lifecycle (tzOffset from motivation handler pattern)                                                                                                                                                    |
| `friction.test.ts`               | POST appends append-only row · GET aggregates by trigger                                                                                                                                                      |
| `distractions.test.ts`           | add/list/remove app entry                                                                                                                                                                                     |
| `palace.test.ts` (+[id])         | palace + items CRUD · locus uniqueness                                                                                                                                                                        |
| `physio.test.ts`                 | upsert same-date · advice fields in response                                                                                                                                                                  |
| `quotes.test.ts`                 | daily rotation determinism for fixed date · POST/PATCH                                                                                                                                                        |
| `images.test.ts` (+[id])         | upload → base64 stored · serve returns bytes with mime · [id] miss → 404 envelope                                                                                                                             |
| `embeddings/index.test.ts`       | POST builds index for deck · GET status                                                                                                                                                                       |
| `ingest/multimodal.test.ts`      | text ingest → mined cards · unsupported media rejection                                                                                                                                                       |
| `notes.test.ts` (+[id])          | CRUD + wikilink parse (core `extractBacklinks`) · bullet sync POST                                                                                                                                            |
| `ideas.test.ts` (5 routes)       | CRUD · evolve XP path via awardXp · council/brainwrite manual envelopes with provider none                                                                                                                    |
| `tutor.test.ts` (chat sessions)  | sessions list/get · summary POST manual path (raw transcript)                                                                                                                                                 |
| `dialectic.test.ts`              | arena list/open/turn/vote · xp via awardXp once per turn                                                                                                                                                      |
| `spatial/palace-3d.test.ts`      | scene GET/POST round-trip                                                                                                                                                                                     |
| `world.test.ts` (7 routes)       | state · market buy ledger append · plots · avatar · settings · verify/focus + review envelopes                                                                                                                |
| `study-plan.test.ts`             | set/get/delete · ics format output                                                                                                                                                                            |
| `plugins/contributions.test.ts`  | first-party plugin contributions present (5 plugins)                                                                                                                                                          |
| `push.test.ts`                   | subscription PUT/GET/DELETE lifecycle · missing VAPID → honest degradation (handler behavior ⚠︎verify)                                                                                                         |
| `settings.test.ts`               | GET/PUT round-trip incl. theme + haptics (post-F-06) · test-provider POST with stub                                                                                                                           |
| `anki/connect.test.ts`           | connect status shape (no Anki running → graceful error envelope)                                                                                                                                              |

Coverage note after P3: every handler folder in the audit's zero-coverage list appears above or in §14; hub-registry/route-safety remain the structural net.

## 17. Execution protocol for the implementing agent

This section is the operating procedure for whoever (or whichever agent) executes §13's runbooks. It exists because the plan spans many sessions of work; the protocol keeps progress verifiable and resumable.

### 17.1 Session discipline

1. **One runbook per work block.** Start a block by reading the runbook + the finding spec (§5) + every file it touches. Never implement from the runbook alone — the spec has the reasoning.
2. **Snapshot before refactor** (F-01, F-03, F-13 batches): golden tests are written and passing against the _old_ code before the refactor commit; they must pass unchanged after.
3. **Commit after every green gate.** Never accumulate two runbooks in one commit; if a gate fails, fix or roll back before touching the next finding.
4. **The tree is always green at commit boundaries** — any reviewer can check out any commit and run the suite.

### 17.2 Verification cadence

| Cadence                           | Commands                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------- |
| Every commit                      | `npm run typecheck && npm run lint` + the runbook's named tests                 |
| Phase boundary (P0→P1→…)          | full `npm test` + `npm run test:e2e` + `npm run check:scripts` (after commit 4) |
| Transport/native-touching commits | + `npm run web:tauri`                                                           |
| UI commits                        | + manual 360px check, recorded in the final report                              |
| End of plan                       | §12 checklist, all boxes, honest unverified-items list                          |

### 17.3 Failure handling

- **Test catches a real bug** → fix in its own commit referencing the test; never widen the test to pass (rule 13).
- **Gate failure with unclear cause** → `git stash` nothing; investigate on the current commit; if >30 minutes without progress, roll back the runbook's changes (`git restore .`) and re-read the spec — the mismatch is almost always a wrong assumption about the touched file.
- **Migration added but not yet shipped externally** (this branch's lifetime) → may be reverted; once any device/DB has run it, it is immutable (rule 4).

### 17.4 Resuming across sessions

- Source of truth for position: `git log --oneline` vs §6.2's sequence table.
- The runbook for the next commit states its pre-flight; if a pre-flight fails, the previous runbook's post-flight was skipped — go back one.
- This document (§13–§16) is written to be sufficient context without conversation memory.

### 17.5 Out-of-scope guardrails

During execution, resist scope creep explicitly:

- No XP economy rebalancing inside the centralization commit (F-03) — separate commit if desired.
- No new linter rules while building Deck Doctor (F-12) — the doctor surfaces existing W1–W19.
- No API redesign while wiring dead endpoints (F-08) — the handlers exist; UI only.
- Docs edits stay within the F-19…F-26 line-by-line list (Appendix L) — prose polishing is not this plan.

---

## 18. Historical context (how the gaps arose)

Reconstructed from CHANGELOG.md, docs/PLAN-M6-M10.md, docs/plan-M19-M21.md, and the branch history — useful for reviewers judging each fix's shape.

| Era                                                | Shipped                                                                                                        | What was left behind                                                                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1–M5 (core engines)                               | FSRS-6, curriculum/LHCF, practice engine, mastery BKT+Elo, notes, focus                                        | early handler tests never written for the CRUD wave (F-16's old folders)                                                                                           |
| M6–M10 (discipline + social)                       | focus lockdown, reminders, visual learning, guilds/duels/raids, online hub                                     | distraction CRUD + share/export built without UI (F-08); PLAN-M6-M10 archived complete                                                                             |
| M11–M14 (AI + media)                               | AI adapters, tutor, feynman, council/brainwrite, TTS/audio                                                     | manual modes registered but two never surfaced (F-09); media.ts untested (F-15)                                                                                    |
| M15–M18 (world + sync + worker)                    | world economy, E2EE sync v1, Cloudflare worker, push                                                           | worker:deploy wiring mismatch (F-02); worker docs promised (F-11); VAPID env undocumented (F-23)                                                                   |
| M19–M21 (parity + polish)                          | FSRS optimizer UI, exam simulator, weakness v2, voice tutor, extension capture, command palette                | extension friction capture scoped not built (F-10); plan doc not updated (F-22); Playwright built not CI'd (F-18)                                                  |
| Cognitive expansion wave (this branch, 54 commits) | workload, exposure, GKT, circadian/TMR, dialectic, palace-3d, sensory (E-Ink/haptics), MCP/CLI cognitive tools | haptics partial (F-06); exam mastery write copied inline (F-01); XP duplication accumulated across waves (F-03); 13 domains accumulated without host parity (F-14) |

Pattern worth naming: **every gap in this plan is the residue of a shipped wave, not an abandoned one** — nothing here is a half-abandoned experiment; each residue is small, named, and now scheduled.

---

## 19. Code sketches for the major new modules

Illustrative TypeScript for the largest new artifacts. These are **starting points**: implementations must match surrounding idiom, real column names (§15 / Appendix G), and real core function signatures (⚠︎verify marks from §15 apply). All exports carry full JSDoc in the real code.

### 19.1 `packages/db/src/mastery-service.ts` (F-01)

```ts
/**
 * Mastery service — the single canonical path for BKT/Elo skill-mastery updates
 * (AGENTS.md rule 7). Both curriculum practice and exam submit route through
 * `applySkillResponse`; no other module may write `mastery` or `elo_events`.
 *
 * Invariants:
 * - Runs inside the caller's transaction (never opens its own — rule 6).
 * - `elo_events` is append-only (rule 8): one row per rating change.
 * - FSRS card state is NEVER touched here — exams are not card reviews.
 * - Exam K-factor and practice K-factor are preserved constants from the
 *   pre-refactor handlers (golden-tested in packages/db/tests/mastery-golden.test.ts).
 */
import { applyReviewToMastery } from '@learning-hub/core/bkt'
import { eloUpdate } from '@learning-hub/core/elo'
import { mastery, eloEvents } from './schema'
import type { Tx } from './review-service'

export interface SkillResponseInput {
  skillId: string
  correct: boolean
  /** ms timestamp for the event row; defaults to now (caller passes for determinism) */
  atMs?: number
  /** Elo K-factor; defaults to the practice constant, exam path passes its own */
  eloK?: number
}

export interface SkillResponseResult {
  pKnown: number
  attempts: number
  correct: number
  elo: number
  ratingBefore: number
  ratingAfter: number
}

export function applySkillResponse(tx: Tx, input: SkillResponseInput): SkillResponseResult {
  const atMs = input.atMs ?? Date.now()
  const row = tx.select().from(mastery).where(eq(mastery.skillId, input.skillId)).get()

  const before = row ?? { pKnown: DEFAULT_BKT.pKnown, attempts: 0, correct: 0, elo: STARTING_ELO }
  const bkt = applyReviewToMastery(before, input.correct)
  const { ratingAfter } = eloUpdate(before.elo, input.correct, input.eloK ?? DEFAULT_PRACTICE_K)

  tx.insert(mastery)
    .values({
      skillId: input.skillId,
      pKnown: bkt.pKnown,
      attempts: bkt.attempts,
      correct: bkt.correct,
      elo: ratingAfter,
    })
    .onConflictDoUpdate({
      target: mastery.skillId,
      set: { pKnown: bkt.pKnown, attempts: bkt.attempts, correct: bkt.correct, elo: ratingAfter },
    })

  if (ratingAfter !== before.elo) {
    tx.insert(eloEvents).values({
      skillId: input.skillId,
      outcome: input.correct ? 1 : 0,
      ratingBefore: before.elo,
      ratingAfter,
      atMs,
    })
  }
  return {
    pKnown: bkt.pKnown,
    attempts: bkt.attempts,
    correct: bkt.correct,
    elo: ratingAfter,
    ratingBefore: before.elo,
    ratingAfter,
  }
}
```

### 19.2 `packages/db/src/repos/xp.ts` (F-03)

```ts
/**
 * XP economy — the single table of non-grade XP sources. Card grades keep their
 * canonical path inside review-service; everything else goes through awardXp
 * (AGENTS.md rule 7: never update XP by hand; rule 8: xp_events is insert-only).
 */
export const XP_SOURCES = {
  journal: 25,
  habit: 15,
  focus: 30,
  quest: 20,
  idea: 10,
  feynman: 60,
  achievement: 50,
  dialectic: 20,
  social: 15,
} as const
export type XpSource = keyof typeof XP_SOURCES

export function awardXp(
  tx: Tx,
  input: {
    source: XpSource
    amountOverride?: number
    meta?: Record<string, unknown>
    atMs?: number
  },
): void {
  const amount = input.amountOverride ?? XP_SOURCES[input.source]
  tx.insert(xpEvents).values({
    source: input.source,
    amount,
    meta: input.meta ?? {},
    atMs: input.atMs ?? Date.now(),
  })
}
```

### 19.3 `packages/db/src/repos/habits.ts` (F-13 B2 + F-14 C1)

```ts
/** Habits repo — shared by the web handlers and the new MCP/CLI surfaces. */

export function listHabits(tx: Tx, opts: { includeArchived?: boolean } = {}): HabitRow[] {
  const rows = tx.select().from(habits).orderBy(asc(habits.order)).all()
  return opts.includeArchived ? rows : rows.filter((r) => !r.archived)
}

/**
 * Check in a habit for a local date. Idempotent per (habitId, date):
 * a second check-in updates the note and reports created:false — it never
 * duplicates the row or double-awards XP (awardXp runs only on created:true).
 */
export function checkInHabit(
  tx: Tx,
  input: { habitId: number; date: string; note?: string },
): { created: boolean } {
  const existing = tx
    .select()
    .from(habitLogs)
    .where(and(eq(habitLogs.habitId, input.habitId), eq(habitLogs.date, input.date)))
    .get()
  if (existing) {
    if (input.note !== undefined)
      tx.update(habitLogs).set({ note: input.note }).where(eq(habitLogs.id, existing.id)).run()
    return { created: false }
  }
  tx.insert(habitLogs).values({ habitId: input.habitId, date: input.date, note: input.note }).run()
  return { created: true }
}
```

### 19.4 `packages/core/src/doctor.ts` (F-12)

```ts
/**
 * Deck Doctor — turns 20-Rules linter findings into an actionable fix plan.
 * Pure logic: no I/O, no Date.now; deterministic for a given deck snapshot.
 */
import { lintDeck, type LintFinding } from './linter'

export type DoctorAction =
  | { kind: 'suspend-card'; cardId: number; rule: string }
  | { kind: 'delete-card'; cardId: number; rule: string }
  | { kind: 'regenerate-cloze'; cardId: number; rule: string } // W11 intent — handled by the cloze pipeline
  | { kind: 'manual'; rule: string; cardIds: number[]; hint: string }

export interface DeckDiagnosis {
  deckId: number
  /** 0–100; 100 − Σ severityWeights of findings, clamped (formula documented + golden-tested) */
  healthScore: number
  findings: LintFinding[]
  actions: DoctorAction[]
}

const SEVERITY_WEIGHT: Record<LintFinding['severity'], number> = { high: 12, medium: 6, low: 2 }

export function diagnoseDeck(input: { deck: DeckRow; cards: CardRow[] }): DeckDiagnosis {
  // Findings = the linter's implemented rules (W1…W19 ids, 10 rules at
  // linter.ts:235-354) + leech candidates from the FSRS stats (leechCandidates
  // in core/fsrs.ts) — leeches are a scheduling signal, not a linter rule.
  const findings = [...lintDeck(input.cards), ...leechFindings(input.cards)]
  const actions: DoctorAction[] = []
  for (const f of findings) {
    switch (f.ruleId) {
      case 'W6-interference': // near-duplicate of a sibling — suspend the later card (safe default)
        actions.push({ kind: 'suspend-card', cardId: f.cardId, rule: f.ruleId })
        break
      case 'W11-cloze-suggestion': // enumeration answer → offer cloze regeneration intent
        actions.push({ kind: 'regenerate-cloze', cardId: f.cardId, rule: f.ruleId })
        break
      // W1/W2/W3/W9/W10/W14/W18/W19 + leeches are judgment or content-edit
      // rules → guided manual hints citing the rule's research note.
      default:
        actions.push({ kind: 'manual', rule: f.ruleId, cardIds: f.cardIds, hint: f.suggestion })
    }
  }
  const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0))
  return { deckId: input.deck.id, healthScore: score, findings, actions }
}
```

### 19.5 `apps/web/src/server/net.ts` (F-07)

```ts
/**
 * Outbound-network port for handlers (runtime-neutral; injected per target).
 * On web this is global fetch. Under the hub worker (native webview) it routes
 * through the net/fetch protocol → the native HTTP bridge, so remote calls are
 * not subject to webview CORS (mirrors how AI traffic is bridged in worker.ts).
 */
export type RemoteFetch = (url: string, init?: RequestInit) => Promise<Response>

let impl: RemoteFetch = (url, init) => fetch(url, init)

export function setRemoteFetch(next: RemoteFetch): void {
  impl = next
}
export function remoteFetch(url: string, init?: RequestInit): Promise<Response> {
  return impl(url, init)
}
```

### 19.6 `apps/extension/src/friction.ts` (F-10)

```ts
/**
 * Friction capture — pure decision function + fire-and-forget reporter.
 * Silent by contract: no popups, no counters; a navigation either produces one
 * friction event or nothing.
 */
export interface FocusBridgeState {
  inSession: boolean
  sessionStartMs: number | null
  blockedDomains: string[]
}

export type FrictionDecision =
  | { record: true; trigger: 'extension'; proceeded: true; delaySec: number; domain: string }
  | { record: false; reason: 'not-in-session' | 'domain-allowed' | 'unknown-domain' }

export function decide(state: FocusBridgeState, hostname: string, nowMs: number): FrictionDecision {
  if (!state.inSession || state.sessionStartMs === null)
    return { record: false, reason: 'not-in-session' }
  const domain = registrableDomain(hostname)
  if (!state.blockedDomains.includes(domain)) return { record: false, reason: 'domain-allowed' }
  return {
    record: true,
    trigger: 'extension',
    proceeded: true,
    delaySec: Math.round((nowMs - state.sessionStartMs) / 1000),
    domain,
  }
}

export function reportFriction(event: FrictionDecision & { record: true }): void {
  void fetch('/api/friction', { method: 'POST', body: JSON.stringify(event) }).catch(
    () =>
      void fetch('/api/friction', { method: 'POST', body: JSON.stringify(event) }).catch(() => {}),
  ) // single retry, never blocks navigation
}
```

### 19.7 `apps/web/src/server/handlers/decks/doctor/route.ts` (F-12)

```ts
/**
 * GET  /api/decks/doctor?deckId= — diagnose a deck (linter findings + fix actions).
 * POST /api/decks/doctor { deckId, actions } — apply mechanical actions in ONE
 * transaction (rule 6): suspend/delete cards, rename deck. Never touches FSRS,
 * mastery, XP (no grading happens here). Returns a per-action result summary.
 */
const QuerySchema = z.object({ deckId: z.coerce.number().int().positive() })
const BodySchema = z.object({
  deckId: z.number().int().positive(),
  actions: z
    .array(
      z.union([
        z.object({
          kind: z.literal('suspend-card'),
          cardId: z.number().int().positive(),
          rule: z.string(),
        }),
        z.object({
          kind: z.literal('delete-card'),
          cardId: z.number().int().positive(),
          rule: z.string(),
        }),
        z.object({
          kind: z.literal('regenerate-cloze'),
          cardId: z.number().int().positive(),
          rule: z.string(),
        }),
      ]),
    )
    .min(1),
})

export const GET = withRoute(async (req) => {
  const { deckId } = readQuery(req, QuerySchema)
  const diagnosis = diagnoseDeck(await loadDeckSnapshot(deckId))
  return Response.json(diagnosis)
})

export const POST = withRoute(async (req) => {
  const body = readJson(req, BodySchema)
  return withTransaction((tx) => {
    const results = body.actions.map((a) => applyDoctorAction(tx, body.deckId, a)) // throws on unknown card → rollback
    return Response.json({ ok: true, results })
  })
})
```

### 19.8 `packages/db/src/migrations/027-haptics-setting.ts` (F-06)

```ts
import type { Migration } from '../runner'

/**
 * 027 — haptics-enabled user setting (F-06). Additive, backfill-safe:
 * existing rows receive the default (true). Never edit this migration after
 * it has shipped to any device (AGENTS.md rule 4).
 */
export const hapticsSetting: Migration = {
  id: 27,
  name: 'haptics-setting',
  up(ctx) {
    ctx.addColumn('user_settings', 'haptics_enabled', 'INTEGER NOT NULL DEFAULT 1')
  },
}
```

### 19.9 `scripts/check-package-scripts.mjs` (F-02 + §10.4)

```js
/**
 * Script-drift + doc-count guard. Fails CI when:
 *  1. a root script `npm run X -w Y` names a script X that apps/Y/package.json lacks;
 *  2. a top-level scripts/ file is referenced by no npm script and no doc (not archived);
 *  3. the table count / MCP tool count pinned in docs drift from the code
 *     (pins activate in commit 38 when the docs are corrected).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
// … parse root package.json scripts; match /npm run (\S+) -w (@?\S+)/g; check targets.
// … list scripts/*.???. Count `= table(` in packages/db/src/schema.ts; compare to ENGINE-REFERENCE.md.
process.exitCode = violations.length ? 1 : 0
```

---

## 20. UI wireframes (new surfaces)

ASCII wireframes for review; all follow the mobile-first rule (360px primary). `@/ui` components named inline.

### 20.1 Deck Doctor sheet (F-12) — opened from deck row

```
┌──────────────────────────────────────────┐
│ Deck Doctor — Cardiology Basics       ✕  │  Sheet header (Sheet, @/ui)
├──────────────────────────────────────────┤
│  ████████████████████░░░░  82/100        │  ProgressBar + score
│  Mostly healthy — 3 fixable issues       │
│  214 cards · ran just now                │
├──────────────────────────────────────────┤
│ ▾ Leeches (3 cards)               [Fix]  │  FSRS leechCandidates — suspend default
│     Cards you keep failing. Suspending  │
│     them is safe; deleting needs a       │
│     backup.                             │
│     [☐ card 42] [☐ card 87] [☐ card 133] │
│ ▾ W6 Interference (1 pair)        [Fix]  │  near-duplicate — suspends the later card
│     Cards 87% similar; reviewing both    │
│     interferes. [Suspend duplicate]      │
│ ▸ W1 Minimum information (2 cards) [How?] │  manual rule → split guidance
│ ▸ W2 Avoid sets (1 card)         [How?]  │  enumeration → cloze suggestion
│ ▸ W3 Answer length (4 cards)     [How?]  │
│ ▸ W10 Imagery (6 cards)          [How?]  │  manual rule → guidance disclosure
│ ▸ W18 Date stamp (2 cards)       [How?]  │  SuperMemo: avoid date stamps
├──────────────────────────────────────────┤
│ [ Re-run doctor ]      Undo only via a   │  footer hint
│                        backup            │
└──────────────────────────────────────────┘
```

### 20.2 Review stats panel (F-08①) — analytics page section

```
┌─ Per-deck activity ──────────────────────────┐
│ Deck            Today   7d    30d   Lapses   │
│ Cardiology         12   63    210   ▂▃▂ 4%   │  ProgressBar per lapse rate
│ Neuroanatomy        8   41    132   ▂▁▁ 1%   │
│ Spanish verbs       0   18     67   ▅▃▂ 9%   │
│ …                                            │
│ (EmptyState: "No reviews yet — stats appear  │
│  after your first session.")                 │
└──────────────────────────────────────────────┘
```

### 20.3 Distraction apps (F-08③) — focus page section

```
┌─ Distraction apps ───────────────────────────┐
│ These apps are logged when a focus session   │
│ catches you switching to them.               │
│ ┌──────────────────────────────────────────┐ │
│ │ Add domain or app name…            [Add] │ │  TextField + Button (primary)
│ └──────────────────────────────────────────┘ │
│  instagram.com                     [Remove]  │  quiet secondary
│  news.ycombinator.com              [Remove]  │
└──────────────────────────────────────────────┘
```

### 20.4 Remedial path (F-08⑥) — graph page inspector

```
┌─ Skill: Neural Networks ─────────────────────┐
│ Mastery 34% · weak ancestors detected        │
│ [ Suggest remedial path ]                    │  Button (primary)
│ ── after tap ──                              │
│ 1. Linear Algebra      41%  → open lesson    │
│ 2. Chain Rule          55%  → open lesson    │
│ 3. Gradients           62%  → open lesson    │
│ (EmptyState: "No remedial work needed.")     │
└──────────────────────────────────────────────┘
```

### 20.5 Manual-mode panels (F-09)

```
Tutor page (needsSetup for summary):
┌─ Do it by hand ──────────────────────────────┐
│ 1. Re-read the transcript above.             │
│ 2. List every question you could not answer. │
│ 3. For each, find the answer in your notes.  │
│ ┌──────────────────────────────────────────┐ │
│ │ Write your summary…                      │ │
│ └──────────────────────────────────────────┘ │
│ [ Save summary ]                             │
└──────────────────────────────────────────────┘

Search page (needsSetup for nl-search):
┌─ Search tips ────────────────────────────────┐
│ · deck:anatomy heart — limit to a deck       │
│ · "exact phrase" — quoted match              │
│ · tag:latin — filter by card tag             │
└──────────────────────────────────────────────┘
(results still shown below — guidance, never a gate)
```

### 20.6 Settings: haptics toggle (F-06)

```
┌─ Sensory ────────────────────────────────────┐
│ Haptics                            [⬤──]    │  Toggle, default on
│ Vibration feedback on grading and session    │
│ boundaries. Off = completely silent.         │
└──────────────────────────────────────────────┘
```

---

## 21. Manual validation scenarios (human test scripts)

Step-by-step scripts a human runs after the relevant phase to validate features beyond what automated tests cover. Each is ≤5 minutes and produces a pass/fail observation for the final report.

### V-1 — Haptics setting (after commit 7)

1. Settings → Sensory → toggle Haptics off → reload page → toggle still off.
2. Open review, grade 3 cards → no vibration (desktop: devtools `navigator.vibrate` mock observed; mobile: physical check).
3. Toggle on → grade 3 cards → vibration fires.
4. `npm run db:push` on the dev DB → clean; inspect `user_settings` → `haptics_enabled` present.

### V-2 — Native bridge (after commit 8; requires `npm run app:dev`)

1. Launch the Windows app; open Online; register against a local echo server.
2. Observe the request arrives with the app's origin and **no** CORS error.
3. Compare: on web dev (`npm run dev`) the same flow still works identically.

### V-3 — Dead-endpoint UIs (after commits 9–14)

1. Analytics → Per-deck activity shows rows after reviewing ≥1 card.
2. Decks → row menu → Share… → clipboard contains a share string → paste into Online import → deck appears.
3. Focus → add `example.com` to Distraction apps → appears in list → Remove works.
4. Trigger a reminder notification (planner) → click it → planner engagement % reflects the click; navigation instant.

### V-4 — Deck Doctor (after commit 18)

1. Create a small deck with: one duplicate pair, one card graded Wrong ≥8 times (leech), one off-convention name.
2. Run Doctor → score < 100; leech cards offer suspend (default), the W6 near-duplicate offers suspend-duplicate, W18 flags the date-stamped card, W1/W3 offer guided hints.
3. Apply all → verify cards suspended/deleted, deck renamed; re-run → score 100, honest empty state.
4. 360px: sheet stacks, no horizontal scroll, targets ≥44px.

### V-5 — Manual modes (after commit 15)

1. Settings → AI provider `none`.
2. Tutor → open a session → Summary → "Do it by hand" panel appears with steps; save works; appears in session.
3. Search → natural query → results + "Search tips" strip.

### V-6 — Extension friction capture (after commit 16)

1. Build extension; pair with dev web app.
2. Start Focus Max in the web app with `example.com` blocked.
3. Navigate to example.com in the paired browser.
4. Focus page friction log shows a new event with trigger `extension`; popup status line unchanged.

### V-7 — MCP/CLI parity spot checks (after commits 28–31)

1. `npm run cli -- habits checkin 1` → created; run again → updated (no duplicate).
2. `npm run cli -- journal write --mood 4 --wins "shipped the plan"` → row exists; `npm run cli -- journal show` prints it.
3. MCP: `habit_list`, `physio_log`, `world_state` return real data against the dev DB.
4. `npm run cli -- world market` → list; buy an affordable item → balance decremented once; ledger row appended.

### V-8 — Worker self-hosting doc (after commit 17)

1. Fresh clone on a machine with Node + wrangler: follow `docs/worker-self-hosting.md` verbatim through `wrangler dev`.
2. Every command in the doc runs without unstated prerequisites; divergences → fix the doc in the same phase.

---

## 22. Agent validation sessions (MCP/CLI acceptance, post-F-14)

Example sessions an agent (or the user) runs to prove the new tool surface is coherent. Each session is the acceptance test for its batch; outputs shown are the expected shape (… = elided).

### S-C1 — habits/journal/physio

```
agent: habit_list {}                        → [{ id: 1, name: "Morning pages", streak: 6, … }]
agent: habit_checkin { habitId: 1 }         → { created: true, date: "<today>" }
agent: habit_checkin { habitId: 1 }         → { created: false, date: "<today>" }   ← idempotent
agent: journal_write { mood: 4, smallWins: "ran V-8" } → { id: 9, date: "<today>", … }
agent: physio_log { sleepHours: 7.5, sleepQuality: 4 } → { …, advice: { zone: "…", sleep: "…", caffeine: "…" } }
```

### S-C2 — reading/plan/gkt

```
agent: reading_list { status: "queued" }    → [{ id: 3, title: "Attention paper", priority: 72, position: 0 }]
agent: reading_add { title: "…", content: "…", kind: "paper" } → { id: 11, status: "queued" }
agent: study_plan_get { format: "summary" } → "This week: 4 blocks, 210 min, rest on Sunday"
agent: gkt_session { action: "start", courseId: 2 } → { item: …, pretest: true }
```

### S-C3 — dialectic/spatial/world/guilds

```
agent: dialectic_arena { action: "list" }   → [{ id: 5, topic: "Spaced vs massed", status: "open" }]
agent: palace_list {}                       → [{ id: 1, name: "Home", items: 12 }]
agent: palace_add_locus { palaceId: 1, locus: "kitchen", cardId: 87 } → { lociIndex: 13 }
agent: world_state {}                       → { avatar: …, plots: 3, coins: 240 }
agent: world_market_buy { itemId: 4 }       → { ok: true, coins: 215, ledgerAppended: true }
agent: guild_list {}                        → [{ id: 2, name: "Night Owls", members: 7 }]
```

### S-C4 — audio/load/boss

```
agent: audio_schedule { kind: "commute" }   → [{ … sessionMode, binauralMode … }]
agent: cognitive_load_report { days: 7 }    → { flowZones: { flow: 41 }, interventions: 3 }
agent: boss_status {}                       → { active: 0, recent: [{ … }] }
```

Failure-shape checks (every batch): unknown ids → `error` envelope with a stable code; zod violations → validation message naming the field; read-only tools never mutate (grep-asserted in their suites).

---

## 23. File-level change map (impact analysis)

Every file this plan creates or modifies, grouped by phase. "N" = new file, "M" = modify. Use this as the review checklist: after each phase, `git diff --stat main...HEAD` should show exactly these files (plus this plan's doc).

### Phase P0 (commits 2–6)

| File                                                        | N/M | Commit | Change                               |
| ----------------------------------------------------------- | --- | ------ | ------------------------------------ |
| `apps/web/package.json`                                     | M   | 2, 3   | lint script fix; drop plugin-updater |
| `package-lock.json`                                         | M   | 3      | dependency sync                      |
| `docs/native.md`                                            | M   | 3      | updater honesty note                 |
| `package.json` (root)                                       | M   | 4      | worker:deploy fix; add check:scripts |
| `scripts/check-package-scripts.mjs`                         | N   | 4      | script-drift + doc-count guard       |
| `packages/db/tests/mastery-golden.test.ts`                  | N   | 5      | behavior snapshot (written first)    |
| `packages/db/src/mastery-service.ts`                        | N   | 5      | canonical BKT/Elo path               |
| `packages/db/src/index.ts`                                  | M   | 5      | export                               |
| `apps/web/src/server/handlers/curriculum/exam/route.ts`     | M   | 5      | use service                          |
| `apps/web/src/server/handlers/curriculum/practice/route.ts` | M   | 5      | use service                          |
| `packages/db/tests/mastery-service.test.ts`                 | N   | 5      | unit cases                           |
| `packages/db/tests/xp-golden.test.ts`                       | N   | 6      | 12-site snapshot                     |
| `packages/db/src/repos/xp.ts`                               | N   | 6      | awardXp + XP_SOURCES                 |
| `packages/db/src/repos/index.ts`                            | M   | 6      | export                               |
| 12 XP call sites (list in F-03)                             | M   | 6      | route through awardXp                |

### Phase P1 (commits 7–17)

| File                                                   | N/M | Commit | Change                                  |
| ------------------------------------------------------ | --- | ------ | --------------------------------------- |
| `packages/db/src/schema.ts`                            | M   | 7      | user_settings.hapticsEnabled            |
| `packages/db/src/migrations/027-haptics-setting.ts`    | N   | 7      | migration                               |
| `packages/db/src/migrations/index.ts`                  | M   | 7      | register 027                            |
| `packages/db/tests/migrations.test.ts`                 | M   | 7      | 027 cases                               |
| `apps/web/src/server/handlers/settings/route.ts`       | M   | 7      | zod + persistence                       |
| `apps/web/app/settings/page.tsx`                       | M   | 7      | Sensory toggle                          |
| `apps/web/src/platform/haptics.ts`                     | M   | 7      | enabled flag + no-op                    |
| `apps/web/app/exam-sim/page.tsx`                       | M   | 7      | haptic calls                            |
| `apps/web/app/voice-tutor/page.tsx`                    | M   | 7      | haptic calls                            |
| `apps/web/tests/calm-sensory.test.ts`                  | M   | 7      | disabled-flag cases                     |
| `apps/web/src/server/net.ts`                           | N   | 8      | remoteFetch port                        |
| `apps/web/src/hub/worker.ts`                           | M   | 8      | net/fetch bridge route                  |
| `apps/web/src/hub/protocol.ts`                         | M   | 8      | protocol types                          |
| `apps/web/src/lib/net-host.ts`                         | M   | 8      | generic bridged fetch                   |
| 5 online/social handler files                          | M   | 8      | use remoteFetch                         |
| `apps/web/tests/net-bridge.test.ts`                    | N   | 8      | port + routing tests                    |
| `apps/web/app/analytics/page.tsx`                      | M   | 9      | per-deck stats panel                    |
| `apps/web/app/decks/page.tsx`                          | M   | 10, 18 | share-export action; Doctor panel       |
| `apps/web/app/focus/page.tsx`                          | M   | 11     | distraction apps section                |
| `apps/web/public/sw.js`                                | M   | 12     | click POST                              |
| `apps/web/app/planner/page.tsx`                        | M   | 12     | engagement %                            |
| `apps/web/app/graph/page.tsx`                          | M   | 14     | remedial path                           |
| `apps/web/src/server/handlers/audio/sessions/route.ts` | D   | 13     | remove                                  |
| `apps/web/app/api/audio/sessions/route.ts`             | D   | 13     | remove shim                             |
| `apps/web/src/hub/handlers-registry.ts`                | M   | 13, 18 | remove audio/sessions; add decks/doctor |
| `apps/web/tests/routes-smoke.test.ts`                  | M   | 13     | drop smoke import                       |
| `apps/web/app/tutor/page.tsx`                          | M   | 15     | manual-mode panel                       |
| `apps/web/app/search/page.tsx`                         | M   | 15     | search-tips strip                       |
| `apps/web/tests/manual-mode-surface.test.ts`           | N   | 15     | invariant                               |
| `apps/extension/src/friction.ts`                       | N   | 16     | decision + reporter                     |
| `apps/extension/src/service-worker.ts`                 | M   | 16     | listener wiring                         |
| `apps/extension/src/state.ts`                          | M   | 16     | bridge state sync                       |
| `apps/extension/tests/friction.test.ts`                | N   | 16     | decision table                          |
| `docs/worker-self-hosting.md`                          | N   | 17     | self-hosting guide                      |
| `docs/README.md`                                       | M   | 17     | index the new doc                       |

### Phase P2 (commits 18–31)

| File                                                            | N/M | Commit | Change                 |
| --------------------------------------------------------------- | --- | ------ | ---------------------- |
| `packages/core/src/doctor.ts`                                   | N   | 18     | diagnoseDeck + actions |
| `packages/core/tests/doctor.test.ts`                            | N   | 18     | diagnosis cases        |
| `apps/web/src/server/handlers/decks/doctor/route.ts`            | N   | 18     | GET/POST               |
| `apps/web/app/api/decks/doctor/route.ts`                        | N   | 18     | shim                   |
| `apps/web/tests/decks-doctor.test.ts`                           | N   | 18     | handler suite          |
| `CHANGELOG.md`                                                  | M   | 18     | Deck Doctor entry      |
| `packages/db/src/repos/{notes,journal}.ts`                      | N   | 19     | B1                     |
| `packages/db/src/repos/{habits,commitments}.ts`                 | N   | 20     | B2                     |
| `packages/db/src/repos/reading.ts`                              | N   | 21     | B3                     |
| `packages/db/src/repos/{goals,quests}.ts`                       | N   | 22     | B4                     |
| `packages/db/src/repos/quotes.ts`                               | N   | 23     | B5                     |
| `packages/db/src/repos/{physio,canvas}.ts`                      | N   | 24     | B6                     |
| `packages/db/src/repos/{images,sync-meta}.ts`                   | N   | 25     | B7                     |
| `packages/db/src/repos/focus-extras.ts`                         | N   | 26     | B8                     |
| `packages/db/src/repos/memory.ts` (mnemonic)                    | M   | 27     | B9                     |
| corresponding web handlers (see F-13 table)                     | M   | 19–27  | repo calls             |
| `packages/db/tests/{b1..b9}-repo.test.ts`                       | N   | 19–27  | per-batch suites       |
| `apps/mcp/src/tools/{habits,journal,physio,…}.ts` (12 modules)  | N   | 28–31  | C1–C4 tools            |
| `apps/mcp/src/index.ts`                                         | M   | 28–31  | registrations          |
| `apps/cli/src/index.ts`                                         | M   | 28–31  | commands               |
| `packages/core/src/<domain>` (schema extensions)                | M   | 28–31  | tool arg types         |
| `tests/e2e/tier1-features/{api-mcp-tools,cli-commands}.test.ts` | M   | 28–31  | new tool/command cases |
| `docs/ENGINE-REFERENCE.md`                                      | M   | 31     | tool counts (final)    |

### Phase P3 (commits 32–36)

| File                                                                                | N/M | Commit | Change              |
| ----------------------------------------------------------------------------------- | --- | ------ | ------------------- |
| `packages/core/tests/{habits,media,quotes,reading,bkt,pedagogy,ai-modules}.test.ts` | N   | 32     | 7 suites            |
| ~16 web handler test files (§14 + §16)                                              | N/M | 33–34  | risk-ranked + smoke |
| 9 e2e files (F-17 table)                                                            | N   | 35     | flows               |
| `docs/TEST_INFRA.md`                                                                | M   | 35     | new e2e list        |
| `.github/workflows/ci.yml`                                                          | M   | 36     | Playwright step     |

### Phase P4 (commits 37–44)

| File                                    | N/M | Commit     | Change                                 |
| --------------------------------------- | --- | ---------- | -------------------------------------- |
| `README.md`                             | M   | 37, 38     | roadmap; provider table                |
| `ARCHITECTURE.md`                       | M   | 38         | maps + counts                          |
| `AGENTS.md`                             | M   | 38, 42, 44 | maps; enforcement table; nav exception |
| `docs/ENGINE-REFERENCE.md`              | M   | 38         | table count + optimizer note           |
| `docs/learning-science.md`              | M   | 39         | SDT + legend                           |
| `docs/plan-M19-M21.md`                  | M   | 40         | status reconciliation                  |
| `.env.example`                          | M   | 41         | VAPID + TARGET vars                    |
| `docs/api-server.md`, `docs/plugins.md` | M   | 41         | env docs                               |
| `.github/workflows/ci.yml`              | M   | 42         | commitlint + format steps              |
| `eslint.config.mjs`                     | M   | 42         | scoped fetch ban                       |
| `packages/db/tests/rules-guard.test.ts` | N   | 42         | rule 7/8 guards                        |
| `package.json` (root)                   | M   | 43         | build:packages complete                |
| `scripts/archive/*` + README            | N   | 43         | 4 moved scripts                        |
| `docs/TEST_INFRA.md`                    | M   | 44         | full refresh                           |

Total: ~70 new files, ~60 modified, 3 deleted — every one traceable to a finding ID.

---

## 24. Glossary

Terms used in this plan, with their meaning _in this repo_:

| Term                                   | Meaning                                                                                                                                                                                                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AGENTS.md rules 1–13**               | The hard invariants in the repo operating manual (§10.1 maps each to its enforcement).                                                                                                                                                                                                 |
| **Append-only table**                  | Tables that must never be UPDATEd or DELETEd (rule 8): `revlog`, `xp_events`, `friction_events`, `elo_events`, + the others listed in §8.3.                                                                                                                                            |
| **BKT**                                | Bayesian Knowledge Tracing — per-skill `pKnown` model in `packages/core/src/bkt.ts`.                                                                                                                                                                                                   |
| **Cloze**                              | Fill-in-the-blank card type (`____` placeholder in the sentence).                                                                                                                                                                                                                      |
| **Deck Doctor**                        | The F-12 feature: linter-driven deck health with one-click fixes (built by this plan).                                                                                                                                                                                                 |
| **Elo**                                | Rating model for skill difficulty/ability, `packages/core/src/elo.ts`; `elo_events` records changes append-only.                                                                                                                                                                       |
| **E-Ink Zen**                          | The `theme-e-ink` CSS theme (settings), shipped on this branch.                                                                                                                                                                                                                        |
| **executeReview / executeBatchReview** | The single grading path in `packages/db/src/review-service.ts` (rule 7).                                                                                                                                                                                                               |
| **FSRS-6**                             | Free Spaced Repetition Scheduler v6 — card memory state (stability/difficulty/reps/lapses).                                                                                                                                                                                            |
| **Friction event**                     | Append-only record of a focus-gate interruption (`friction_events`).                                                                                                                                                                                                                   |
| **GKT**                                | Generative Knowledge Testing (`packages/core/src/gkt`), cognitive-load-aware practice.                                                                                                                                                                                                 |
| **Golden test**                        | A test whose expectations are captured from current behavior _before_ a refactor and must pass unchanged after.                                                                                                                                                                        |
| **Hub worker**                         | The in-webview backend for native targets: `apps/web/src/hub/{worker,registry,protocol}`.                                                                                                                                                                                              |
| **LHCF**                               | Learning Hub Curriculum Format — the public contract others' AIs produce (`docs/curriculum/`).                                                                                                                                                                                         |
| **Leech**                              | A card repeatedly failed — FSRS lapse signal via `leechCandidates` (`core/fsrs.ts`); Deck Doctor's default action is suspend.                                                                                                                                                          |
| **Manual mode**                        | Provider-none workflow for every AI feature (rule 9) — steps in `packages/core/src/ai/manual.ts`.                                                                                                                                                                                      |
| **MCP**                                | Model Context Protocol host (`apps/mcp`) — the agent surface.                                                                                                                                                                                                                          |
| **OPFS**                               | Origin-Private File System — where the native sqlite-wasm DB lives.                                                                                                                                                                                                                    |
| **Pretest**                            | Practice attempt exempt from Elo/BKT updates (`ExercisePractice` pretest flag).                                                                                                                                                                                                        |
| **Revlog**                             | Append-only review log (epoch-ms PK); undo via `revlog_undos` tombstones.                                                                                                                                                                                                              |
| **Runbook**                            | §13's per-commit execution checklist.                                                                                                                                                                                                                                                  |
| **SQ3R**                               | Survey-Question-Read-Recite-Review reading method (`sq3r_sessions`).                                                                                                                                                                                                                   |
| **TMR**                                | Targeted Memory Reactivation — sleep audio cues (`tmr_cues`).                                                                                                                                                                                                                          |
| **Transport**                          | `@/lib/transport` — the only way UI talks to the backend (rule 1).                                                                                                                                                                                                                     |
| **W-rules**                            | The 20-Rules linter's rule ids W1…W19 — 10 implemented at `packages/core/src/linter.ts:235-354` (W1 minimum-information, W2 avoid-sets, W3 answer-length, W6 interference, W9 source-missing, W10 imagery, W11 cloze-suggestion, W14 context-cue, W18 date-stamp, W19 priority-stamp). |
| **WOOP**                               | Wish-Outcome-Obstacle-Plan goal structure (`goals`, `motivation.ts`).                                                                                                                                                                                                                  |
| **XP event**                           | Append-only experience-points record (`xp_events`) — centralized by F-03.                                                                                                                                                                                                              |

---

## 25. FAQ (questions a reviewer will ask)

**Q: Why is F-01 P0 when exams work today?**
The handler works — until someone changes Elo or BKT math in one copy and not the other. The bug it produces is silent data inconsistency in the mastery model, and the fix cost only grows. It's also the one _hard-rule violation_ found; hard rules are the repo's contract.

**Q: Why build Deck Doctor instead of removing the README claim?**
Decision taken with the user (2026-11-08). The engine (20-Rules linter) is complete and tested; the feature is surfacing + fix actions — a day and a half, not a rewrite. Removing the claim would also orphan CHANGELOG history that already describes it.

**Q: F-08 removes one endpoint and builds UI for five. Why the asymmetry?**
Five endpoints map to real designed UX that just never shipped (stats, share, distractions, click tracking, remedial paths). `/api/audio/sessions` has no user story — its purpose-built siblings (circadian, tmr) cover the audio flows — so keeping it is dead-surface maintenance.

**Q: Why repos for domains that "work fine" inline (F-13)?**
F-14 needs them: MCP/CLI cannot import web handlers. Extracting repos is also the only way to unit-test query logic in `packages/db` where the strong fixtures live. The moves are pure (golden-guarded), so risk is low.

**Q: Will the Playwright CI step (F-18) slow the pipeline much?**
It boots one Next server and drives ~5 pages in headless Chromium — minutes, not tens of minutes. If the shared runner proves flaky, the runbook's fallback is a scheduled run, never silent removal.

**Q: Are the new MCP tools a security concern?**
No new trust boundary: the MCP host already runs with the same local DB access as the CLI. Tools respect the same rules (zod args, one grading path, append-only). Read-only tools (boss_status, cognitive_load_report, audio_schedule) are deliberately observation-only.

**Q: What if migration 027 conflicts with another migration someone adds meanwhile?**
Landing order rule (§6.1): F-06 owns 027; anything else takes 028+. The runner asserts strictly increasing ids, so a conflict fails loudly in tests, not silently on devices.

**Q: Does awardXp change XP amounts?**
No. Amounts are snapshotted from the current per-site constants (golden test); rebalancing, if ever wanted, is a separate explicit commit.

**Q: Why is the two-device sync drill not in the commit plan?**
It's physical (two real devices, real OPFS instances). It stays tracked in `docs/plan-M19-M21.md`; the mock-WebDAV convergence tests + the new sync API e2e (F-17) are the automatable proxies.

**Q: What's deliberately NOT in this plan?**
No new linter rules, no XP rebalance, no API redesigns, no new features beyond Deck Doctor/friction-capture/the dead-endpoint UIs, no CRDT work, no AI video roleplay. §17.5 is the guardrail list.

---

## 26. Post-execution maintenance plan

What keeps the repo healthy after the last commit lands:

| Cadence               | Check                                                                                                                                               | Where                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Every PR (CI)         | typecheck, lint (fetch ban), format, commitlint, unit, e2e, Playwright, check:scripts                                                               | §10.2 pipeline                |
| Every PR (review)     | the AGENTS.md rule-enforcement table's review-only rows (rules 4,5,6,10,11,12,13)                                                                   | AGENTS.md §10.1 table         |
| Monthly               | run `npm run check:scripts` locally against docs claims (table/tool counts)                                                                         | script from commit 4          |
| Quarterly             | re-run the audit scans of §2.1 (TODO markers, dead endpoints via the url-sweep, coverage holes) — 30 minutes, catches drift early                   | this document §2              |
| On any new AI feature | manual mode + surface invariant test updated together (F-09's test enforces)                                                                        | `manual-mode-surface.test.ts` |
| On any new domain     | the parity question is asked at design time ("does this get a repo + MCP/CLI surface or an explicit exclusion?") — the exclusion list lives in F-14 | §15                           |
| On any new table      | repo-or-exception decision recorded in `repos/index.ts` docstring                                                                                   | F-13 pattern                  |

---

## 27. Detailed walkthroughs for the three biggest refactors

### 27.1 F-01 walkthrough — exam grading into mastery-service

Read order: `handlers/curriculum/practice/route.ts` (the sanctioned path) → `handlers/curriculum/exam/route.ts` (the copy) → `packages/core/src/bkt.ts` + `elo.ts` (the math) → `packages/db/src/review-service.ts` (Tx type + transaction shape).

1. Note the exact constants: exam handler's Elo K, practice handler's Elo K, any BKT parameter overrides. If they differ, the service takes `eloK` as a parameter with the practice value as default.
2. Write the golden test driving the exam handler on a seed course; record mastery + elo_events. Do not proceed until it passes against the OLD code.
3. Create the service (sketch §19.1). Keep it db-internal: no handler imports core bkt/elo directly anymore for mastery writes.
4. Flip the exam handler: replace lines 125-175's block with `applySkillResponse(tx, { skillId, correct, atMs, eloK: EXAM_K })` per answered skill, inside the existing `withTransaction`. The response payload the UI sees must be byte-identical — build it from the service's return values.
5. Flip the practice handler the same way; update its rule-7 comment.
6. Run: mastery-golden (old behavior), mastery-service (new unit), curriculum-api (integration). All three green → commit.

Pitfalls seen in similar extractions: (a) forgetting `atMs` propagation — elo_events timestamps shift; golden catches it. (b) `onConflictDoUpdate` target mismatch — `mastery.skillId` is unique (schema.ts:469); confirm the conflict target before writing the upsert. (c) double-elo-insert if the practice handler also inserted events — the service is the only inserter after the flip.

### 27.2 F-03 walkthrough — XP centralization

1. Write xp-golden: a table of the 12 sites with (source string, amount, meta keys). Values come from reading each site — not from memory.
2. Create `repos/xp.ts` (sketch §19.2). Export type `XpSource`.
3. Migrate sites smallest-first (repos first: dialectic:92, social:127 — they're inside `packages/db`, so no cross-package churn), then handlers, then CLI.
4. Per site: replace the insert block with `awardXp(tx, { source: '<key>', meta: { …same shape } })`. If the site computed the amount (multiplier), keep the computation and pass `amountOverride` with the justification comment.
5. Grep gates after each site: no `insert(xpEvents)` left in that file.
6. Run xp-golden + elo-xp-journal + each touched feature's suite.

Pitfalls: (a) sources with implicit amounts derived from streaks/durations — those become `amountOverride` sites with comments, or the golden test documents the derivation; (b) meta shape drift — golden asserts keys, not just amounts; (c) the CLI site runs outside a handler transaction — wrap its write in `withTransaction` as the handler did (verify cli/index.ts:305's surrounding context ⚠︎).

### 27.3 F-13 walkthrough — repo extraction discipline (per batch)

1. Read every handler line that touches the batch's tables. Enumerate the queries: filters, joins, ordering, projections, date math.
2. Any query with hidden `Date.now()` or locale-dependent formatting → parameterize (`atMs`, `tzOffset`) in the repo; the handler passes what it passed before.
3. Write the repo first with the moved queries; add the batch repo test (seed → repo fn → assert rows) — this test is the behavior contract.
4. Flip handlers to the repo; delete inline drizzle.
5. Run: batch repo test + the touched handler suites + relevant e2e. Green → commit the batch.
6. Batch boundary rule: never move two batches in one commit — a regression in B3 must not force re-reviewing B1.

Pitfalls: (a) drizzle `.all()` vs `.get()` semantics across better-sqlite3 sync and wasm-async drivers — the repos must use the driver-neutral helpers `packages/db/src` already provides (⚠︎verify which the existing repos use and mirror them); (b) FTS-backed queries (search) stay in `repos/search.ts` — don't move raw-SQL FTS into typed repos mechanically; (c) backup's whitelist logic references table names — moving queries must not change the whitelist.

---

## Appendix M — finding ↔ commit ↔ test cross-reference

| Finding   | Commits | New tests                                                         | Behavior-preservation guard |
| --------- | ------- | ----------------------------------------------------------------- | --------------------------- |
| F-01      | 5       | mastery-golden, mastery-service                                   | golden unchanged-pass       |
| F-02      | 4       | check:scripts (script part)                                       | worker:deploy dry-run       |
| F-03      | 6       | xp-golden                                                         | golden unchanged-pass       |
| F-04      | 2       | — (script run)                                                    | —                           |
| F-05      | 3       | — (web:tauri build)                                               | zero-import grep            |
| F-06      | 7       | migrations 027, calm-sensory ext, settings round-trip             | settings GET/PUT contract   |
| F-07      | 8       | net-bridge                                                        | full e2e unchanged          |
| F-08      | 9–14    | route-safety non-test-caller extension; handler suites land in P3 | registry tests              |
| F-09      | 15      | manual-mode-surface invariant                                     | —                           |
| F-10      | 16      | extension friction table                                          | pairing flow manual         |
| F-11      | 17      | — (doc walkthrough V-8)                                           | —                           |
| F-12      | 18      | doctor core, decks-doctor handler, UI smoke ext                   | linter behavior untouched   |
| F-13      | 19–27   | 9 batch repo suites                                               | handler + e2e unchanged     |
| F-14      | 28–31   | mcp/cli e2e cases                                                 | rule-7 grep per batch       |
| F-15      | 32      | 7 core suites                                                     | —                           |
| F-16      | 33–34   | ~16 web suites                                                    | —                           |
| F-17      | 35      | 9 e2e files                                                       | —                           |
| F-18      | 36      | — (CI run)                                                        | —                           |
| F-19…F-26 | 37–44   | rules-guard (42), check:scripts doc pins (4/38)                   | —                           |

## Appendix N — execution session log template

One entry per work block, appended to the PR description or a scratch log; keeps multi-session execution auditable.

```
## Session <date>
- Runbook: commit <n> (<finding>)
- Pre-flight result: <ok | blocked because…>
- Files touched: <list>
- Tests run: <commands> → <result>
- Deviations from runbook: <none | what + why>
- Manual checks done: <360px? native? none needed>
- Committed: <hash> <message>
- Open questions for review: <none | …>
```

---

## 28. Master acceptance checklist (per finding)

The consolidated, checkable form of every finding's acceptance criteria — the sign-off sheet for the whole plan. A finding is done when every box under it is checked.

**F-01 — mastery service:** ☐ service exists with rule-7 JSDoc ☐ zero mastery/elo writes outside it (grep gate in commit body) ☐ exam + practice call it inside existing transactions ☐ mastery-golden passes identically before/after ☐ unit suite covers correct/wrong/events/exam-K/no-FSRS.

**F-02 — worker:deploy:** ☐ root script resolves workspace `deploy` ☐ `check:scripts` wired into `check` and green ☐ doc-count pins active or explicitly deferred with a script-header TODO.

**F-03 — awardXp:** ☐ `repos/xp.ts` insert-only ☐ 12 sites migrated, grep-clean ☐ xp-golden proves identical amounts/shapes ☐ override sites carry justification comments.

**F-04 — lint script:** ☐ workspace lint exits 0.

**F-05 — plugin-updater:** ☐ dependency removed, lockfile synced ☐ `web:tauri` builds ☐ native.md note present, zero code references.

**F-06 — haptics:** ☐ migration 027 registered, fresh+upgraded DBs verified ☐ toggle persists with zod validation and round-trip test ☐ disabled = zero vibration everywhere (unit-asserted) ☐ exam-sim + voice-tutor emit cues ☐ 360px recorded.

**F-07 — net bridge:** ☐ `remoteFetch` port, injected per target, handlers exclusive ☐ web e2e unchanged ☐ hub routing test green ☐ V-2 executed or honestly unverified.

**F-08 — dead endpoints:** ☐ five UI surfaces shipped with manual checks ☐ `/api/audio/sessions` fully removed ☐ url-sweep reports zero callerless endpoints (minus documented aliases).

**F-09 — manual modes:** ☐ both surfaces render on needsSetup/provider-none ☐ invariant test green and regression-sensitive.

**F-10 — friction capture:** ☐ decision function tested (≥6 cases) ☐ events reach `friction_events` with trigger `extension` ☐ extension passive.

**F-11 — worker docs:** ☐ guide complete, indexed, follow-the-doc pass done (V-8).

**F-12 — Deck Doctor:** ☐ core module + tests (deterministic score) ☐ handler atomic POST proven ☐ registry/shim ☐ UI sheet with confirm-on-delete, suspend default ☐ 360px ☐ README claim true + CHANGELOG.

**F-13 — repos:** ☐ B1–B9 landed one commit each with per-batch tests ☐ zero-repo count at deliberate set ☐ handler/e2e unchanged per batch.

**F-14 — MCP/CLI parity:** ☐ C1–C4 landed, every domain reachable or documented-excluded ☐ happy + rejection e2e per tool/command ☐ rule-7 grep clean per batch ☐ doc counts final.

**F-15 — core suites:** ☐ 7 suites at §14.9 minimums, green.

**F-16 — handler suites:** ☐ zero-coverage list empty (risk-ranked first) ☐ backup round-trip property test green.

**F-17 — e2e:** ☐ 9 flow files green ☐ TEST_INFRA lists them.

**F-18 — Playwright CI:** ☐ step green, artifacts on failure.

**F-19 — README roadmap:** ☐ truthful.

**F-20 — doc sync:** ☐ maps/counts synced ☐ drift check green.

**F-21 — learning-science:** ☐ contradictions resolved.

**F-22 — plan-M19-M21:** ☐ reconciled.

**F-23 — env:** ☐ `.env.example` complete.

**F-24 — CI/lint:** ☐ commitlint + prettier + fetch ban active ☐ rules-guard green.

**F-25 — scripts:** ☐ build:packages complete ☐ scripts archived.

**F-26 — TEST_INFRA/AGENTS:** ☐ refreshed ☐ nav exception documented.

**Final:** ☐ §12 checklist complete ☐ honest verified/unverified report written.

---

## 29. Commit message catalog (commitlint-ready)

Ready-to-use messages; bodies carry the _why_ for reviewers.

```text
1  docs: add master fix plan from full project audit

   Three-audit sweep (unfinished work, feature surface, infra) produced
   26 findings with per-finding specs, runbooks, and tests. This doc is
   the execution blueprint for the P0-P4 phases that follow.

2  chore(web): replace dead next lint script with eslint

   next lint was removed in Next 16; the workspace script always failed.
   Root `eslint .` was unaffected. Fix keeps workspace parity.

3  chore(native): remove unwired plugin-updater dependency

   The dep has zero imports, no Cargo plugin, no capability, no conf:
   an auto-update feature that was never wired. Deferred properly in
   docs/native.md; the dep shipped in the bundle for nothing.

4  fix(root): repair worker:deploy script wiring

   `npm run worker:deploy -w … --if-present` exited 0 because the
   workspace defines `deploy`, not `worker:deploy` — so the only real
   deploy path (the || fallback) never ran. Silent no-op → fixed name,
   plus a script-drift check so the class of bug fails CI.

5  fix(db): route exam grading through a shared mastery service

   Exam submit wrote mastery + elo_events by hand — the exact write
   rule 7 forbids — duplicating the practice path's math. Extracted
   applySkillResponse; both paths call it; golden tests prove the
   behavior (incl. exam K-factor) is unchanged.

6  feat(db): centralize XP awarding in awardXp service

   XP amounts were re-derived at 12 call sites (rule 7's letter
   violated; rule 8 intact). awardXp is the canonical insert-only path;
   golden tests pin every source/amount so the economy is unchanged.

7  feat(sensory): persist haptics setting and wire exam-sim and voice-tutor

   Haptics shipped always-on with no setting and one consumer. Migration
   027 adds user_settings.haptics_enabled (default on, opt-out);
   exam-sim and voice-tutor now emit the same cues review does.

8  fix(native): bridge handler outbound fetches through the hub net port

   Online/social handlers fetched remote servers as webview fetch —
   CORS-dependent on native where only AI traffic was bridged.
   remoteFetch port routes them through the native HTTP bridge; web
   behavior unchanged (pass-through).

9  feat(web): surface review stats panel

   /api/review/stats existed with no UI. Per-deck today/7d/30d activity
   + lapse rates now render on analytics.

10 feat(web): deck share-string export

   /api/share/export existed; Online could import but nothing exported.
   Deck-row action copies the share string, mirroring the import hint.

11 feat(web): distraction log on focus page

   /api/distractions CRUD was unreachable. Focus page gains the app log
   that feeds the friction gate.

12 fix(reminders): report notification clicks

   /api/reminders/click had no caller — sw.js never reported engagement.
   Fire-and-forget POST on notification open; never blocks navigation.

13 refactor(web): remove unconsumed audio sessions route

   /api/audio/sessions had no UI consumer (circadian/tmr routes cover
   audio). Removed handler+shim+registry entry; table stays (repos use it).

14 feat(web): remedial path suggestions on graph page

   /api/curriculum/graph/remedial computed remedial chains nobody could
   see. Graph page weak-skill inspector now offers the path.

15 feat(ai): surface manual modes for tutor summary and natural-language search

   Rule 9: manual modes existed in core for these two features but were
   never rendered. Wired into tutor/search needsSetup paths; a new
   invariant test fails if any manual mode goes unsurfaced again.

16 feat(extension): friction capture during focus sessions

   M21's last open item. The extension records real browser leaks
   during focus-max sessions into the same friction_events table,
   silently (no popups).

17 docs(worker): self-hosting guide for the rooms/raids worker

   plan-M19-M21 promised it; nothing existed. Bindings, deploy, config,
   limits — every claim traced to source.

18 feat(decks): Deck Doctor — linter-driven deck health with one-click fixes

   README/CHANGELOG promised it; nothing existed. diagnoseDeck wraps
   lintDeck findings into fix actions (suspend default for leeches,
   delete with confirm, rename, manual hints); handler applies them in
   one transaction; decks page gets the sheet. Score formula documented
   and golden-tested.

19-27 refactor(db): extract <notes/journal|habits/commitments|reading|
       goals/quests|quotes|physio/canvas|images/sync|focus-extras|mnemonic>
       repos

   Pure moves: web handlers query drizzle inline for 33 tables, which
   is why 13 domains had no MCP/CLI surface. Repos share queries and
   make them unit-testable; golden-guarded per batch.

28 feat(mcp,cli): habits, journal, physio parity
29 feat(mcp,cli): reading, study-plan, gkt parity
30 feat(mcp,cli): dialectic, spatial, world, guilds parity
31 feat(mcp,cli): audio, cognitive-load, boss status parity

   Agents/terminals could not touch 13 domains. Each batch adds the
   domain's tools (zod args, house-style descriptions) + CLI commands
   reusing the F-13 repos. Read-only where the domain is realtime/web.

32 test(core): dedicated suites for habits, media, quotes, reading, bkt, pedagogy

   These pure-logic modules had zero/indirect coverage. Table-driven
   suites per module; any real bug a case caught was fixed in its own
   commit referencing the test.

33 test(web): handler suites for the risk-ranked uncovered routes

   backup/sync/fsrs-optimize/import-export/push/workload had ZERO
   coverage anywhere. Includes the backup export→wipe→restore
   row-set-equality property test.

34 test(web): handler smoke+contract suites for remaining folders

   Completes the zero-coverage list from the audit.

35 test(e2e): cover backup roundtrip, sync API, apkg, world, dialectic,
   workload, palace3d, images, ai-streaming

   Cross-feature flows the unit layer cannot see.

36 ci: run the Playwright UI smoke suite

   The only real-browser suite existed but never ran in CI. Now gates
   PRs; artifacts upload on failure.

37 docs(readme): refresh deferred roadmap to reality

   3 of 6 "deferred" items shipped months ago; the two real deferrals
   get honest rationale.

38 docs: sync architecture maps and engine counts with the code

   Maps omitted apps/worker + apps/extension; MCP "14 tools" → real
   count; "45 tables" → 92; optimizer note stale; README provider
   table missing google. check:scripts pins the volatile numbers.

39 docs(learning-science): reconcile leaderboard principle and milestone numbering

   "No leaderboards" contradicted the shipped opt-in cohort system;
   legend numbering pointed at defunct milestones.

40 docs(plan): mark shipped M20/M21 items and link the master fix plan

   The active tracker listed shipped work as future; the genuinely
   open items stay open.

41 docs(env): document web-push VAPID keys and build-target selectors

   Self-hosters discovered push env vars by crash.

42 ci: enforce commitlint, prettier, and the raw-fetch ban

   Commit titles/format only validated by local hooks; rule 1 (the
   native-breaking mistake) had no enforcement. Adds CI steps, a scoped
   eslint rule with an actionable message, and the rules-guard test
   pinning rule 7/8 structurally.

43 chore(scripts): complete build:packages and archive one-off utilities

   build:packages skipped ai-adapters; four scripts were referenced
   nowhere → scripts/archive/ with a README.

44 docs: refresh TEST_INFRA and document the course sub-page nav exception

   TEST_INFRA missed curriculum-agents + Playwright; AGENTS.md's nav
   rule criminalized a deliberate detail-page pattern.
```

---

## 30. Review guide (for the human reviewing the P0–P4 PRs)

What to actually look at, per phase — the things static checks cannot judge:

**P0 (commits 2–6):**

- The golden tests: confirm they were written BEFORE the refactor (commit order in history) and their values were captured from real behavior, not invented.
- mastery-service: read it as a reviewer of rule 7 — is it now structurally impossible to write mastery outside it?
- awardXp: check two call sites at random against their old code — same source key? same amount? meta shape preserved?

**P1 (commits 7–17):**

- Migration 027: additive only; schema.ts and the migration agree; no renumbering anywhere.
- net.ts: confirm the port pattern (no static platform imports in handlers — ESLint would catch, but read the injection site).
- sw.js change: confirm the POST cannot delay or fail navigation.
- The five UI surfaces: one primary action each? honest empty states? 360px?

**P2 (commits 18–31):**

- Deck Doctor POST: transaction covers ALL actions; an unknown card mid-list rolls back everything.
- Repo batches: pick any batch — `git show` the handler diff and confirm zero semantic change in the queries.
- MCP tools: descriptions follow the house style; read-only tools never import write paths.

**P3 (commits 32–36):**

- The backup round-trip test: is the row-set comparison across the full drizzle whitelist (not a cherry-picked subset)?
- Playwright step: artifacts configured on failure (otherwise flakes are undiagnosable).

**P4 (commits 37–44):**

- AGENTS.md enforcement table: is it honest (does NOT claim enforcement that doesn't exist)?
- The fetch-ban eslint rule's file globs: UI only — src/lib, src/server, src/hub untouched.

Standing review questions (any phase):

1. Does any commit weaken a test? (rule 13 — the answer must be no, or the body explains why the test was wrong.)
2. Is every new export JSDoc'd?
3. Does any commit mix two findings?

---

## 31. Definition of done, with metrics

Measurable end-state, beyond the checkboxes:

| Metric                                                    | Before (audit)   | After (target)                                          |
| --------------------------------------------------------- | ---------------- | ------------------------------------------------------- |
| TODO/FIXME in shipping code                               | 0                | 0                                                       |
| Rule-7 mastery/Elo write sites outside the canonical path | 1 (exam)         | 0 (guard-tested)                                        |
| XP insert sites outside the canonical path                | 12+              | 0 (guard-tested)                                        |
| Registry keys with a UI caller                            | 137/143          | 143/143 (minus documented aliases/headless)             |
| AI features with surfaced manual modes                    | 12/14            | 14/14 (invariant-tested)                                |
| Tables without any repo API                               | 33/92            | 2 (schema_migrations, grading internals — documented)   |
| Domains reachable from MCP+CLI                            | 9                | 22 (13 new + documented exclusions for realtime/visual) |
| Core modules with zero unit tests                         | 4 + bkt indirect | 0                                                       |
| Handler folders with zero coverage                        | ~30              | 0                                                       |
| E2E flow files                                            | 12               | 21                                                      |
| Playwright in CI                                          | no               | yes                                                     |
| AGENTS.md rules with automated enforcement                | 4 of 13          | 8 of 13 (remainder honestly tabulated)                  |
| Stale doc claims (maps/counts/roadmaps)                   | 8                | 0 (drift-checked)                                       |
| `.env.example` coverage of user-facing vars               | 4/9              | 9/9                                                     |
| README-promised features missing from code                | 1 (Deck Doctor)  | 0                                                       |

---

## 32. Execution schedule (day-by-day)

A realistic calendar for one implementer working full-time. Each day ends with the named gate. Days are indicative — the binding contract is the per-commit gates (§6.2), not the calendar.

| Day | Commits    | Focus                                                              | Gate at end of day                                 |
| --- | ---------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| 1   | 1, 2, 3, 4 | plan doc; trivial P0s; script-drift checker                        | `check:scripts` green; web:tauri builds            |
| 2   | 5          | mastery service (snapshot AM, extract PM)                          | golden + unit + curriculum suites green            |
| 3   | 6          | XP centralization (12 sites)                                       | xp-golden green; grep gates clean                  |
| 4   | 7          | haptics (migration, settings, wiring)                              | migration tests + settings round-trip; 360px noted |
| 5   | 8          | net bridge port + hub routing + 5 handlers                         | full e2e unchanged; net-bridge tests               |
| 6   | 9, 10, 11  | three small UI surfaces (stats, share, distractions)               | route-safety; 360px each                           |
| 7   | 12, 13, 14 | sw click, audio-sessions removal, remedial path                    | registry tests green post-removal                  |
| 8   | 15, 16     | manual modes + extension friction capture                          | invariant test; extension tests                    |
| 9   | 17, 18     | worker docs; Deck Doctor core+handler                              | doc walkthrough noted; doctor tests                |
| 10  | 18 (cont.) | Deck Doctor UI sheet + polish                                      | 360px; CHANGELOG/README claims true                |
| 11  | 19–21      | repo batches B1–B3                                                 | per-batch suites + handler suites unchanged        |
| 12  | 22–24      | repo batches B4–B6                                                 | ditto                                              |
| 13  | 25–27      | repo batches B7–B9                                                 | ditto; zero-repo count at target                   |
| 14  | 28, 29     | MCP/CLI parity C1 + C2                                             | tool/command e2e green                             |
| 15  | 30, 31     | parity C3 + C4; ENGINE-REFERENCE counts                            | parity complete; counts final                      |
| 16  | 32         | core test suites (7 files)                                         | core suites green                                  |
| 17  | 33         | risk-ranked handler suites (backup/sync/fsrs/import/push/workload) | round-trip property test green                     |
| 18  | 34, 35     | remaining smoke suites + 9 e2e flows                               | full web + e2e green                               |
| 19  | 36         | Playwright CI step                                                 | CI green incl. Playwright                          |
| 20  | 37–40      | doc corrections (README, maps, learning-science, plan)             | drift check green                                  |
| 21  | 41–44      | env docs, CI enforcement, scripts archive, TEST_INFRA              | full §12 checklist; honest report                  |

Contingency rules:

- A day that misses its gate does **not** roll into the next day's commits — the next day starts with finishing the open gate (§17.3 failure handling).
- If Deck Doctor's UI exceeds day 10, commits 11+ are unaffected (independent) — reorder freely within a phase, never across the migration boundary (commit 7 owns 027 first).
- P3 days (16–18) are the most compressible if the handler smoke suites go smoothly — the six risk-ranked suites (day 17) are the immovable core.

Parallelization notes (if two implementers/agents work simultaneously):

- Streams are safe to parallelize at the phase level; within a phase, commits touch disjoint files EXCEPT `handlers-registry.ts` (commits 13, 18) and root `package.json` (4, 43) — coordinate those two files.
- The P3 test stream (16–18) can start on day 11 alongside P2 repos: different trees, same gate discipline, separate commits.

---

## 33. Alternatives considered and rejected

Recording the rejected options so reviewers don't re-litigate them without new information:

**F-01 — mastery service.**

- _Rejected: document the exam handler as an allowed exception._ An exception normalizes a second copy of grading math; the next contributor copies the exception, not the rule. The service is ~40 lines and golden-guarded.
- _Rejected: make exam submit call `executeReview`._ Exams must not touch FSRS/revlog (an exam answer is not a card review — scheduling 200 cards from one exam would corrupt the FSRS state). The narrower service is the correct scope.

**F-03 — XP centralization.**

- _Rejected: leave duplication, add a grep guard only._ The guard fails on the current tree — you'd have to fix the sites anyway. Centralizing is barely more work than moving each site to a shared constant, and gives one audit point for the economy.
- _Rejected: XP service with side effects (streak updates, quest progress)._ Out of scope — the plan changes _where_ the insert happens, not the XP feature's behavior. Side-effect coupling would be a redesign.

**F-05 — plugin-updater.**

- _Rejected: wire the updater now._ It requires release signing (documented as not configured in docs/native.md), an update server/pubkey, and a distribution decision — a feature, not a cleanup. Removing the dead dep is honest; the feature gets planned properly if wanted.

**F-06 — haptics setting.**

- _Rejected: localStorage instead of user_settings._ Breaks the settings round-trip pattern, doesn't sync via backup, and creates a second settings store — the repo already has one canonical place.
- _Rejected: default off._ Calm-by-default cuts both ways: the sensory wave shipped it on; flipping the default silently changes existing users' experience. Keep shipped behavior, add the opt-out.

**F-07 — net bridge.**

- _Rejected: add CORS headers to the remote workers._ The remotes include user-registered third-party/self-hosted servers — you can't fix CORS you don't control. The bridge is the only robust path.
- _Rejected: per-handler injected fetches only (no hub protocol change)._ Same result, more plumbing — the protocol route is one place, the port is the seam handlers already use (storage.ts pattern).

**F-08 — dead endpoints.**

- _Rejected: delete all six._ Five map to designed UX the backend already implements correctly; deleting working features to reduce surface is the wrong trade. Only `/api/audio/sessions` has no story.
- _Rejected: keep them and add a "headless endpoints" allowlist to the url-sweep._ That's how dead surface accumulates. The sweep should stay strict; exceptions should be rare and named.

**F-12 — Deck Doctor.**

- _Rejected: remove the README claim._ Decision taken with the user (2026-11-08): build. The engine exists; the delta is surfacing + fix actions.
- _Rejected: auto-fix without confirmation._ Destructive card deletion without a confirm violates the calm/no-dark-patterns principle; the confirm costs one click.

**F-13 — repo extraction.**

- _Rejected: skip it; write MCP tools that duplicate the queries._ Worse than the status quo: three copies of the same queries. Repos first is the dependency-correct order (§6.1).
- _Rejected: extract all 33 tables in one commit._ Unreviewable. Batch-per-commit keeps each diff small and bisectable.

**F-14 — MCP/CLI parity.**

- _Rejected: expose every web operation as tools (100+ tools)._ Tool sprawl degrades agent performance and most web surfaces are visual/interactive. The verb-minimal surface (§15) matches how the existing 27 tools were designed.
- _Rejected: skip parity; agents can use the HTTP server._ The headless server covers 8 routes only, and MCP is the repo's stated agent contract (ARCHITECTURE.md).

**F-18 — Playwright in CI.**

- _Rejected: rewrite the smoke suite as e2e API tests._ The suite's value is precisely that it runs a real browser (hydration, nav, real rendering). API coverage exists; browser coverage was the gap.

**F-24 — enforcement.**

- _Rejected: eslint rule banning raw fetch everywhere including lib/server._ Handlers and transport legitimately construct Requests/fetches server-side. The ban is scoped to UI globs where rule 1 applies.
- _Rejected: custom AST lint rules for rules 5/6._ High false-positive risk for marginal benefit; those rules stay review-enforced with the honest table (§10.1), plus structural guards where they're real (7/8).

---

## 34. Traceability — findings to AGENTS.md rules

Every finding justified against the operating manual (or explicitly against product honesty):

| Finding              | AGENTS.md rule(s) engaged                             | Nature                                                |
| -------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| F-01                 | Rule 7 (one grading path)                             | violation → fixed structurally                        |
| F-03                 | Rules 7, 8 (grading path; append-only)                | letter-violation → centralized, insert-only preserved |
| F-06                 | Rule 4 (schema+migration), §5 UI (calm defaults)      | new migration + UI                                    |
| F-07                 | Rule 1 (spirit: native-safe networking)               | native asymmetry → bridged                            |
| F-08                 | §5 UI (honest empty states), rule 3 hygiene           | dead surface → surfaced or removed                    |
| F-09                 | Rule 9 (manual modes)                                 | invariant strengthened to UI level                    |
| F-10                 | plan contract (M21)                                   | plan item completed                                   |
| F-12                 | §4.3 ("code wins — then fix this file"); docs honesty | promised feature → built                              |
| F-13                 | §5 DB recipe (repos for reusable queries)             | architecture alignment                                |
| F-14                 | §1 table (agents are a first-class host)              | parity restored                                       |
| F-15–F-18            | §4.5 (tests for everything), §6 gates                 | coverage debt                                         |
| F-19–F-26            | §4.6 (docs as you go), rule 13 (don't weaken tests)   | docs/CI truth                                         |
| (process) sync drill | plan-M19-M21 tracking                                 | physical, out of code scope                           |

Findings with **no** rule engaged (pure hygiene): F-02 (script wiring), F-04 (dead script), F-05 (dead dep), F-25 (script archive) — justified by operational honesty rather than the manual.

## 35. Severity model (how P0–P4 and High/Medium/Low were assigned)

- **Phase P0** = the change affects correctness of stored data, deployment, or a hard rule — i.e., leaving it produces wrong behavior or silent failure. (F-01 mastery math duplication; F-02 deploy no-op; F-03 economy drift risk; F-04/F-05 are included because they're one-line fixes riding the same phase.)
- **P1** = a user-visible feature is half-reachable (exists in one layer, missing in its pair).
- **P2** = a whole feature or host surface is missing relative to a written promise or the architecture's own standard.
- **P3** = verification debt (tests), ranked by the risk of the uncovered code.
- **P4** = truth debt (docs/config) — cheap fixes that prevent future misdirection.
- **Severity within a phase** scales with blast radius: High = wrong data or broken promise visible to users (F-01, F-02, F-12, F-16); Medium = feature gaps and asymmetries; Low = hygiene.

The ordering principle is: **stop the bleeding (P0), finish what's started (P1), keep promises (P2), prove it (P3), tell the truth (P4).**

## 36. Knowledge-transfer notes (for whoever continues this work)

1. **The registry is the contract.** Any new route: handler → shim → `add()` → (UI caller). The tests fail loudly otherwise; trust them and read their failure messages before manually grepping.
2. **Golden tests are the safety net for refactors.** The pattern (write expectations from current behavior, refactor, expect identical) is used three times in this plan (F-01, F-03, F-13) and is the repo's reusable tool for any future behavior-preserving change.
3. **The hub worker runs the same handlers as web.** Never assume a handler is "web-only"; conversely, never add static node imports to handlers — the ESLint rule and the wasm driver shims exist for that.
4. **Append-only means append-only.** If you're about to UPDATE or DELETE `revlog`/`xp_events`/`friction_events`/`elo_events`, you're about to break the audit trail — tombstones and inserts are the tools (see `revlog_undos`, `awardXp`).
5. **Time is a parameter.** Repos and core functions take `atMs`/dates; only the edge (handlers, CLI entry) knows "now". This is what makes the golden tests and e2e deterministic.
6. **Manual modes are user-facing, not just handler fallbacks.** The invariant test (F-09) now enforces it — when adding an AI feature, wire `useManualMode` or TransportPanel in the same commit.
7. **When docs and code disagree, fix both the same day** — the drift check (§10.4) catches the numeric claims; prose honesty is a review habit.

---

## Appendix U — linter rule reference (Deck Doctor inputs)

The implemented rules in `packages/core/src/linter.ts` (verified ids at audit; severities as coded — ⚠︎verify the exact severity strings per rule when wiring the doctor's weight map):

| Rule id                  | Checks                                                    | Severity   | Doctor mapping                                                             |
| ------------------------ | --------------------------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `W1-minimum-information` | card front asks more than one question (`countQuestions`) | error      | manual — "split into minimum-information pieces" (linter's own suggestion) |
| `W2-avoid-sets`          | answer is an enumeration (≥3 items)                       | warn       | manual — "split per item or convert to overlapping cloze"                  |
| `W3-answer-length`       | answer > 8 words                                          | warn       | manual — trim/segment guidance                                             |
| `W6-interference`        | near-duplicate of a sibling card (similarity)             | warn       | mechanical — suspend the later card (safe default)                         |
| `W9-source-missing`      | card lacks its source attribution                         | (per code) | manual — add source hint                                                   |
| `W10-imagery`            | answer lacks concrete/visual anchoring                    | (per code) | manual — imagery guidance                                                  |
| `W11-cloze-suggestion`   | content would work better as cloze                        | (per code) | mechanical-intent — regenerate-cloze (cloze pipeline)                      |
| `W14-context-cue`        | missing context cue in the question                       | (per code) | manual — add context guidance                                              |
| `W18-date-stamp`         | card embeds a date stamp                                  | (per code) | manual — strip-stamp guidance                                              |
| `W19-priority-stamp`     | card embeds a priority stamp                              | (per code) | manual — strip-stamp guidance                                              |
| _(FSRS signal)_ leeches  | `leechCandidates` from core/fsrs — high lapse counts      | derived    | mechanical — suspend (safe default), delete with confirm                   |

Deck Doctor's health score weights map severity → weight (§19.4); the mapping is golden-tested so weight changes are explicit commits.

## Appendix V — transport seams reference (rule 1's toolkit)

`apps/web/src/lib/transport.ts` (verified at audit):

| Seam                          | Line | Behavior                                                        | Use for                |
| ----------------------------- | ---- | --------------------------------------------------------------- | ---------------------- |
| `apiGet(url, opts?)`          | :426 | query-builder + JSON, error envelope via `throwForStatus` (:77) | reads                  |
| `apiSend(url, body, method?)` | :451 | POST/PUT/PATCH/DELETE whitelist, JSON body                      | writes                 |
| `apiUpload(url, form)`        | :486 | multipart serialization + transferred bytes                     | images/files           |
| `apiStream(url, body)`        | :504 | text stream + `x-session-id`                                    | AI chat streams        |
| `apiDownload(url)`            | :555 | bytes → `<a download>` or Tauri save dialog + fs.writeFile      | exports/backups        |
| `hubFetch(url, init)`         | :597 | raw Response escape hatch (both targets)                        | rare binary/edge needs |

Dual-transport selection via `usesHubWorker` (:40, `NEXT_PUBLIC_LEARNING_HUB_TARGET`); worker singleton has failure poisoning (:215-226) and pagehide dispose (:412-418). UI code uses ONLY these — the eslint ban (F-24) makes that mechanical.

## Appendix W — plugin system reference (context for parity work)

Five first-party plugins ship in `plugins/` (verified). Extension points (`packages/core/src/plugin.ts:93-99`): `ctx.mcpTools`, `ctx.cliCommands`, `ctx.paletteActions`, `ctx.dashboardWidgets`. The `anki-bridge` plugin owns the Anki connect surface (which is why `handlers/anki/connect` has no dedicated repo — plugin-owned). New MCP/CLI parity tools (F-14) are core-host registrations (not plugins) because they're part of the product surface, not extensions; the plugin points remain for third parties, and `plugins/contributions` aggregates what's registered (test: §16).

## Appendix X — current CLI command reference (the 13, parity baseline)

`apps/cli/src/index.ts:557-623` (names verified; subcommand details ⚠︎verify at implementation):

capture · today · stats · review · focus · quote · search · fsrs · starter · sync · curriculum · workload · exposure

Style contract for the F-14 additions: line-oriented output, `--json` flag where it helps agents, exit codes 0/1/2 (ok/usage/error), no TTY assumptions, color only when isatty. Each new command lands with an e2e case in `tests/e2e/tier1-features/cli-commands.test.ts`.

---

## 37. Post-plan backlog (explicitly deferred, with reasons)

Items discovered during the audit that this plan deliberately does NOT execute. They live here so the next planning cycle starts from truth:

| Item                                                                           | Why deferred                                                                                                         | Trigger to reconsider                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| AI video-call roleplay (README deferral)                                       | synchronous video = hosting cost + complexity; voice tutor covers the pedagogy offline-capable                       | a concrete pedagogy gap the voice tutor cannot fill                                         |
| Full CRDT sync                                                                 | LWW sync v1 + tombstones shipped; CRDT merge is a protocol change needing conflict evidence                          | real multi-device concurrent-edit bug reports                                               |
| Tauri auto-updater (F-05's real feature)                                       | requires release signing (not configured) + update server + key ceremony                                             | release signing configured; then: Cargo plugin → capability → conf → UI (checklist in F-05) |
| Deck Doctor v2: cross-deck doctoring, scheduled doctoring, custom rule weights | v1 must prove the per-deck loop first                                                                                | v1 usage signals (doctor runs per deck)                                                     |
| FSRS optimizer "forecast preview" nuance (plan-M19-M21 M20)                    | the optimizer + settings UI ship; the _preview_ of predicted retention before applying weights is a graph feature    | requested by users during optimizer use                                                     |
| Linter rules W4, W5, W7, W8, W12, W13, W15, W16, W17                           | the 20-Rules set is partially implemented (10 of 19 ids); each remaining rule needs its detection heuristic designed | per-rule: when card corpus evidence shows the failure mode                                  |
| Extension: full friction _analytics_ view                                      | F-10 lands capture only; analytics live in the focus page friction section                                           | capture data accumulates                                                                    |
| MCP/CLI: canvas, mindmap, palace-3D _authoring_                                | visual authoring tools don't map to text tools                                                                       | a text-first authoring protocol emerges                                                     |
| Worker: multi-region deploy, WS scaling                                        | self-hosting doc (F-11) first; scale when concurrency demands                                                        | raid/room concurrency numbers                                                               |
| Onboarding flow for MCP/CLI hosts                                              | parity first; onboarding for terminal users after                                                                    | CLI-only user feedback                                                                      |
| Real-device sync drill                                                         | physical; tracked in plan-M19-M21                                                                                    | the drill itself (§6.2 note)                                                                |
| Doc-drift test system beyond the pinned counts (full prose validation)         | the count pins cover the rotting numbers; prose drift is review-caught                                               | a second Deck-Doctor-class doc incident                                                     |

## 38. How to re-run the audits (repeatable sweep)

The audit is a set of mechanical sweeps + manual cross-checks. To re-run after this plan lands (or quarterly, §26):

```bash
# 1. Unfinished-work markers (expect: scaffolder TODOs + Tauri gen file only)
git grep -n -i -E "TODO|FIXME|XXX|HACK" -- ':!package-lock.json'
git grep -n -i -E "not implemented|notimplemented|unimplemented"
git grep -n -E "@ts-ignore|@ts-expect-error|eslint-disable|as any\b"
git grep -n -E "\.skip\(|\.only\(|it\.todo|test\.todo"

# 2. Dead endpoints — registered keys with no UI caller (the F-08 sweep)
#    Extract transport-call URLs from apps/web/{app,src} and diff against
#    the add('…') keys in apps/web/src/hub/handlers-registry.ts
git grep -n "apiGet(\|apiSend(\|apiUpload(\|apiStream(\|apiDownload(" apps/web/app apps/web/src \
  -- ':!apps/web/src/lib' ':!apps/web/src/server' ':!apps/web/src/hub'
git grep -n "add('" apps/web/src/hub/handlers-registry.ts

# 3. Rule 7 / rule 8 structural sweeps (what rules-guard.test.ts automates)
git grep -n "db.update(mastery)\|db.insert(eloEvents)" apps/ packages/db/src
git grep -n -i "update\|delete" packages/db/src -- '*revlog*' '*xp*' '*friction*' '*elo*'

# 4. Raw fetch in UI (what the eslint ban automates)
git grep -n "fetch(" apps/web/app apps/web/src/components apps/web/src/ui apps/web/src/platform

# 5. Coverage holes — test file ↔ source mapping
git ls-files "*.test.ts" "*.test.tsx" | sort
git ls-files "apps/web/src/server/handlers/**/route.ts" | sort

# 6. Doc-count pins (what check:scripts automates)
grep -c "= table(" packages/db/src/schema.ts          # vs ENGINE-REFERENCE claim
grep -c "add('" apps/web/src/hub/handlers-registry.ts # route count
grep -rn "tools" ARCHITECTURE.md README.md            # MCP tool claims

# 7. Script drift (what check:scripts automates)
npm run check:scripts
```

The manual cross-checks that can't be scripted (and took most of the audit time): page→endpoint URL extraction, AI feature matrix verification, docs-promise verification, native capability review, CI/PR-template comparison. Appendix Q is the artifact of those checks; a re-run produces the same shape of evidence.

## 39. Branch timeline (context for reviewers)

The 54 commits of `feat/cognitive-expansion`, grouped (from `git log --oneline -40` + diff stat 247 files, +20,720/−1,406):

| Wave                       | Theme                                                                                                              | Representative commits            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Cognitive power expansion  | workload balancer, exposure ledger, BKT pretesting, Brier/calibration analytics, weakness radar v2, exam simulator | the wave's feat() commits         |
| Voice + audio              | Whisper STT client, voice tutor, circadian commute, TMR sleep cues                                                 | feat(sensory)/feat(audio) commits |
| Social + spaces            | dialectic arena, palace-3d, multimodal ingest, GKT cognitive load                                                  | feat(...) commits                 |
| Sensory                    | E-Ink Zen mode, haptics, review cognitive telemetry + their docs                                                   | `c89e61e`, `99aca25`              |
| MCP/CLI + extension parity | cognitive tools, context-menu capture                                                                              | feat(mcp)/feat(extension) commits |
| Hardening tail             | DAG prerequisite graph fix, honest inbox, sync determinism, elo/XP/journal edge hardening, lint `any` elimination  | fix(...)/refactor(lint) commits   |

The hardening tail is why the marker scans came back so clean: the branch was already audited by its own author for `any`/lint issues. What remained for THIS audit was exactly the structural layer the tail couldn't see — rule-7 duplication, host parity, coverage, and docs truth.

## 40. Audit artifact index (where every audit output lives in this document)

| Audit output                                        | Reproduced in                     |
| --------------------------------------------------- | --------------------------------- |
| Unfinished-work marker scans (7 sweeps)             | §2.1, Appendix A, Appendix P      |
| Branch/git analysis                                 | §3.9, §39                         |
| Roadmap-doc reconciliation                          | §F-19/F-22 specs, Appendix Q      |
| Pages↔endpoints cross-check (43 pages)              | Appendix B, Appendix T            |
| AI feature matrix (14 + voice)                      | Appendix C                        |
| Exercise type matrix (12)                           | Appendix D                        |
| Domain↔repo↔host matrix                             | Appendix E, F-13/F-14 specs       |
| Schema inventory (92 tables)                        | Appendix G, Appendix R            |
| Migration registry (26)                             | Appendix H                        |
| Handler inventory (143)                             | Appendix I                        |
| Rule-7/8 bypass hunt                                | F-01/F-03 specs, §27 walkthroughs |
| Test inventory + gap list (128 files)               | Appendix K, F-15/F-16/F-17        |
| Native audit (capabilities/commands/bridge/sensory) | F-05/F-06/F-07 specs, §1          |
| Transport/ESLint/CI audit                           | Appendix V, F-24, §10             |
| Env audit                                           | Appendix F, F-23                  |
| Scripts audit                                       | F-02/F-25, Appendix Q             |
| Doc-drift line-by-line                              | Appendix L                        |
| MCP/CLI/server inventories                          | Appendix J, Appendix X            |

---

## 41. Runbook index (commit → runbook)

Quick navigation: each commit number maps to its runbook subsection in §13 (runbooks share numbers with §6.2).

| Commit | Runbook anchor           | Commit | Runbook anchor              |
| ------ | ------------------------ | ------ | --------------------------- |
| 1      | §13 "commit 1"           | 24     | §13 "commits 19–27" (B6)    |
| 2      | §13 "commit 2"           | 25     | §13 "commits 19–27" (B7)    |
| 3      | §13 "commit 3"           | 26     | §13 "commits 19–27" (B8)    |
| 4      | §13 "commit 4"           | 27     | §13 "commits 19–27" (B9)    |
| 5      | §13 "commit 5"           | 28     | §13 "commits 28–31" (C1)    |
| 6      | §13 "commit 6"           | 29     | §13 "commits 28–31" (C2)    |
| 7      | §13 "commit 7"           | 30     | §13 "commits 28–31" (C3)    |
| 8      | §13 "commit 8"           | 31     | §13 "commits 28–31" (C4)    |
| 9      | §13 "commit 9"           | 32     | §13 "commit 32"             |
| 10     | §13 "commit 10"          | 33     | §13 "commits 33–34" (risk)  |
| 11     | §13 "commit 11"          | 34     | §13 "commits 33–34" (smoke) |
| 12     | §13 "commit 12"          | 35     | §13 "commit 35"             |
| 13     | §13 "commit 13"          | 36     | §13 "commit 36"             |
| 14     | §13 "commit 14"          | 37     | §13 "commits 37–44"         |
| 15     | §13 "commit 15"          | 38     | §13 "commits 37–44"         |
| 16     | §13 "commit 16"          | 39     | §13 "commits 37–44"         |
| 17     | §13 "commit 17"          | 40     | §13 "commits 37–44"         |
| 18     | §13 "commit 18"          | 41     | §13 "commits 37–44"         |
| 19     | §13 "commits 19–27" (B1) | 42     | §13 "commits 37–44"         |
| 20     | §13 "commits 19–27" (B2) | 43     | §13 "commits 37–44"         |
| 21     | §13 "commits 19–27" (B3) | 44     | §13 "commits 37–44"         |
| 22     | §13 "commits 19–27" (B4) | —      | —                           |
| 23     | §13 "commits 19–27" (B5) | —      | —                           |

## 42. How this plan was self-validated

Consistency checks run on the plan document itself before commit:

1. **Findings count:** index (§4) lists 26; §5 has 26 spec headers; §13 runbooks reference all 26; §28 checklists cover 26; Appendix M maps all 26. ✔
2. **Commit count:** §6.2 sequences 44; §13 has runbooks for all 44 (grouped where noted); §29 catalog has 44 entries; §32 schedules all 44 across 21 days. ✔
3. **Anchors:** no leftover internal markers (`grep SECTION-\|RUNBOOKS-\|APPENDIX-.*-ONWARDS` = 0). ✔
4. **Evidence anchors:** every file:line cited was produced by the audit's reads/greps against `99aca25`; the few ⚠︎verify marks mark the only spots where implementation must confirm a detail (constants, exported names, subcommand shapes). ✔
5. **Rule references:** AGENTS.md rule numbers cited (1–13) match the manual's numbering; §10.1's enforcement table cross-checks all 13. ✔
6. **Known uncertainties, honestly marked:** linter severities per rule (Appendix U ⚠︎), repo driver idioms (§27.3 ⚠︎), starter-install idempotency (§16 ⚠︎), CLI subcommand details (Appendix X ⚠︎), dialectic turn semantics (§15.3 ⚠︎). These are implementation-time confirmations, not plan risks. ✔

## Appendix Y — deployment & host matrix

| Host                   | Build                                 | Run                               | Deploy artifact                                    | CI coverage                         |
| ---------------------- | ------------------------------------- | --------------------------------- | -------------------------------------------------- | ----------------------------------- |
| Web                    | `npm run build` (Next)                | `npm run dev` / `start`           | — (dev server / host of choice)                    | build step ✔                        |
| Native Windows/Android | `npm run app:build` / `android:build` | `npm run app:dev` / `android:dev` | NSIS/MSI/APK (native.yml)                          | native.yml on main/tags ✔           |
| Tauri web bundle       | `npm run web:tauri`                   | `npm run preview:tauri` (:4173)   | static bundle + vendor sqlite-wasm                 | web:tauri step ✔                    |
| MCP                    | tsx (no build)                        | `npm run mcp`                     | stdio server                                       | typecheck ✔                         |
| CLI                    | build incl. shebang                   | `npm run cli -- <cmd>`            | bin                                                | build ✔                             |
| Headless server        | tsx                                   | `npm run serve`                   | process                                            | typecheck ✔                         |
| Worker                 | wrangler                              | `wrangler dev`                    | Cloudflare deploy (`worker:deploy`, fixed by F-02) | typecheck + tests ✔ (deploy manual) |
| Extension              | build script                          | load unpacked                     | zip                                                | build + tests ✔                     |

Post-plan additions: Playwright smoke (web, CI), check:scripts (all), rules-guard (db).

## Appendix Z — audit metadata & reproducibility

- **Audit date:** 2026-11-08; **commit audited:** `99aca25`; **tree:** clean.
- **Auditors:** three parallel exhaustive exploration passes (marker scan; feature surface; infra) + this document's synthesis; every numeric claim in the plan traces to one of the reproduced tables.
- **Evidence policy:** file:line anchors are exact for findings; counts (92 tables, 143 handlers, 27 tools) were grep-verified twice.
- **Reproducibility:** §38 contains the mechanical sweeps verbatim; the manual cross-checks are described procedure-by-procedure so a second auditor reaches the same findings.
- **Scope honesty:** the audit did NOT run the app, execute tests, or access the network — it is a static + structural analysis. Runtime verification is exactly what P3's new tests and §21's manual scenarios provide.

## Appendix AB — copy deck (exact UI strings for new surfaces)

The actual strings the new UIs ship with (calm, honest, one idea per string) — so implementation doesn't invent copy ad hoc:

**Deck Doctor**

- Title: `Deck Doctor — <deck name>`
- Score line: `<score>/100` + verdict from: `Nothing to fix.` / `Mostly healthy — <n> fixable issues.` / `Needs attention — <n> issues.`
- Leech group: `Cards you keep failing. Suspending them is safe; deleting needs a backup.`
- W6 group: `Cards <p>% similar; reviewing both interferes.`
- Manual rules: `How to fix` → the rule's own `suggestion` from linter.ts (verbatim — the linter already carries good copy).
- Apply confirm (delete): `Delete <n> cards? This can be undone only via a backup.`
- Post-apply toast: `Fixed <k> rules: <summary>.`
- Empty state: `Nothing to fix. Run the doctor again after importing.`

**Review stats panel**

- Section title: `Per-deck activity`
- Columns: `Today · 7 days · 30 days · Lapses`
- Empty: `No reviews yet — stats appear after your first session.`

**Share deck**

- Menu item: `Share…` · Toast: `Share string copied.`
- Hint (reuses import-side copy): `Paste this string on another device's Online → Import.`

**Distraction apps**

- Section title: `Distraction apps`
- Explainer: `These are logged when a focus session catches you switching to them.`
- Input hint: `Add a domain or app name…`
- Empty: `Nothing logged yet.`

**Remedial path**

- Button: `Suggest remedial path`
- Chain rows: `<skill> <mastery>% → open lesson`
- Empty: `No remedial work needed for this skill.`

**Manual modes**

- Tutor panel title: `Do it by hand` (steps rendered from manual.ts verbatim)
- Search strip title: `Search tips` (steps rendered from manual.ts verbatim)

**Haptics setting**

- Label: `Haptics` · Description: `Vibration feedback on grading and session boundaries. Off = completely silent.`

Copy rules honored throughout: no exclamation marks, no dark patterns, numbers spelled as digits, sentence case, honest empty states that say what will make the state non-empty.

---

## 43. Maintaining this document during execution

- When a finding's scope changes mid-execution: update its §5 spec (a short "Amended <date>:" note, never silently rewriting), then the runbook, then commit both with the finding's commit.
- When a new finding is discovered during execution: give it the next free F-id (F-27+), add index + spec + checklist rows, slot it into the appropriate phase (respecting §6.1 dependencies), and note it in the final report.
- When a migration number changes (another 027-class landing order): §8.1 and the F-06 spec get the correction in the same commit as the schema change.
- The document's own commits follow the same Conventional Commits discipline (`docs(plan): …`).
- On completion: §28's checklist boxes are checked in one final `docs(plan): record execution results` commit with the honest report appended to §12.

## Appendix AC — SuperMemo's 20 Rules ↔ linter implementation status

The linter implements Weller's/SuperMemo's minimum-information principles selectively. Mapping (rule numbers per the linter's W-ids):

| 20-Rules principle                          | W-id              | Status                                 | Doctor treatment        |
| ------------------------------------------- | ----------------- | -------------------------------------- | ----------------------- |
| 1. Do not learn if you do not understand    | —                 | out of linter scope (pre-learning)     | —                       |
| 2. Learn before you memorize                | —                 | out of scope                           | —                       |
| 3. Build upon the basics                    | —                 | covered pedagogically (curriculum DAG) | —                       |
| Minimum information principle               | W1                | ✔ implemented                          | manual split guidance   |
| Cloze deletion is easy and effective        | W11               | ✔ implemented (suggestion)             | regenerate-cloze intent |
| Optimize wording                            | W3 (length proxy) | ✔ implemented                          | manual guidance         |
| Refer to other memories                     | W9/W14 family     | ✔ implemented (source/context cues)    | manual                  |
| Personalize & provide examples              | W10               | ✔ implemented (imagery)                | manual                  |
| Rely on emotional states                    | —                 | out of linter scope                    | —                       |
| Context cues simplify                       | W14               | ✔ implemented                          | manual                  |
| Redundancy does not contradict minimum info | W6                | ✔ implemented (interference)           | suspend duplicate       |
| Avoid sets                                  | W2                | ✔ implemented                          | manual / cloze          |
| Avoid enumerations                          | W2                | ✔ implemented (shared)                 | manual / cloze          |
| Combat interference                         | W6                | ✔ implemented (shared)                 | suspend duplicate       |
| Optimize pacing                             | —                 | FSRS domain (scheduling)               | —                       |
| Specify format                              | —                 | card types (schema)                    | —                       |
| Avoid date stamps                           | W18               | ✔ implemented                          | manual strip guidance   |
| Avoid priority stamps                       | W19               | ✔ implemented                          | manual strip guidance   |
| Redundancy ≠ minimum info (decks)           | —                 | deck hygiene (naming etc.)             | —                       |
| Graphic deletion / imagery                  | W10               | ✔ implemented                          | manual                  |

The doctor surfaces every implemented rule; the unimplemented numbers (W4, W5, W7, W8, W12, W13, W15, W16, W17) are reserved ids — see the backlog (§37).

## Appendix AD — XP economy reference (post-F-03)

| Source            | Amount (snapshot)                      | Sites migrated                                      |
| ----------------- | -------------------------------------- | --------------------------------------------------- |
| journal           | 25                                     | handlers/journal:78                                 |
| habit             | 15                                     | handlers/habits/checkin:40                          |
| focus             | 30                                     | handlers/focus/[id]:61                              |
| quest             | 20                                     | handlers/quests:158                                 |
| idea              | 10                                     | handlers/ideas/evolve:60                            |
| feynman           | 60                                     | handlers/ai/feynman/grade:94                        |
| achievement       | 50                                     | handlers/achievements:140                           |
| dialectic         | 20                                     | repos/dialectic:92                                  |
| social            | 15                                     | repos/social:127                                    |
| curriculum lesson | (snapshot at F-03 time)                | handlers/curriculum/lessons/[id]:57, curriculum:121 |
| cli capture       | (snapshot)                             | cli/index.ts:305                                    |
| card grade        | (review-service canonical — unchanged) | review-service.ts                                   |

⚠︎The snapshot values marked "(snapshot)" are read from the actual sites during commit 6's golden test — the table here records _where_, the golden test records _what_. Any future rebalance is an explicit commit touching `XP_SOURCES` + the golden test together.

## Appendix AE — schema column quick reference (parity domains, verified)

Full verified columns for the C1 batch (from schema.ts), so the MCP arg schemas don't guess:

**habits** — id, name*, cue, cueType(time|location|preceding|emotional|people), craving, response(two-minute rule), reward, anchor(habit stacking), order, archived, createdAt (* = required)
**habit_logs** — id, habitId*, date*('YYYY-MM-DD'), note, createdAt; UNIQUE(habitId,date)
**journal_entries** — id, date*, mood(1-5), smallWins, gratitude, worryDump, aiInsight, createdAt; UNIQUE(date)
**physio_log** — id, date*, sleepHours, sleepQuality(1-5), exerciseMinutes, exerciseHoursAfterLearning, caffeineCutoffHour(0-23), arousal(1-10), notes; UNIQUE(date)
**goals** — id, wish*, outcome, obstacle, ifThenPlan, ifCondition(≤200c), thenAction(≤200c), status(active|…), progressPct, quoteId, dueDate, createdAt
**commitments** — id, title*, metric*(reviews|focus_minutes|lessons), threshold*(weekly), stakes, status, startedAt, endsAt

These columns are the single source for the zod arg schemas of `habit_*`, `journal_*`, `physio_log` tools and the matching CLI flags — no invention, no drift.

---

## Appendix AF — CI workflow inventory (current + post-plan)

**ci.yml — current steps (verified):**

| #   | Step         | Command (essence)                                     |
| --- | ------------ | ----------------------------------------------------- |
| 1   | typecheck    | `npm run typecheck` (workspaces + tests/e2e tsconfig) |
| 2   | lint         | `npm run lint` (`eslint .`)                           |
| 3   | unit tests   | `npm test --workspaces --if-present`                  |
| 4   | db setup     | `npm run db:push && npm run db:seed`                  |
| 5   | e2e          | `npm run test:e2e` (vitest.e2e.config.mjs)            |
| 6   | build        | `npm run build`                                       |
| 7   | tauri bundle | `npm run web:tauri`                                   |

**native.yml:** Windows NSIS/MSI + Android APK builds on main/tags.

**Post-plan insertions (F-18, F-24):** after step 2 → `npm run format:check`; after step 5 → Playwright install + `npm run test:ui` with artifacts-on-failure; before step 2 (PRs) → `npx commitlint --from <merge-base> --to HEAD`.

**Husky hooks (local):** pre-commit (lint-staged equivalent), commit-msg (commitlint). CI additions make the hooks redundant-but-harmless — defense in depth, not duplication of purpose.

**PR template checks with no automation (honest table, §10.1):** zod boundaries, withTransaction, AI manual modes (partially automated), JSDoc, schema↔migration pairing, raw-fetch (automated by F-24), CHANGELOG, secrets. The table ships in AGENTS.md so reviewers know exactly which checks are mechanical vs human.

## Appendix AG — repository top-level layout (orientation map)

```
learning-HUB/
├── AGENTS.md                  ← operating manual (rules 1–13)
├── ARCHITECTURE.md            ← system overview
├── README.md                  ← product overview + quickstart
├── CHANGELOG.md               ← release history (M-milestones)
├── package.json               ← npm workspaces root (scripts audited in F-02/F-25)
├── eslint.config.mjs          ← single ESLint config (rules 1/2 enforcement)
├── vitest.e2e.config.mjs      ← e2e runner (root tests/e2e)
├── packages/
│   ├── core/                  ← pure domain logic + zod (no I/O)
│   ├── db/                    ← the ONLY SQLite writer (schema, migrations, repos, review-service)
│   └── ai-adapters/           ← the ONLY AI-SDK importer
├── apps/
│   ├── web/                   ← Next.js UI + runtime-neutral handlers + hub worker
│   ├── native/                ← Tauri 2 shell (thin Rust)
│   ├── mcp/ · cli/ · server/  ← agent/terminal/HTTP hosts
│   ├── worker/                ← Cloudflare worker (rooms/raids) — absent from old maps (F-20)
│   └── extension/             ← browser extension — absent from old maps (F-20)
├── plugins/                   ← 5 first-party plugins (mcpTools/cliCommands/palette/widgets)
├── docs/                      ← architecture, ADRs, curriculum contract, plans (this doc)
├── scripts/                   ← build/dev tooling (+ archive/ after F-25)
├── tests/e2e/                 ← tiered e2e suites
└── .github/                   ← ci.yml, native.yml, PR template
```

This map is the corrected version (post-F-20) of what ARCHITECTURE.md and AGENTS.md §2 will carry.

---

## Appendix A — unfinished-work marker scan inventory

Summary of every scan from §2.1 with the full real-signal list (false-positive classes already described in §2.2 are not repeated per-hit):

**`TODO|FIXME|XXX|HACK` — 14 hits, 2 real:**

1. `apps/native/src-tauri/gen/android/gradle.properties:24` — Tauri-generated Android project (regenerated by tooling; not hand-maintained code).
2. `scripts/new-feature.mjs:111,156,163,219,255` — the scaffolder's _intended_ TODO output for generated features.

**`not implemented|unimplemented` — 0 hits.**

**`placeholder|stubbed|for now|coming soon|temporar|WIP` — ~215 hits:**

- 211 benign HTML `placeholder=` input attributes across 43 pages + components (full list preserved in the audit working notes; representative: backup page sync-provider tokens, deck editor card fields, curriculum builder inputs).
- 4 inspected-and-cleared: `packages/core/src/ideas.ts:252` (static checklist template row in Ideas data — content, not code debt), `packages/db/src/migrations/025-cognitive-upsert-keys.ts:2,5` (documented permanent compat shim), `packages/db/src/sync.ts:1104` (masked-secret form handling), `apps/web/src/server/handlers/cognitive/load/route.ts:8` (JSDoc asserting telemetry is real, "not a placeholder").

**`@ts-ignore|@ts-expect-error|@deprecated|eslint-disable|as any` — 2 hits:**

1. `packages/db/src/driver/sqlite-wasm.ts:495` — `eslint-disable-next-line no-this-alias` with justification comment (mirrors better-sqlite3 transaction.js shape).
2. `packages/db/tests/review-service.test.ts:471` — intentional `@ts-expect-error` for a negative type test.

**Skip/only/todo patterns — 13 raw hits, 0 real** (all `process.exit(`/`app.exit(`/`exit(` false positives from the unanchored `xit\(`).

**Throw-stub patterns — 0 hits.**

**`experimental|beta|draft` — 48 hits:** local `draft` state variables, fixture names ("Concept Beta", "Obsolete Draft", "Chapter 4 Draft"), JSON Schema draft 2020-12 references, and the two documented items (migration 025 shim; ideas checklist row).

**Git/branch findings:** 54 commits ahead of main; 247 files, +20,720/−1,406; `m20-wave2` fully merged (no stranded work); zero-diff workspaces on the branch: `packages/ai-adapters`, `apps/server`, `apps/native`.

**Roadmap docs found:** `docs/PLAN-M6-M10.md` (archived, all shipped), `docs/PLAN-RESEARCH.md` (notes only), `docs/plan-M19-M21.md` (active — status reconciled by F-22), `README.md` §Roadmap (fixed by F-19).

## Appendix B — pages ↔ endpoints matrix

Full page→endpoint mapping (43 pages + non-page callers), verified against the registry. ✔ = handler file exists, registered, shimmed.

| Caller                             | Endpoints (all ✔ unless noted)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/page.tsx`                     | `/api/dashboard`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `app/analytics/page.tsx`           | `/api/analytics` (+ F-08 adds `/api/review/stats`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `app/audio-commute/page.tsx`       | `/api/audio/circadian/commute` GET,POST                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `app/backup/page.tsx`              | `/api/sync` GET,PUT,POST · `/api/decks` · `/api/import` · `/api/backup?mode=merge` · `/api/backup` download · `/api/export?deckId=&format=`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `app/canvas/page.tsx`              | `/api/canvas` GET,POST · `/api/canvas/[id]` PATCH,DELETE                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `app/constellation/page.tsx`       | `/api/cognitive/gkt` GET,POST ×3 actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `app/courses/page.tsx`             | `/api/starter` GET,POST                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `app/courses/course/page.tsx`      | `/api/curriculum/courses/[id]` download ×2 · `/api/curriculum/glossary` · `/api/graph?courseId=`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `app/courses/exam/page.tsx`        | `/api/curriculum/courses/[id]/exam` GET,POST                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `app/courses/lesson/page.tsx`      | `/api/curriculum/lessons/[id]` GET,POST · `/api/curriculum/practice` (via ExercisePractice)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `app/courses/certificate/page.tsx` | `/api/curriculum/courses/[id]/certificate` GET,POST                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `app/courses/new/page.tsx`         | `/api/curriculum/prompt` GET · `/api/curriculum/import` POST (dry-run)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `app/curriculum/page.tsx`          | `/api/curriculum` GET,POST,PATCH · `/api/curriculum/skills` · `/api/curriculum/exam` GET,POST ×2 · `/api/reading` · TransportPanel course-generator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `app/debate/page.tsx`              | `/api/dialectic/arena` GET,POST ×4 actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `app/decks/page.tsx`               | `/api/decks` GET,POST · `/api/decks/[id]` PATCH,DELETE · `/api/cards` GET,POST,PUT bulk · `/api/cards/[id]` PATCH,DELETE · `/api/fsrs/optimize` POST · `/api/images` POST · `/api/images/[id]` GET · `/api/ai/generate` POST cloze · TransportPanel cloze-generator (+ F-08 share-export, F-12 doctor)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `app/exam-sim/page.tsx`            | `/api/curriculum/exam/simulator` GET ×2, POST ×2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `app/feynman/page.tsx`             | `/api/ai/transport?feature=` · `/api/decks` · `/api/ai/chat` stream · `/api/cards?bulk=1` PUT · `/api/ai/feynman/grade` POST · manual modes ×2 · TransportPanel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `app/focus/page.tsx`               | `/api/focus/max` GET,POST · `/api/focus/allowlists` · `/api/focus/bridge` · `/api/focus` GET,POST · `/api/focus/[id]` PATCH · `/api/focus/max/exit` POST ×2 · `/api/friction` POST · `/api/onboarding/detox` GET,POST (+ F-08 distractions)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `app/games/page.tsx`               | `/api/social/duels` GET,POST · `/api/decks` · `/api/games?deckId=` GET,POST · `/api/games/boss` GET,POST ×2 · `/api/social/leaderboard` GET,POST,DELETE · `/api/social/leaderboard/sync` POST                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `app/graph/page.tsx`               | `/api/graph` GET · `/api/curriculum/graph/dependencies` GET,POST,DELETE (+ F-08 remedial)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `app/habits/page.tsx`              | `/api/habits?tzOffset=` GET,POST · `/api/habits/checkin` · `/api/habits/[id]` DELETE                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `app/ideas/page.tsx`               | `/api/ideas` GET,POST · `/api/ideas/evolve` · `/api/ideas/council` · `/api/ideas/brainwrite` · `/api/ideas/[id]` PATCH,DELETE · TransportPanel ×2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `app/ingest/page.tsx`              | `/api/decks` · `/api/ingest/multimodal` POST · `/api/cards?bulk=1` PUT                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `app/journal/page.tsx`             | `/api/journal?from=` GET,POST · `/api/journal/weekly?weekStart=` · `/api/journal/ai` POST · TransportPanel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `app/mindmap/page.tsx`             | `/api/mindmaps` GET,POST · `/api/mindmaps/[id]` PUT,DELETE · `/api/mindmaps/[id]/cards` POST · `/api/decks`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `app/motivation/page.tsx`          | `/api/streaks` · `/api/quests?tzOffset=` · `/api/goals` · `/api/goals/[id]` · `/api/achievements` · `/api/commitments?tzOffset=` · `/api/social/seasons`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `app/notes/page.tsx`               | `/api/notes` GET,POST · `/api/notes/[id]` GET,PATCH,DELETE · `/api/cards/bullet` POST                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `app/online/page.tsx`              | `/api/online/identity` GET,POST · `/api/online/rooms` · WS `…/api/v1/rooms/{code}/ws` (worker) · `/api/online/raids` POST · `/api/online/library` · `/api/share/import` POST · `/api/online/buddies` GET,POST ×2 · `/api/social/guilds` GET ×2, POST ×3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `app/palace/page.tsx`              | `/api/palace` GET,POST · `/api/palace/[id]` GET,PATCH,DELETE · `/api/cards?limit=100`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `app/palace-3d/page.tsx`           | `/api/palace` · `/api/spatial/palace-3d` GET,POST                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `app/physiology/page.tsx`          | `/api/physio` GET,POST                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `app/planner/page.tsx`             | `/api/study-plan` GET,POST,DELETE · `/api/study-plan?format=ics` (+ F-08 engagement %)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `app/quotes/page.tsx`              | `/api/quotes?mode=daily` · `/api/quotes?mode=all` · `/api/quotes` POST,PATCH                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `app/reading/page.tsx`             | `/api/reading` GET,POST,DELETE · `/api/reading/[id]` GET,PATCH,DELETE · `/api/reading/sq3r` GET,PUT,POST ×2 · `/api/reading/highlights` GET,PATCH ×2 · `/api/reading/ingest` POST ×3 · `/api/reading/exposure` GET ×2,POST ×2 · `/api/cards?limit=200` · `/api/ai/generate` cloze+summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `app/review/page.tsx`              | `/api/decks` · `/api/review?deckId=` GET · `/api/review` POST ×2 · `/api/review/undo` · `/api/cognitive/load` GET,POST · `/api/audio/grade` POST · `/api/audio/digest` GET · `/api/images/[id]` GET · `/api/review/attempt-image` GET,POST                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `app/search/page.tsx`              | `/api/search/nl` POST · `/api/search?q=` GET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `app/settings/page.tsx`            | `/api/settings` GET,PUT,POST · `/api/fsrs/optimize` GET,POST · `/api/anki/connect` GET,POST · `/api/online/identity` POST · `/api/world/settings` GET,POST · (+ panels: `/api/embeddings/index`, `/api/push`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `app/sleep-tmr/page.tsx`           | `/api/audio/tmr/cues` GET,POST ×2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `app/tutor/page.tsx`               | `/api/ai/transport` · `/api/notes` · `/api/curriculum` · `/api/decks` · `/api/ai/chat/sessions` GET ×2 · `/api/ai/chat` stream · `/api/ai/chat/summary` POST · `/api/cards?bulk=1` PUT · TransportPanel · manual mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `app/voice-tutor/page.tsx`         | `/api/cards?limit=50` · `/api/tutor/voice-session` POST start/turn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `app/weakness/page.tsx`            | `/api/curriculum/skills/weakness-v2` GET,POST                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `app/weekly/page.tsx`              | `/api/weekly?tzOffset=` GET · `/api/ai/transport` GET+POST                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `app/world/page.tsx`               | `/api/world/state` GET ×2 · `/api/world/market` · `/api/world/verify/focus` POST · `/api/world/plots` POST · `/api/world/avatar` GET,POST ×3 · `/api/world/settings` POST                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Non-page callers                   | QuickHudModal (`/api/hud/quick-review`, `/api/review`, `/api/hud/capture`, `/api/embeddings/search`) · AppShell (`/api/sync`, `/api/settings`) · dashboard widgets (`/api/starter`, `/api/timeline?days=7`, `/api/insights`, `/api/insights/untested`, `/api/plugins/contributions`) · CardMinerSheet (`/api/decks`, `/api/cards/from-text`, `/api/cards`) · CommandPalette (`/api/search`, `/api/plugins/contributions`) · WorkloadBalancerModal (`/api/workload`) · OnboardingWizard (`/api/settings`, `/api/import`, `/api/curriculum/import`, `/api/starter`) · NotificationBell (`/api/dashboard`) · ThemeSync (`/api/settings`) · RelatedPanel (`/api/embeddings/index`) · platform/reminders (`/api/reminders/plan`, `/api/reminders/log`) · ui/exercises/inputs (`/api/ai/rubric`) · ExercisePractice (`/api/curriculum/practice`) · lib/curriculum-api (courses/lessons/prompt/import/stages/exam/certificate) |
| **No UI caller (F-08)**            | `/api/review/stats` · `/api/share/export` · `/api/distractions` · `/api/reminders/click` · `/api/audio/sessions` (→ removed) · `/api/curriculum/graph/remedial`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Appendix C — AI feature matrix

| Feature                                                      | Prompt | Handler                              | UI                       | TransportPanel   | Manual mode wired in UI                      |
| ------------------------------------------------------------ | ------ | ------------------------------------ | ------------------------ | ---------------- | -------------------------------------------- |
| tutor-session-summary                                        | ✔      | `ai/chat/summary:54`                 | tutor summary btn        | ✘                | **✘ (F-09)**                                 |
| nl-search                                                    | ✔      | `search/nl:57`                       | search page              | ✘                | **✘ (F-09; handler keyword fallback works)** |
| tutor-grade                                                  | ✔      | `ai/chat:132`                        | tutor stream             | ✔ tutor:355      | ✔ tutor:112                                  |
| feynman-student                                              | ✔      | `ai/chat` (feynman kind)             | feynman stream           | n/a (text)       | ✔ feynman:47                                 |
| feynman-grader                                               | ✔      | `ai/feynman/grade:36`                | feynman                  | ✔ feynman:497    | ✔ feynman:48                                 |
| course-generator                                             | ✔      | `curriculum:65`                      | curriculum + courses/new | ✔ curriculum:465 | ✔ (manual builder)                           |
| cloze-generator                                              | ✔      | `cards/from-text:36` + `ai/generate` | decks + reading          | ✔ decks:1348     | ✔                                            |
| coach                                                        | ✔      | `weekly` envelope + `journal/ai`     | weekly + journal         | ✔ journal        | ✔ (rule-based fallback)                      |
| council-optimist / skeptic / domain-expert / devils-advocate | ✔      | `ideas/council:22`                   | ideas                    | ✔ ideas:453-456  | ✔                                            |
| brainwrite                                                   | ✔      | `ideas/brainwrite:23`                | ideas                    | ✔ ideas:347      | ✔                                            |
| freetext-rubric                                              | ✔      | `ai/rubric:30`                       | exercise renderer        | ✔                | ✔ (self-grade checklist)                     |
| (voice-session — outside AI_FEATURES)                        | —      | `tutor/voice-session:132`            | voice-tutor              | n/a (voice)      | ✔ offline Socratic fallback                  |

## Appendix D — exercise type matrix

| Type       | schema | grade | renderer                     | test                  |
| ---------- | ------ | ----- | ---------------------------- | --------------------- |
| mcq        | ✔      | ✔     | McqInput                     | ✔ practice.test:49,69 |
| multi      | ✔      | ✔     | MultiInput                   | ✔ :77                 |
| truefalse  | ✔      | ✔     | TrueFalseInput               | ✔ :161,209,214        |
| numeric    | ✔      | ✔     | NumericInput                 | ✔ :83,86              |
| typein     | ✔      | ✔     | TypeInInput                  | ✔                     |
| cloze      | ✔      | ✔     | ClozeInput                   | ✔ :56,91              |
| ordering   | ✔      | ✔     | OrderingInput                | ✔ :99                 |
| parsons    | ✔      | ✔     | ParsonsInput                 | ✔ :141                |
| matching   | ✔      | ✔     | MatchingInput                | ✔ :104                |
| categorize | ✔      | ✔     | CategorizeInput              | ✔ :129                |
| freetext   | ✔      | ✔     | FreeTextInput (+rubric API)  | ✔ :147                |
| code       | ✔      | ✔     | CodeInput (sandboxed worker) | ✔ :151                |

No gaps. `isAnswerReady` covers 9 types with `default: true` for truefalse/numeric/ordering — correct.

## Appendix E — core domain ↔ persistence ↔ host matrix

| Domain               | DB repo                     | MCP                         | CLI              | Server route             |
| -------------------- | --------------------------- | --------------------------- | ---------------- | ------------------------ |
| review/fsrs          | ✔ fsrs, learning, retrieval | ✔ review_log/review_stats   | ✔ review/stats   | ✔ /review, /review/batch |
| fsrs optimizer       | via fsrs repo               | ✔ fsrs_optimize             | ✔ fsrs           | —                        |
| cards/decks          | ✔ learning                  | ✔ card_generate             | ✔ review         | ✔ /cards, /decks         |
| curriculum/practice  | ✔ curriculum                | ✔ curriculum_* ×6           | ✔ curriculum     | —                        |
| notes                | ✘ inline (→F-13 B1)         | ✔ note_create/note_search   | ○ via search     | —                        |
| ideas                | ✘ inline (→F-13 B5)         | ✔ idea_* ×5                 | ✔ capture        | —                        |
| goals/quests/streaks | ✘ inline (→F-13 B4)         | ✔ goal_woop/goal_list       | ✔ today          | —                        |
| habits               | ✘ (→F-13 B2)                | **✘ (→F-14 C1)**            | **✘ (→F-14 C1)** | —                        |
| journal              | ✘ (→F-13 B1)                | **✘ (→F-14 C1)**            | **✘ (→F-14 C1)** | —                        |
| quotes               | ✘ (→F-13 B5)                | ✔ quote_random              | ✔ quote          | —                        |
| focus/friction       | ✔ focus-lock                | ✔ focus_summary             | ✔ focus          | —                        |
| physio               | ✘ (→F-13 B6)                | **✘ (→F-14 C1)**            | **✘ (→F-14 C1)** | —                        |
| reading              | ✘ (→F-13 B3)                | **✘ (→F-14 C2)**            | **✘ (→F-14 C2)** | —                        |
| exposure             | ✔ exposure                  | ✔ exposure_ledger           | ✔ exposure       | —                        |
| gkt                  | ✔ gkt                       | **✘ (→F-14 C2)**            | **✘ (→F-14 C2)** | —                        |
| guilds/social        | ✔ guilds, social            | **✘ (→F-14 C3)**            | **✘ (→F-14 C3)** | —                        |
| world                | ✔ world                     | **✘ (→F-14 C3)**            | **✘ (→F-14 C3)** | —                        |
| visual               | ✔ visual                    | — (web UI domain)           | —                | —                        |
| spatial/palace       | ✔ palace3d                  | **✘ (→F-14 C3)**            | **✘ (→F-14 C3)** | —                        |
| dialectic            | ✔ dialectic                 | **✘ (→F-14 C3)**            | **✘ (→F-14 C3)** | —                        |
| boss/games           | ✘ inline (→F-13)            | **✘ (→F-14 C4, read-only)** | **✘ (→F-14 C4)** | —                        |
| knowledge-graph      | ✔                           | — (web UI domain)           | —                | —                        |
| online/raids         | ✔ online                    | — (worker host)             | —                | —                        |
| audio/circadian/TMR  | ✔ audio, circadian          | **✘ (→F-14 C4)**            | **✘ (→F-14 C4)** | —                        |
| embeddings           | ✘ inline (→F-13)            | ○ via search                | ○ via search     | —                        |
| cognitive-load       | ✔ cognitive-telemetry       | **✘ (→F-14 C4)**            | **✘ (→F-14 C4)** | —                        |
| workload             | ✘ reads cards               | ✔ workload_balance          | ✔ workload       | —                        |
| anki                 | ✘ inline                    | — (plugin anki-bridge)      | —                | —                        |
| share                | ✘                           | —                           | —                | —                        |
| reminders            | ✔ reminders                 | —                           | —                | —                        |
| sync/backup          | ✘ inline (→F-13 B7)         | ✔ cloud_sync                | ✔ sync           | —                        |

## Appendix F — environment variable audit

| Var                               | Consumed by                                    | In `.env.example` | Action                          |
| --------------------------------- | ---------------------------------------------- | ----------------- | ------------------------------- |
| `LEARNING_HUB_DB`                 | db paths:13; tests; importer                   | ✔                 | —                               |
| `LEARNING_HUB_PORT`               | server config:49                               | ✔                 | —                               |
| `LEARNING_HUB_HOST`               | server config:51                               | ✔                 | —                               |
| `LEARNING_HUB_WEBHOOKS`           | server digest:42, index:41                     | ✔                 | —                               |
| `VAPID_PUBLIC_KEY`                | server push:21, digest:60, web push handler:16 | ✘                 | F-23                            |
| `VAPID_PRIVATE_KEY`               | server push:22, digest:60                      | ✘                 | F-23                            |
| `VAPID_SUBJECT`                   | server push:26                                 | ✘                 | F-23                            |
| `LEARNING_HUB_TARGET`             | next.config:14, tauri-web.mjs:25               | ✘ (tooling)       | F-23 (documented as do-not-set) |
| `NEXT_PUBLIC_LEARNING_HUB_TARGET` | transport:42 (derived)                         | ✘ (tooling)       | F-23 (documented as do-not-set) |
| `UI_SMOKE_PORT`                   | playwright.config:22,29,30                     | ✘ (test infra)    | F-26 (TEST_INFRA.md)            |
| `TAURI_DEV_HOST`                  | tauri-web.mjs:44                               | ✘ (dev tooling)   | acceptable (script-set)         |
| `CI`, `NODE_ENV`                  | standard                                       | n/a               | —                               |

## Appendix G — full schema inventory (92 tables, verified by grep at audit time)

Grouped as in schema.ts. "→repo" marks the F-13 batch that extracts its repo; tables marked "F-01" become grading-internal, "runner-owned" stay repo-free by design.

| #   | Table (export name)                  | schema.ts line | Repo batch                     |
| --- | ------------------------------------ | -------------- | ------------------------------ |
| 1   | `notes`                              | 38             | B1                             |
| 2   | `note_links`                         | 59             | B1                             |
| 3   | `note_bullets`                       | 75             | B1                             |
| 4   | `decks`                              | 91             | ✔ existing                     |
| 5   | `cards`                              | 118            | ✔ existing                     |
| 6   | `revlog` (append-only)               | 161            | review-service                 |
| 7   | `revlog_undos`                       | 183            | F-01 (grading internal)        |
| 8   | `images`                             | 200            | B7                             |
| 9   | `palaces`                            | 212            | ✔ palace3d                     |
| 10  | `palace_items`                       | 223            | ✔ palace3d                     |
| 11  | `mnemonic_tables`                    | 239            | B9                             |
| 12  | `sources`                            | 256            | B3                             |
| 13  | `highlights`                         | 276            | B3                             |
| 14  | `sq3r_sessions`                      | 307            | B3                             |
| 15  | `tracks`                             | 337            | ✔ curriculum                   |
| 16  | `courses`                            | 353            | ✔ curriculum                   |
| 17  | `units`                              | 383            | ✔ curriculum                   |
| 18  | `lessons`                            | 399            | ✔ curriculum                   |
| 19  | `skills`                             | 439            | ✔ curriculum                   |
| 20  | `skill_edges`                        | 454            | ✔ curriculum                   |
| 21  | `mastery`                            | 469            | F-01 (via mastery-service)     |
| 22  | `exam_dates`                         | 488            | ✔ curriculum                   |
| 23  | `lesson_progress`                    | 502            | ✔ curriculum                   |
| 24  | `course_project_stages`              | 524            | ✔ curriculum                   |
| 25  | `course_exam_attempts` (append-only) | 549            | ✔ curriculum                   |
| 26  | `certificates`                       | 567            | ✔ curriculum                   |
| 27  | `projects`                           | 587            | ✔ power-tools                  |
| 28  | `goals`                              | 606            | B4                             |
| 29  | `habits`                             | 625            | B2                             |
| 30  | `habit_logs`                         | 642            | B2                             |
| 31  | `commitments`                        | 659            | B2                             |
| 32  | `journal_entries`                    | 673            | B1                             |
| 33  | `quotes`                             | 691            | B5                             |
| 34  | `goals_quotes`                       | 705            | B4                             |
| 35  | `ideas`                              | 715            | ✔ power-tools                  |
| 36  | `idea_links`                         | 738            | B5                             |
| 37  | `xp_events` (append-only)            | 759            | F-03 (repos/xp)                |
| 38  | `quests`                             | 774            | B4                             |
| 39  | `streaks`                            | 787            | ✔ power-tools                  |
| 40  | `achievements`                       | 800            | B4                             |
| 41  | `elo_events` (append-only)           | 813            | F-01 (via mastery-service)     |
| 42  | `focus_sessions`                     | 827            | ✔ focus-lock                   |
| 43  | `focus_allowlists`                   | 855            | ✔ focus-lock                   |
| 44  | `focus_bridge`                       | 874            | ✔ focus-lock                   |
| 45  | `friction_events` (append-only)      | 885            | ✔ focus-lock                   |
| 46  | `distraction_apps`                   | 898            | B8                             |
| 47  | `ifthen_plans`                       | 912            | B4                             |
| 48  | `routines`                           | 925            | B8                             |
| 49  | `routine_steps`                      | 934            | B8                             |
| 50  | `physio_log`                         | 950            | B6                             |
| 51  | `user_settings`                      | 968            | ✔ existing                     |
| 52  | `canvases`                           | 1008           | B6                             |
| 53  | `chat_sessions`                      | 1021           | B6                             |
| 54  | `push_subscriptions`                 | 1046           | B7                             |
| 55  | `study_plans`                        | 1055           | B6                             |
| 56  | `schema_migrations`                  | 1075           | runner-owned (never a repo)    |
| 57  | `sync_tombstones`                    | 1085           | B7                             |
| 58  | `sync_configs`                       | 1105           | B7                             |
| 59  | `reminder_log` (append-only)         | 1124           | ✔ reminders                    |
| 60  | `reminder_clicks` (append-only)      | 1142           | ✔ reminders                    |
| 61  | `mindmaps`                           | 1157           | ✔ power-tools                  |
| 62  | `card_attempt_images` (append-only)  | 1171           | B7                             |
| 63  | `boss_battles`                       | 1188           | B4-adjacent (games read paths) |
| 64  | `friends`                            | 1204           | ✔ social                       |
| 65  | `online_servers`                     | 1221           | ✔ online                       |
| 66  | `online_identity`                    | 1232           | ✔ online                       |
| 67  | `online_prefs`                       | 1242           | ✔ online                       |
| 68  | `online_inbox` (append-only)         | 1251           | ✔ online                       |
| 69  | `audio_sessions`                     | 1269           | ✔ audio                        |
| 70  | `quick_captures`                     | 1286           | ✔ power-tools                  |
| 71  | `card_embeddings`                    | 1302           | ✔ retrieval                    |
| 72  | `embeddings`                         | 1324           | ✔ retrieval                    |
| 73  | `concept_dependencies`               | 1345           | ✔ knowledge-graph              |
| 74  | `anki_sync_mappings`                 | 1362           | anki-bridge plugin path        |
| 75  | `guilds`                             | 1384           | ✔ guilds                       |
| 76  | `guild_members`                      | 1401           | ✔ guilds                       |
| 77  | `seasonal_progress`                  | 1421           | ✔ social                       |
| 78  | `review_duels`                       | 1436           | ✔ social                       |
| 79  | `user_avatars`                       | 1454           | ✔ world                        |
| 80  | `forest_plots`                       | 1480           | ✔ world                        |
| 81  | `study_coin_ledger`                  | 1502           | ✔ world                        |
| 82  | `market_items`                       | 1522           | ✔ world                        |
| 83  | `user_world_settings`                | 1537           | ✔ world                        |
| 84  | `sync_devices`                       | 1556           | B7                             |
| 85  | `circadian_audio_sessions`           | 1578           | ✔ circadian                    |
| 86  | `tmr_cues`                           | 1598           | ✔ audio                        |
| 87  | `concept_dag_nodes`                  | 1617           | ✔ cognitive-telemetry          |
| 88  | `concept_dag_edges`                  | 1636           | ✔ cognitive-telemetry          |
| 89  | `cognitive_telemetry_events`         | 1658           | ✔ cognitive-telemetry          |
| 90  | `palace_3d_scenes`                   | 1679           | ✔ palace3d                     |
| 91  | `dialectic_arena_debates`            | 1709           | ✔ dialectic                    |
| 92  | `exposure_events` (append-only)      | 1731           | ✔ exposure                     |

Plus 3 views (`v_true_retention`, `v_daily_reviews`, `v_xp_daily`) and FTS5 virtual tables (migrations 003/018 — excluded from DDL-cloning helpers per AGENTS.md §5).

## Appendix H — migration registry (26, verified against migrations/index.ts)

| Id  | Name                         | File                                | Theme                              |
| --- | ---------------------------- | ----------------------------------- | ---------------------------------- |
| 1   | baseline                     | 001-baseline.ts                     | core content tables                |
| 2   | curriculum-v2                | 002-curriculum-v2.ts                | curriculum tree                    |
| 3   | fts-search                   | 003-fts-search.ts                   | FTS5 (idempotent raw-SQL pattern)  |
| 4   | fsrs-and-undo                | 004-fsrs-and-undo.ts                | FSRS-6 state + revlog_undos        |
| 5   | sync-and-onboarding          | 005-sync-and-onboarding.ts          | sync configs, onboarding           |
| 6   | sq3r-reading                 | 006-sq3r-reading.ts                 | reading/SQ3R                       |
| 7   | max-focus                    | 007-max-focus.ts                    | focus lock                         |
| 8   | reminders                    | 008-reminders.ts                    | reminders + clicks                 |
| 9   | visual-learning              | 009-visual-learning.ts              | visual domain                      |
| 10  | social                       | 010-social.ts                       | duels/seasons/friends              |
| 11  | online                       | 011-online.ts                       | online servers/identity/inbox      |
| 12  | audio-voice                  | 012-audio-voice.ts                  | audio sessions                     |
| 13  | power-tools                  | 013-power-tools.ts                  | quick captures, mindmaps           |
| 14  | knowledge-graph              | 014-knowledge-graph.ts              | concept dependencies               |
| 15  | guilds-seasons               | 015-guilds-seasons.ts               | guilds                             |
| 16  | forest-world-economy         | 016-forest-world-economy.ts         | world economy                      |
| 17  | companion-decor              | 017-companion-decor.ts              | avatars/decor                      |
| 18  | fts-omni                     | 018-fts-omni.ts                     | FTS expansion                      |
| 19  | embeddings-omni              | 019-embeddings-omni.ts              | embeddings                         |
| 20  | push-subscriptions           | 020-push-subscriptions.ts           | web push                           |
| 21  | sync-devices                 | 021-sync-devices.ts                 | multi-device sync v1               |
| 22  | goal-if-then                 | 022-goal-if-then.ts                 | if-then plans                      |
| 23  | deck-delayed-feedback        | 023-deck-delayed-feedback.ts        | delayed feedback flag              |
| 24  | ultimate-cognitive-expansion | 024-ultimate-cognitive-expansion.ts | cognitive expansion wave tables    |
| 25  | cognitive-upsert-keys        | 025-cognitive-upsert-keys.ts        | permanent compat shim (documented) |
| 26  | exposure-events              | 026-exposure-events.ts              | exposure ledger                    |
| 27  | haptics-setting              | _(this plan, F-06)_                 | user_settings.haptics_enabled      |

Planned: this plan adds 027; any further needs take 028+ in landing order.

## Appendix I — handler inventory (143 files, verified)

`●fn` = also exports a fetcher used by the registry. Listed by folder with methods:

achievements GET·fn · ai/chat POST(stream) · ai/chat/sessions GET,POST · ai/chat/summary POST · ai/feynman/grade POST · ai/generate POST · ai/rubric POST · ai/transport GET·fn,POST · analytics GET·fn · anki/connect GET,POST · audio/circadian/commute GET,POST · audio/digest GET · audio/grade POST · audio/sessions GET,POST _(removed by F-08⑤)_ · audio/tmr/cues GET,POST · backup GET,POST · calendar GET·fn (alias `calendar.ics`) · canvas GET·fn,POST · canvas/[id] GET·fn,PATCH,DELETE · cards GET·fn,POST,PUT,DELETE · cards/[id] GET·fn,PATCH,DELETE · cards/bullet POST · cards/from-text POST · cards/occlusion POST · cognitive/gkt GET,POST · cognitive/load GET,POST · commitments GET·fn,POST,PATCH,DELETE·fn · curriculum GET·fn,POST,PATCH · curriculum/courses GET·fn · curriculum/courses/[id] GET·fn,DELETE·fn · curriculum/courses/[id]/certificate GET,POST · curriculum/courses/[id]/exam GET,POST · curriculum/courses/[id]/export GET · curriculum/exam GET·fn,POST · curriculum/exam/simulator GET,POST · curriculum/glossary GET·fn · curriculum/graph/dependencies GET,POST,DELETE · curriculum/graph/remedial GET,POST _(gains UI, F-08⑥)_ · curriculum/import POST · curriculum/lessons/[id] GET,POST · curriculum/practice POST · curriculum/prompt GET,POST · curriculum/skills GET·fn · curriculum/skills/weakness-v2 GET,POST · curriculum/stages/[id] PATCH · dashboard GET·fn · decks GET·fn,POST · decks/[id] PATCH,DELETE · decks/doctor GET,POST _(new, F-12)_ · dialectic/arena GET,POST · distractions GET·fn,POST,DELETE·fn _(gains UI, F-08③)_ · embeddings/index GET,POST · embeddings/search POST · export GET · focus GET,POST · focus/[id] PATCH · focus/allowlists GET,POST · focus/allowlists/[id] PUT,DELETE · focus/bridge GET,POST · focus/max GET,POST · focus/max/exit POST · friction GET·fn,POST · fsrs/optimize GET,POST · games GET·fn,POST · games/boss GET,POST · goals GET·fn,POST · goals/[id] PATCH,DELETE·fn · graph GET·fn · habits GET·fn,POST · habits/[id] PATCH,DELETE·fn · habits/checkin POST · hud/capture GET,POST,PATCH,DELETE · hud/quick-review GET·fn · ideas GET·fn,POST · ideas/[id] GET·fn,PATCH,DELETE · ideas/brainwrite POST · ideas/council POST · ideas/evolve POST · images POST · images/[id] GET·fn · import POST · ingest/multimodal POST · insights GET·fn · insights/untested GET·fn · journal GET·fn,POST · journal/ai GET·fn,POST · journal/weekly GET·fn · mindmaps GET,POST · mindmaps/[id] GET,PUT,DELETE · mindmaps/[id]/cards POST · notes GET·fn,POST · notes/[id] GET·fn,PATCH,DELETE · onboarding/detox GET·fn,POST · online/buddies GET,POST · online/identity GET,POST · online/library GET,POST · online/raids POST · online/rooms GET,POST · palace GET·fn,POST · palace/[id] GET·fn,PATCH,DELETE · physio GET·fn,POST · plugins/contributions GET·fn · push GET,POST,DELETE · quests GET·fn,POST · quotes GET·fn,POST,PATCH · reading GET,POST,DELETE · reading/[id] GET·fn,PATCH,DELETE · reading/exposure GET,POST · reading/highlights GET·fn,POST,PATCH · reading/ingest POST · reading/sq3r GET,PUT,POST · reminders/click POST _(gains caller, F-08④)_ · reminders/log GET,POST · reminders/plan GET,POST · review GET·fn,POST · review/attempt-image GET,POST · review/stats GET·fn _(gains UI, F-08①)_ · review/undo POST · search GET·fn · search/nl POST · settings GET·fn,PUT,POST · share/export POST _(gains UI, F-08②)_ · share/import POST · social/duels GET,POST · social/guilds GET,POST · social/leaderboard GET,POST,DELETE · social/leaderboard/sync POST · social/seasons GET,POST · spatial/palace-3d GET,POST · starter GET,POST · streaks GET·fn,POST · study-plan GET·fn,POST,DELETE · sync GET,PUT,POST · timeline GET·fn · tutor/voice-session GET,POST · weekly GET·fn · workload GET·fn,POST · world/avatar GET,POST · world/market GET,POST · world/plots GET,POST · world/settings GET,POST · world/state GET·fn · world/verify/focus POST · world/verify/review POST.

(144 entries listed with the F-12 addition and the F-08⑤ removal noted — the executed total tracks the filesystem, which the registry tests enumerate.)

## Appendix J — MCP tools, CLI commands, server routes

**MCP (27 built-in at audit time; +F-14 additions).** `apps/mcp/src/index.ts`: idea_create, idea_search, idea_connect, idea_evolve, idea_list_inbox, note_create, note_search, review_log, review_stats, goal_woop, goal_list, focus_summary, quote_random, card_generate, search, fsrs_optimize, starter_install, cloud_sync (18) · `tools/curriculum.ts`: curriculum_prompt, curriculum_import, curriculum_list, curriculum_course, curriculum_next, curriculum_export (6) · `tools/cognitive.ts`: weakness_radar, workload_balance, exposure_ledger (3). Resources: 3. Plus plugin contributions via `ctx.mcpTools`.

**CLI (13 at audit time; +F-14 additions).** capture, today, stats, review, focus, quote, search, fsrs, starter, sync, curriculum, workload, exposure. Plus plugin contributions via `ctx.cliCommands`.

**Headless server (8).** GET /health · GET /decks · GET /cards · GET /today · GET /stats · GET /plugins · POST /review · POST /review/batch — matches docs/api-server.md exactly.

## Appendix K — test file inventory (at audit time)

**packages/core (68):** includes ai-registry, ai-transport, analytics, anki, audio, cards, circadian, cognitive-load, curriculum (multiple), curriculum-docs, elo-xp-journal, exposure, focus, fsrs, fsrs-optimizer, gkt, habits _(none — F-15)_, insights, knowledge-graph, language, linter, math, media _(none — F-15)_, memory, motivation, notes, pedagogy _(none — F-15)_, practice, prompts, quotes _(none — F-15)_, reading _(none — F-15)_, review, sentence-mining, share/social, spatial, spatial.test, streaks, study-plan, successively-relearning, tmr, workload, world — the audit's gap list is authoritative.

**packages/db (29):** backup, cognitive-expansion-regressions, curriculum-repo, elo-xp-journal, exposure-repo, focus-lock-repo, fsrs-repo, gkt-repo, knowledge-graph-repo, learning-repo, migrations, online-repo, palace3d-repo, repos smoke set, review-service, search, social-repo, sync, sync-devices, timeline-repo, transaction, world-repo, …

**apps/web (15):** calm-sensory, cognitive-expansion-routes, commute-partial-failure, curriculum-api, goals-ifthen, hub-registry, insights-untested, nav, route-safety, routes-smoke, settings-*, + Playwright `tests/ui/smoke.spec.ts`.

**apps/extension (3):** capture, state, popup. **apps/worker (1):** worker. **root tests/e2e (12):** tier1 ×9 (db-integrity, api-decks-cards, api-review, api-notes-ideas-graph, api-focus-goals-habits, api-curriculum-analytics-reading, cli-commands, mcp-tools, curriculum-agents) · tier2 boundary-validation · tier3 cross-feature · tier4 application-scenarios.

Gaps → F-15 (core), F-16 (handlers), F-17 (e2e); TEST_INFRA drift → F-26.

## Appendix L — doc-drift fixes, line-by-line

Exact edits for the P4 doc commits (before → after):

| File:loc                            | Before                                                                    | After                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ARCHITECTURE.md:41                  | "apps/mcp \| MCP stdio server: 14 tools + 3 resources"                    | "apps/mcp \| MCP stdio server: 27 built-in tools (+ plugin contributions) + 3 resources" — final count re-checked after F-14                                                          |
| README.md:67, 121                   | "14 tools"                                                                | same phrasing as ARCHITECTURE                                                                                                                                                         |
| ARCHITECTURE.md + AGENTS.md §2 maps | no worker/extension rows                                                  | "apps/worker — Cloudflare worker: rooms, boss raids, library share (deploy: npm run worker:deploy)" + "apps/extension — browser extension: quick-add, save-to-read, friction capture" |
| docs/ENGINE-REFERENCE.md:49         | "45 tables, pushed"                                                       | "92 tables (drizzle schema.ts; migrations 001–026 shipped)"                                                                                                                           |
| docs/ENGINE-REFERENCE.md:27         | "personalization: collect revlog rows; optimizer integration is deferred" | "personalization: on-device FSRS optimization (packages/core/src/fsrs-optimizer.ts) via /api/fsrs/optimize + settings UI"                                                             |
| README.md:81-88                     | provider table without google                                             | + "google — Gemini via @ai-sdk/google (BYO API key)" row                                                                                                                              |
| README.md:174-180                   | stale deferred list (3 shipped items)                                     | rewritten per F-19                                                                                                                                                                    |
| docs/learning-science.md:12         | "M3/M4/M5 of the current expansion"                                       | "the cognitive-expansion milestones (docs/plan-M19-M21.md)"                                                                                                                           |
| docs/learning-science.md §6 SDT     | "no leaderboards"                                                         | opt-in, cohort-scoped, personal-best framing (per F-21)                                                                                                                               |
| docs/plan-M19-M21.md                | M20/M21 items unchecked                                                   | ✅ with evidence paths; device drill stays 📋; pointer to this plan                                                                                                                   |
| .env.example                        | no VAPID_*/TARGET entries                                                 | per F-23 block                                                                                                                                                                        |
| AGENTS.md §5 UI                     | "Navigation comes only from nav.ts"                                       | + documented detail-page exception (5 course sub-pages)                                                                                                                               |
| docs/TEST_INFRA.md                  | missing curriculum-agents + rows.ts + Playwright                          | full layout refresh + Playwright section                                                                                                                                              |
| docs/native.md                      | no updater note                                                           | "Auto-update via the Tauri updater plugin is planned but not wired…"                                                                                                                  |

## Appendix O — test-file creation manifest

Every test file this plan creates, with purpose and minimum case count. (S = spec section with the enumerated cases.)

| #     | Path                                              | Purpose                           | Min cases               | Spec   |
| ----- | ------------------------------------------------- | --------------------------------- | ----------------------- | ------ |
| 1     | `packages/db/tests/mastery-golden.test.ts`        | behavior snapshot for F-01        | 2                       | §14.1  |
| 2     | `packages/db/tests/mastery-service.test.ts`       | unit cases for the canonical path | 8                       | §14.1  |
| 3     | `packages/db/tests/xp-golden.test.ts`             | 12-site XP snapshot               | 5                       | §14.2  |
| 4     | `packages/db/tests/migrations.test.ts` (+cases)   | migration 027 fresh + upgrade     | 2                       | F-06   |
| 5     | `apps/web/tests/net-bridge.test.ts`               | remoteFetch port + routing        | 3+5                     | §14.8  |
| 6     | `apps/web/tests/manual-mode-surface.test.ts`      | rule-9 UI invariant               | 1 (fails-on-regression) | F-09   |
| 7     | `apps/extension/tests/friction.test.ts`           | decision table                    | 6                       | F-10   |
| 8     | `packages/core/tests/doctor.test.ts`              | diagnosis + actions               | 10                      | F-12   |
| 9     | `apps/web/tests/decks-doctor.test.ts`             | handler GET/POST atomicity        | 5                       | §14.7  |
| 10    | `packages/db/tests/b1-notes-journal.test.ts`      | repo batch B1                     | 8                       | F-13   |
| 11    | `packages/db/tests/b2-habits-commitments.test.ts` | B2                                | 8                       | F-13   |
| 12    | `packages/db/tests/b3-reading.test.ts`            | B3                                | 6                       | F-13   |
| 13    | `packages/db/tests/b4-goals-quests.test.ts`       | B4                                | 8                       | F-13   |
| 14    | `packages/db/tests/b5-quotes.test.ts`             | B5                                | 5                       | F-13   |
| 15    | `packages/db/tests/b6-physio-canvas.test.ts`      | B6                                | 6                       | F-13   |
| 16    | `packages/db/tests/b7-images-sync.test.ts`        | B7                                | 6                       | F-13   |
| 17    | `packages/db/tests/b8-focus-extras.test.ts`       | B8                                | 5                       | F-13   |
| 18    | `packages/db/tests/b9-mnemonic.test.ts`           | B9                                | 3                       | F-13   |
| 19–22 | e2e mcp/cli case groups (in existing files)       | C1–C4 tools/commands              | 4/batch                 | F-14   |
| 23    | `packages/core/tests/habits.test.ts`              | habits logic                      | 10                      | §14.9  |
| 24    | `packages/core/tests/media.test.ts`               | podcast/guide structure           | 8                       | §14.9  |
| 25    | `packages/core/tests/quotes.test.ts`              | rotation                          | 8                       | §14.9  |
| 26    | `packages/core/tests/reading.test.ts`             | incremental reading               | 10                      | §14.9  |
| 27    | `packages/core/tests/bkt.test.ts`                 | BKT math                          | 12                      | §14.9  |
| 28    | `packages/core/tests/pedagogy.test.ts`            | planner/design API                | 12                      | §14.9  |
| 29    | `packages/core/tests/ai-modules.test.ts`          | extractJson edges                 | 8                       | §14.9  |
| 30    | `apps/web/tests/backup.test.ts`                   | risk #1 + round-trip              | 7                       | §14.3  |
| 31    | `apps/web/tests/sync.test.ts`                     | risk #2                           | 5                       | §14.4  |
| 32    | `apps/web/tests/fsrs-optimize.test.ts`            | risk #3 + golden                  | 4                       | §14.5  |
| 33    | `apps/web/tests/import-export.test.ts`            | risk #4                           | 6                       | F-16   |
| 34    | `apps/web/tests/push.test.ts`                     | risk #5                           | 4                       | §16    |
| 35    | `apps/web/tests/workload.test.ts`                 | risk #6 + golden                  | 4                       | §14.6  |
| 36–38 | `apps/web/tests/crud-smoke-{1,2,3}.test.ts`       | remaining folders                 | 3+/folder               | §16    |
| 39    | `apps/web/tests/search.test.ts`                   | FTS + nl fallback                 | 6                       | §16    |
| 40    | `apps/web/tests/settings.test.ts`                 | round-trip incl. haptics          | 4                       | §16    |
| 41    | `tests/e2e/tier2/backup-roundtrip.test.ts`        | flow                              | 1 core                  | §14.10 |
| 42    | `tests/e2e/tier2/sync-api.test.ts`                | flow                              | 1 core                  | §14.10 |
| 43    | `tests/e2e/tier2/import-apkg.test.ts`             | flow                              | 1 core                  | §14.10 |
| 44    | `tests/e2e/tier3/world-economy.test.ts`           | flow                              | 1 core                  | §14.10 |
| 45    | `tests/e2e/tier3/dialectic-flow.test.ts`          | flow                              | 1 core                  | §14.10 |
| 46    | `tests/e2e/tier3/workload-rebalance.test.ts`      | flow                              | 1 core                  | §14.10 |
| 47    | `tests/e2e/tier3/palace3d-crud.test.ts`           | flow                              | 1 core                  | §14.10 |
| 48    | `tests/e2e/tier3/images-flow.test.ts`             | flow                              | 1 core                  | §14.10 |
| 49    | `tests/e2e/tier4/ai-streaming.test.ts`            | flow                              | 1 core                  | §14.10 |
| 50    | `packages/db/tests/rules-guard.test.ts`           | rule 7/8 structural guards        | 2                       | §10.3  |

≈50 new test artifacts, ~330 asserted cases.

## Appendix P — audit raw data: marker scan per-file tables

Faithful reproduction of the audit's scan tables (the real-signal entries; the ~211 benign `placeholder=` UI attributes are summarized per file by count).

### P.1 packages/core

| file:line                                       | kind | snippet                                                                                             |
| ----------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| packages/core/src/ai/prompts.ts:164             | doc  | `Each card: the full sentence with exactly one "____" placeholder` — cloze prompt spec              |
| packages/core/src/curriculum/lhcf/publish.ts:9  | doc  | `JSON Schema (draft 2020-12) of the LHCF input`                                                     |
| packages/core/src/curriculum/lhcf/publish.ts:49 | doc  | `Copy the prompt below and replace the \`<…>\` placeholders`                                        |
| packages/core/src/knowledge-graph/index.ts:8    | doc  | `must temporarily pause dependent units until prerequisite stability improves` — graph decay policy |
| packages/core/src/notes.ts:12                   | doc  | `Tana-style typed note template: fields with placeholder hints`                                     |
| packages/core/src/notes.ts:17                   | doc  | `field name → placeholder/expected content`                                                         |
| packages/core/src/ideas.ts:252                  | data | `{ label: 'First working draft / prototype', done: false }` — checklist template row                |
| packages/core/tests/cards.test.ts:242           | test | `strips bullet markers and falls back to front-only basic with valid placeholder`                   |
| packages/core/tests/ai-transport.test.ts:149    | test | `extractJson('xxx {"a": [1, 2} yyy')` — garbage-input fixture                                       |
| packages/core/tests/notes.test.ts:84-94         | test | `bullets = parseBullets('...alpha...beta...')` — fixture                                            |
| packages/core/tests/sentence-mining.test.ts:34  | test | `produces one draft per minable sentence` — ClozeDraft type                                         |
| packages/core/tests/spatial.test.ts:37          | test | `title: 'Concept Beta'` — fixture                                                                   |

### P.2 packages/db

| file:line                                                    | kind               | snippet                                                                                   |
| ------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------- |
| packages/db/src/driver/sqlite-wasm.ts:495                    | justified disable  | `eslint-disable-next-line no-this-alias -- mirrors better-sqlite3's transaction.js shape` |
| packages/db/tests/review-service.test.ts:471                 | negative type test | `@ts-expect-error grade must be 1-4`                                                      |
| packages/db/src/migrations/025-cognitive-upsert-keys.ts:2,5  | documented shim    | repairs DBs created from a pre-release draft of 024                                       |
| packages/db/src/repos/audio.ts:67                            | doc                | back-compat note for legacy `{ front, back }` rows                                        |
| packages/db/src/sync.ts:1104                                 | code               | `Keep existing secret when empty or masked placeholder is submitted`                      |
| packages/db/tests/search.test.ts:89                          | test               | `searchAll(db, 'zzzqqqxxx')` — no-hits query                                              |
| packages/db/tests/sync.test.ts:236,246                       | test               | `title: 'Obsolete Draft'` — tombstone fixture                                             |
| packages/db/tests/transaction.test.ts:26,31                  | test               | `decks.name = 'beta'` — fixture                                                           |
| packages/db/tests/cognitive-expansion-regressions.test.ts:71 | test               | `reads nested card content (basic, cloze) instead of placeholders` — regression proof     |

### P.3 apps/web — benign `placeholder=` attribute counts per file

| File                              | Count                     | File                              | Count   |
| --------------------------------- | ------------------------- | --------------------------------- | ------- |
| app/backup/page.tsx               | 21                        | app/settings/page.tsx             | 15      |
| app/decks/page.tsx                | 21                        | app/reading/page.tsx              | 8       |
| app/curriculum/page.tsx           | 9                         | app/online/page.tsx               | 9       |
| app/focus/page.tsx                | 6                         | app/feynman/page.tsx              | 6       |
| app/motivation/page.tsx           | 8                         | app/quotes/page.tsx               | 5       |
| app/habits/page.tsx               | 6                         | app/ideas/page.tsx                | 4       |
| app/journal/page.tsx              | 3                         | app/tutor/page.tsx                | 2       |
| app/voice-tutor/page.tsx          | 2                         | app/exam-sim/page.tsx             | 1       |
| app/ingest/page.tsx               | 3 (+ PLACEHOLDER map:41)  | app/palace/page.tsx               | 3       |
| app/courses/new/page.tsx          | 5                         | app/courses/course/page.tsx       | 1       |
| app/canvas/page.tsx               | 1                         | app/constellation/page.tsx        | 1       |
| app/mindmap/page.tsx              | 1                         | app/physiology/page.tsx           | 1       |
| app/review/page.tsx               | 2                         | app/search/page.tsx               | 2       |
| app/games/page.tsx                | 2                         | app/graph/page.tsx                | 2       |
| app/notes/page.tsx                | 2                         | app/weekly/page.tsx               | 1       |
| src/components/CardMinerSheet.tsx | 1                         | src/components/CommandPalette.tsx | 1       |
| src/components/QuickHudModal.tsx  | 6                         | src/components/TransportPanel.tsx | 1       |
| src/ui/InkPad.tsx                 | 3                         | src/ui/exercises/inputs.tsx       | 3       |
| src/ui/Feedback.tsx               | 1 (doc: loading skeleton) | app/panic + misc                  | balance |

All are honest input hints / loading states — zero stubs.

### P.4 scripts / docs / infra

| file:line                                              | kind                         | note                                            |
| ------------------------------------------------------ | ---------------------------- | ----------------------------------------------- |
| scripts/new-feature.mjs:18,111,156,163,219,255         | intentional scaffolder TODOs | the product emits TODOs for developers          |
| scripts/adversarial-challenger1-anki.ts:54             | fixture                      | `# TODO: refactor logic` adversarial import row |
| apps/native/src-tauri/gen/android/gradle.properties:24 | generated                    | Tauri regenerates `gen/`                        |
| AGENTS.md:98                                           | doc                          | describes the scaffolder workflow               |
| docs/ai-providers.md:85                                | doc                          | manual-mode placeholder behavior                |
| docs/curriculum/PROMPT.md:16                           | doc                          | prompt template instructions                    |
| README.md:174-180                                      | stale roadmap                | fixed by F-19                                   |

## Appendix Q — docs inventory with drift status

| Doc                           | Covers             | Drift found                                                         | Fixed by                      |
| ----------------------------- | ------------------ | ------------------------------------------------------------------- | ----------------------------- |
| AGENTS.md                     | operating manual   | maps omit worker/extension; nav exception; enforcement table absent | 38, 42, 44                    |
| ARCHITECTURE.md               | architecture       | map omissions; "14 tools"                                           | 38                            |
| README.md                     | product overview   | Deck Doctor promise; stale roadmap; provider table; "14 tools"      | 18 (makes claim true), 37, 38 |
| CHANGELOG.md                  | history            | Deck Doctor mention (claim)                                         | 18                            |
| docs/README.md                | doc index          | needs MASTER-FIX-PLAN + worker doc links                            | 1, 17                         |
| docs/learning-science.md      | research grounding | SDT contradiction; legend numbering                                 | 39                            |
| docs/PLAN-M6-M10.md           | archived plan      | none (verified complete)                                            | —                             |
| docs/PLAN-RESEARCH.md         | research notes     | none                                                                | —                             |
| docs/plan-M19-M21.md          | active plan        | M20/M21 shipped-but-unmarked; missing deliverables                  | 16, 17, 40                    |
| docs/ENGINE-REFERENCE.md      | engines reference  | "45 tables"; optimizer note                                         | 38                            |
| docs/TEST_INFRA.md            | test infra         | missing curriculum-agents, rows.ts, Playwright                      | 35, 44                        |
| docs/native.md                | native guide       | updater note absent                                                 | 3                             |
| docs/ai-providers.md          | AI providers       | none found                                                          | —                             |
| docs/plugins.md               | plugin system      | webhook env cross-ref                                               | 41                            |
| docs/api-server.md            | headless API       | push env missing                                                    | 41                            |
| docs/curriculum/*             | LHCF contract      | none (drift-tested by curriculum-docs.test)                         | —                             |
| docs/adr/0001–0003            | decisions          | none                                                                | —                             |
| docs/worker-self-hosting.md   | _(new)_            | —                                                                   | 17                            |
| docs/plans/MASTER-FIX-PLAN.md | _(this doc)_       | —                                                                   | 1                             |

## Appendix R — schema group commentary

What each schema group is _for_ (context for reviewers of the repo extractions and the doctor/parity work):

- **Content (notes/decks/cards/revlog/images):** the learning corpus. `cards` carries the full FSRS-6 memory state — the reason rule 7 exists. `revlog` is the append-only truth of every review; `revlog_undos` makes undo possible without violating that.
- **Memory systems (palaces, mnemonic_tables):** method-of-loci and major-system aids; the palace-3d scenes table extends this on the cognitive-expansion branch.
- **Reading (sources/highlights/sq3r):** incremental reading queue with SuperMemo-style priority; SQ3R sessions track the five-step method per source.
- **Curriculum (tracks→certificates):** the LHCF import tree plus the mastery model (`skills`, `skill_edges` DAG, `mastery`, `elo_events`) — the F-01 battleground.
- **Human systems (goals/habits/journal/quotes/ideas):** the motivation-and-reflection layer; mostly single-handler CRUD today (F-13 batches B1/B2/B4/B5).
- **Motivation (xp_events/quests/streaks/achievements/elo_events):** the reward economy — XP centralization (F-03) lives here.
- **Addiction helper (focus\_*/friction/distraction/ifthen/routines):** the focus-lock machinery; the extension's friction capture (F-10) writes into the same append-only `friction_events`.
- **Physiology (physio_log):** sleep/exercise/caffeine self-report feeding the Yerkes-Dodson advice engine.
- **AI/canvas (user_settings/canvases/chat_sessions):** preferences (incl. the F-06 haptics column) and AI chat persistence.
- **Infra (push/study_plans/schema_migrations/sync\_*/reminders/mindmaps/attempt_images):** plumbing; `schema_migrations` is runner-owned and must never gain a repo.
- **Online/audio/power/graph/social/world:** the social, audio-scheduling, quick-capture, concept-graph, guild, and forest-economy surfaces — each already repo-backed except where F-13 targets.
- **Cognitive expansion (dag/telemetry/palace3d/dialectic/exposure):** this branch's new tables; all repo-backed, telemetry append-only.

## Appendix S — representative route traces (the wiring pattern)

Five routes traced end-to-end at audit time, demonstrating the four-layer pattern every new route in this plan must follow (handler → shim → registry → UI). New routes (decks/doctor) copy this exactly.

### S.1 `POST /api/review` (the grading path)

```
UI:      app/review/page.tsx:…        apiSend('/api/review', { cardId, grade, … })
shim:    app/api/review/route.ts      export { POST } from '@/server/handlers/review/route'
registry:src/hub/handlers-registry.ts  import * as review from '../server/handlers/review/route'
                                      add('review', review)
handler: src/server/handlers/review/route.ts
         withRoute-wrapped POST; zod via readJson; calls executeReview (packages/db/src/review-service.ts)
         → FSRS state + revlog + xp_events + elo (canonical path; rule 7)
tests:   apps/web/tests/cognitive-expansion-routes.test.ts, e2e tier1/api-review
native:  same handler via hub worker (registry is the native backend too)
```

### S.2 `GET/POST /api/decks` (CRUD + repo-backed)

```
UI:      app/decks/page.tsx           apiGet('/api/decks'), apiSend('/api/decks', {…})
shim:    app/api/decks/route.ts       export { GET, POST } from '@/server/handlers/decks/route'
registry: add('decks', decks)
handler: decks/route.ts               GET uses repos/learning readers; POST writes inside withTransaction
tests:   routes-smoke (import), e2e tier1/api-decks-cards
```

### S.3 `POST /api/curriculum/practice` (the sanctioned rule-7 comment)

```
UI:      ui/exercises/ExercisePractice.tsx:59-104   apiSend('/api/curriculum/practice', { …, pretest })
shim:    app/api/curriculum/practice/route.ts
registry: add('curriculum/practice', …)
handler: curriculum/practice/route.ts:25,37-41   honors pretest (exempts Elo/BKT); routes mastery
         writes through the grading path; carries the explicit Rule-7 comment
tests:   tests/curriculum-api.test.ts
```

### S.4 `GET /api/calendar.ics` (the deliberate alias)

```
UI:      consumed externally (calendar subscription URL) — the one registry key with no in-app caller
shim:    app/api/calendar.ics/route.ts   export { GET } from '@/server/handlers/calendar/route'
registry: add('calendar.ics', calendar)  ← key differs from folder name; documented exception
handler: calendar/route.ts               ics format from core/ics + study-plan
tests:   P3 commit 34 suite (§16 calendar row)
```

### S.5 The trace for the NEW route (`decks/doctor`, F-12)

```
UI:      app/decks/page.tsx           apiGet('/api/decks/doctor?deckId=…'), apiSend('/api/decks/doctor', {…})
shim:    app/api/decks/doctor/route.ts  export { GET, POST } from '@/server/handlers/decks/doctor/route'
registry: import * as decksDoctor from '../server/handlers/decks/doctor/route'
         add('decks/doctor', decksDoctor)   ← hub-registry.test enforces the add() exists
handler: decks/doctor/route.ts          GET: repos read + diagnoseDeck (core); POST: withTransaction + zod actions
tests:   apps/web/tests/decks-doctor.test.ts + packages/core/tests/doctor.test.ts
native:  automatically available — the registry IS the native backend
```

The invariant worth internalizing: **registering a handler is simultaneously the web route and the native route** — the hub-registry test fails if either layer drifts. This is why F-08's "dead endpoint" findings are purely UI gaps, never native gaps.

## Appendix T — per-page UI audit (43 pages)

One entry per page: purpose, primary action, key endpoints (✔ traced in Appendix B), and audit observations. Observations marked →F-xx feed the findings.

| Page                   | Purpose                                                   | Primary action  | Observations                                       |
| ---------------------- | --------------------------------------------------------- | --------------- | -------------------------------------------------- |
| `/` (dashboard)        | today's hub: due counts, streak, widgets                  | review now      | widgets call starter/timeline/insights/plugins ✔   |
| `/analytics`           | aggregate learning stats                                  | —               | →F-08① gains per-deck stats panel                  |
| `/audio-commute`       | circadian commute sessions                                | start session   | ✔; hands-free inputs persisted                     |
| `/backup`              | export/import, E2EE cloud sync, Git/Dropbox/GDrive/WebDAV | sync now        | 21 input hints (benign); passphrase flow ✔         |
| `/canvas`              | freeform visual canvas                                    | draw/write      | ✔ CRUD                                             |
| `/constellation`       | GKT concept drill                                         | drill           | ✔ cognitive/gkt                                    |
| `/courses`             | course list                                               | open course     | links to sub-pages                                 |
| `/courses/new`         | LHCF import wizard (AI prompt or manual)                  | import          | →F-26 nav exception                                |
| `/courses/course`      | course home: modules, progress, exam dates                | continue        | →F-26 nav exception                                |
| `/courses/exam`        | course exam flow                                          | take exam       | →F-26 nav exception                                |
| `/courses/lesson`      | lesson player + exercises                                 | practice        | →F-26 nav exception; pretest honored               |
| `/courses/certificate` | certificate issuance/view                                 | generate        | →F-26 nav exception                                |
| `/curriculum`          | curriculum builder + AI generator                         | add course      | TransportPanel ✔; builder inputs ✔                 |
| `/debate`              | dialectic arena                                           | open debate     | ✔ arena actions                                    |
| `/decks`               | deck + card management                                    | add card        | →F-08② share export; →F-12 Doctor; 21 hints benign |
| `/exam-sim`            | multi-format mock exam simulator                          | start exam      | →F-06 gains haptics                                |
| `/feynman`             | Feynman technique (student + grader)                      | teach           | manual modes ✔                                     |
| `/focus`               | focus lock, pomodoro, friction                            | start focus     | →F-08③ distraction log; friction ✔                 |
| `/games`               | duels, boss battles, leaderboards                         | play            | ✔                                                  |
| `/graph`               | concept dependency graph                                  | view            | →F-08⑥ remedial path                               |
| `/habits`              | habit loops + check-ins                                   | check in        | ✔; →F-14 C1                                        |
| `/ideas`               | idea capture, evolve, council, brainwrite                 | capture idea    | ✔ + TransportPanel ×2                              |
| `/ingest`              | multimodal → cards                                        | ingest          | ✔ multimodal                                       |
| `/journal`             | daily reflection + weekly rollup                          | write entry     | ✔ + TransportPanel                                 |
| `/mindmap`             | mind maps → cards                                         | new map         | ✔ ×3 routes                                        |
| `/motivation`          | WOOP goals, quests, streaks, seasons, commitments         | add goal        | ✔                                                  |
| `/notes`               | typed notes, bullets, wikilinks                           | new note        | ✔                                                  |
| `/online`              | rooms, raids, library, buddies, guilds                    | join room       | ✔ + worker WS                                      |
| `/palace`              | memory palaces                                            | add locus       | ✔                                                  |
| `/palace-3d`           | 3D palace scenes                                          | open scene      | ✔ spatial                                          |
| `/physiology`          | sleep/exercise/caffeine log                               | log today       | ✔; →F-14 C1                                        |
| `/planner`             | study plan + ICS + reminders                              | regenerate plan | →F-08④ engagement %                                |
| `/quotes`              | quote collection + daily quote                            | add quote       | ✔                                                  |
| `/reading`             | incremental reading, SQ3R, highlights, exposure           | add source      | ✔ 5 routes                                         |
| `/review`              | the review session                                        | grade card      | haptics ✔ telemetry ✔ →F-06 setting                |
| `/search`              | FTS + natural-language search                             | search          | →F-09 tips strip                                   |
| `/settings`            | providers, FSRS, themes (incl. E-Ink), sync, push         | save settings   | →F-06 haptics toggle                               |
| `/sleep-tmr`           | TMR sleep cues                                            | schedule        | ✔ tmr/cues                                         |
| `/tutor`               | Socratic tutor with sessions                              | ask             | →F-09 summary manual panel                         |
| `/voice-tutor`         | spoken Socratic tutor                                     | talk            | →F-06 haptics; offline fallback ✔                  |
| `/weakness`            | weakness radar v2                                         | view skills     | ✔ weakness-v2                                      |
| `/weekly`              | weekly review + AI coach                                  | review week     | ✔ transport envelope                               |
| `/world`               | forest economy, avatar, market                            | tend forest     | ✔ 7 routes                                         |

Pattern across the audit: every page's endpoints resolve; the only page-level issues are the F-08/F-09/F-12/F-26 items above. No broken links, no unreachable primary actions, no dark patterns (one primary action per screen holds everywhere).

---

_End of MASTER-FIX-PLAN.md — 26 findings, 44 planned commits, 5 phases, with commit-level runbooks (§13), enumerated test specifications (§14), per-domain references (§15), code sketches (§19), wireframes (§20), validation scripts (§21–22), impact maps (§23, Appendix O), schedule and alternatives (§32–33), and full codebase inventories (Appendices A–T). Generated from the 2026-11-08 full project audit; execution status tracked via the commit sequence in §6.2._

_End of document — 5,000+ lines, 26 findings, 44 planned commits, 5 phases, appendices A–AH. Ready for execution per §6.2._
