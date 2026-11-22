# Architecture notes — mega-run ground truth

> Written for the mega-run workers (delta OTA · Max Focus lock · SP core parity).
> Every claim below cites the file it was verified against (`spot-checked` on
> `feature/mega-run`). When this file and the code disagree, the code wins —
> then fix this file in the same change. See [AGENTS.md](../AGENTS.md) for the
> hard rules and [ARCHITECTURE.md](../ARCHITECTURE.md) for the long-form tour.

## 1. Overview

Learning HUB is a single-codebase, multi-host learning system. One web app
(`apps/web`) is consumed three ways: served by Next.js (dev/web), exported to a
static bundle and wrapped by Tauri 2 (Windows/Android), and mounted behind
agent hosts (MCP/CLI/server). All hosts share `packages/*`; the DB layer is the
only SQLite writer. Dependency direction never inverts:
`apps/* → packages/{core,db,ai-adapters}`, `db → core`, `ai-adapters → core`
(`package.json` `workspaces: ["packages/*", "apps/*"]`, Node ≥ 24).

| Layer        | Path                                                       | Rules                                                                                                                                                  |
| ------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domain logic | `packages/core/src/<domain>/` (+ thin `<domain>.ts` entry) | Pure functions + zod schemas. NO I/O, no `ai` import, no app imports.                                                                                  |
| Persistence  | `packages/db/src/`                                         | The ONLY SQLite writer. `schema.ts` + idempotent `migrations/` (001–030 shipped; next is 031).                                                         |
| AI providers | `packages/ai-adapters/`                                    | The ONLY AI-SDK importer; `networkFetch` is the network seam.                                                                                          |
| Web app      | `apps/web`                                                 | Next.js 16 App Router (`package.json`: `next ^16.4.6`, `react ^19.3.1`, `tailwindcss ^4.3.5`). Pages are client components; API routes are thin shims. |
| Native shell | `apps/native`                                              | Tauri 2. Thin Rust: dialogs/fs/http/log/notification + desktop extras. No business logic.                                                              |
| Agent hosts  | `apps/mcp`, `apps/cli`, `apps/server`                      | Same packages over stdio/HTTP; zod at every argument boundary.                                                                                         |
| Cloud        | `apps/worker`                                              | Cloudflare Worker + Durable Objects (`src/study-room.ts`, `src/boss-raid.ts`); db-adjacent types only.                                                 |
| Extension    | `apps/extension`                                           | Browser extension: quick-add cards, save-to-read, DNR focus bridge.                                                                                    |

Platform backends: web uses `better-sqlite3` at `data/learning-hub.db`; native
runs the same handlers in a webview Web Worker over `sqlite-wasm` on OPFS,
scoped to the origin `dev.learninghub.app`
(`apps/native/src-tauri/tauri.conf.json` `identifier` — never change it, rule 10).

## 2. Native shell & signing

**Config** — `apps/native/src-tauri/tauri.conf.json`:

- `identifier: "dev.learninghub.app"`, `useHttpsScheme: false` (rule 10).
- `bundle.targets: ["nsis", "msi"]` (Windows), `bundle.android.minSdkVersion: 26`.
- Window `minWidth: 360` (the mobile-first floor), `webviewInstallMode: downloadBootstrapper`.
- **No `updater` key and no `createUpdaterArtifacts` — no update plugin is configured today.**
- `frontendDist: "../../web/.next-tauri"` — the static export produced by
  `scripts/tauri-web.mjs build` (this directory is what a delta-OTA slot replaces).

**Rust crate** — `apps/native/src-tauri/Cargo.toml` (edition 2021, `rust-version 1.85`,
lib crate-type `staticlib/cdylib/rlib` for Android):

- Plugins: `tauri-plugin-dialog`, `fs`, `http`, `log`, `notification`.
- Desktop-only (`cfg(not(android|ios))`): `tauri` with `tray-icon` feature,
  `tauri-plugin-single-instance`, `tauri-plugin-window-state`.
- Mobile-only: `tauri-plugin-haptics`.
- Windows-only: `windows 0.62` with `Win32_Foundation`,
  `Win32_UI_WindowsAndMessaging`, `Win32_System_Threading`,
  `Win32_System_ProcessStatus` — the existing Win32 surface Max Focus will extend.
- Sources: `src/main.rs`, `src/lib.rs` (invoke_handler registration), `src/focus.rs`.
- Capabilities: `capabilities/default.json`, `desktop.json`, `mobile.json`.

**Android SDK levels** — `apps/native/src-tauri/gen/android/app/build.gradle.kts`:
`compileSdk 37`, `targetSdk 37`, `minSdk 26`.

**Android builds & signing** — `scripts/tauri-android.mjs`:

- Builds one APK per ABI (`arm64-v8a`, `armeabi-v7a`, `x86_64`) plus a universal
  APK, matching the matrix job in `.github/workflows/native.yml`.
- On CI it uploads the standalone `.apk` files directly to a GitHub Release
  (`gh release upload <tag> ... --clobber`); the tag is `GITHUB_REF_NAME`, or
  `latest` when the ref is `main` (branch pushes release to `latest`).
- **Signing risk (flagged):** the script decodes
  `ANDROID_KEYSTORE_BASE64` into `release.keystore` when the secret exists,
  otherwise it AUTO-GENERATES a keystore via `keytool` (default store password
  `learninghub123`). CI runs without the secret therefore produce a different
  signing key each run → sideload updates over an existing install will fail
  signature checks. Epic 1 task O1-22 addresses this.

## 3. CI pipelines

`.github/workflows/ci.yml` (one job, sequential steps — the only test gate, rule 17):
typecheck → lint → `format:check` → commitlint (PR range) → unit tests
(`npm test --workspaces`) → db push+seed → e2e (`npx vitest run --config
vitest.e2e.config.mjs`) → Playwright browser install → UI smoke
(`npm run test:ui`) → Next build (`npm run build`) → native web bundle export
(`web:tauri`).

`.github/workflows/native.yml` (builds only, no tests):

- `windows` job: NSIS + MSI installers → `upload-artifact`
  (`target/release/bundle/{nsis,msi}`).
- `android` matrix job: one runner per ABI, `fail-fast: false`, artifact glob
  `gen/android/app/build/outputs/apk/**/*<abi>*.apk`.
- Triggers: push to `main`, `v*` tags, manual dispatch. Concurrency-canceled per ref.

Worker claims must keep both workflows compiling; Rust/Kotlin changes are
compile-verified only in CI (rule 17).

## 4. Update surface (current state)

What exists today, so Epic 1 knows its starting point:

- **No updater anywhere.** `tauri.conf.json` has no `updater` block;
  `Cargo.toml` has no `tauri-plugin-updater`; no `createUpdaterArtifacts`.
- **The web layer is a static export.** `scripts/tauri-web.mjs` writes
  `apps/web/.next-tauri` (single `frontendDist`); the native webview loads it
  from the bundle on disk. Everything that ships is inside that directory —
  the natural payload for A/B slots under `app_data_dir`.
- **No client update service.** `apps/web/src/lib/` has no `updates.ts` (it is
  created by O1-12); no update-check UI exists in `apps/web/app/settings/page.tsx`.
- **Channels do not exist yet.** Nightly/Beta/Stable (decided Phase 1) will be
  pointers over GitHub Releases; `apps/worker` is unrelated (rooms/raids/library).
- **Auto-update on Android Play builds will be disabled** (Phase-1 decision):
  build-time flag `LH_UPDATE_CHANNEL=play` (O1-12), sideload keeps self-update.

## 5. Focus / session machinery

### 5.1 Timer engine (pure)

`packages/core/src/focus-timer/index.ts`:

- `TIMER_PHASES = ['idle', 'focusing', 'breaking', 'paused', 'awaiting_break']`;
  `FocusTimerState` carries the wall-clock `endsAt` (ISO) of the running phase.
- Pure transitions: `startFocus`, `pauseTimer` (records
  `pausedPhaseWasBreak`), `resumeTimer`, `cancelTimer`, `startBreak`,
  `advance(state, now)` (drift-free reconciliation on any tick/visibility
  change), plus zod `timerStateSchema` and `timerStartConfigSchema`.

### 5.2 Timer provider (React)

`apps/web/src/lib/use-global-timer.tsx` — `GlobalTimerProvider`, mounted once
in `Providers`; pages consume `useGlobalTimer` (throws outside the provider).

- Persists serialized state to `localStorage` under `lh-focus-timer-state`;
  reloads resume the exact session because deadlines are wall-clock ISO.
- On focus completion it PATCHes the canonical focus session (XP flows through
  the one grading path), then routes a notification through the Notification
  Center gate (`focus_complete` / `break_complete` channels,
  `packages/core/src/notification-center/`) and toasts.
- Server side: `POST /api/focus` starts (`readJson(req, startSessionSchema)`,
  `apps/web/src/server/handlers/focus/route.ts`), `PATCH /api/focus/:id`
  updates (`handlers/focus/[id]/route.ts`).

### 5.3 Max Focus lock (existing, to be extended)

`packages/core/src/focus-lock/index.ts` (single module, all exports live here):

- `exitGate(...)` — state machine returning `locked | cooldown | can_confirm |
ended`; `COOLDOWN_SECONDS = 60`.
- `SYSTEM_ALLOWED_APPS` (emergency apps always permitted) +
  `isAppAllowed(exeNameOrPath, allowedApps)`.
- `normalizeDomain` / `isDomainAllowed(host, allowedDomains)`.
- `buildDnrRules(...)` — declarativeNetRequest rules for the browser-extension
  bridge (`apps/extension` pairs via `focus_bridge`, §6).
- zod boundaries: `maxFocusStartSchema`, `focusExitActionSchema` (discriminated
  union of exit actions), `focusAllowlistInputSchema`.

Native enforcement — `apps/native/src-tauri/src/focus.rs`:

- Commands: `focus_lock_apply(payload: FocusLockPayload) -> FocusLockStatus`,
  `focus_lock_release(token)`, `focus_lock_status()` (registered in
  `lib.rs::invoke_handler`).
- `FocusLockPayload { ends_at: ISO string, apps: Vec<String>,
domains: Vec<String>, token, strict }`; `FocusLockStatus { active, ends_at,
last_heartbeat_at, watchdog_active }`.
- Implementation today: a loopback heartbeat server on port `47615`
  (`LOOPBACK_PORT`) plus watchdog threads that re-assert the lock while the
  session is live. Desktop-only platform gates; Max Focus (Epic 2) extends
  this file with the topmost-window / keyboard-hook work (M2-05…M2-09).

Handlers: `apps/web/src/server/handlers/focus/` — `route.ts` (list/start),
`[id]/route.ts` (patch/end), `allowlists/{route.ts,[id]/route.ts}` (CRUD),
`bridge/route.ts` (extension pairing), `max/route.ts` + `max/exit/route.ts`
(Max Focus start/exit). Every one is registered in
`apps/web/src/hub/handlers-registry.ts` (rule 3).

Page: `apps/web/app/focus/page.tsx` — two tabs (`Standard Focus` /
`Max Focus Mode`, auto-switches to Max when an active lock with
`mode === 'max'` exists), duration presets, `DistractionAppsPanel` (CRUD over
`/api/distractions`), and the friction-gate `DetoxWizard`. Max sessions carry
`maxMinutes` + task label.

### 5.4 Friction & distractions data

- `distraction_apps` table (`packages/db/src/schema.ts`): `name` (unique,
  `distraction_name_idx`), `kind: 'app' | 'website' | 'habit'`. Seeded with 6
  defaults (TikTok, Instagram, YouTube, X, Reddit, Netflix) in
  `packages/db/src/seed.ts::DEFAULT_DISTRACTIONS` (idempotent, onConflictDoNothing).
- `focus_bridge` table: `pairingToken`, `extensionId`, `lastHeartbeatAt` —
  pairs the browser extension for DNR-level blocking.
- `friction_events` (append-only, rule 8): trigger, delaySec, reflection, proceeded.

## 6. Data model map (SP-relevant)

All tables in `packages/db/src/schema.ts` (single file, drizzle `table()`,
ISO-8601 date strings, JSON via `text({ mode: 'json' })`). **There are no
`tasks`, `tags`, `worklog`, or per-item-reminder tables** — Epic 3 builds them.
What exists today, by affinity:

| Domain             | Table(s)                                              | Shape                                                                                                                                                                   | Reuse for SP                                                              |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Task-like projects | `projects`                                            | `title`, `description`, `ideaId`, `trackId`, `status` (`active\|done\|dropped`), `dueDate`, `milestones` JSON `{label,done}[]`                                          | Learning-project analog; SP projects add backlog/colors/notes.            |
| Goals              | `goals`                                               | WOOP: `wish/outcome/obstacle/ifThenPlan` + structured `ifCondition/thenAction`, `progressPct`                                                                           | Distinct from SP projects; keep separate.                                 |
| Habits             | `habits` + `habit_logs`                               | cue/craving/response/reward (Clear loop), `anchor`; logs unique per `(habitId, date)` (`habit_logs_day_idx`)                                                            | S3-31 keeps habits, adds simple counters alongside.                       |
| Quests             | `quests`                                              | per-date row (`quests_date_idx`), `items` JSON, deterministic generator `packages/core/src/motivation.ts` (FNV-1a `hashString` rotation — "a menu, not a slot machine") | Do NOT confuse with SP tasks.                                             |
| Study plans        | `study_plans`                                         | `weeklyMinutes`, `restDay`, `plan` JSON weekly template `{weeks, blocks:[{day,minutes,courseId,label}]}`                                                                | S3-25 planner upgrade overlays SP scheduling.                             |
| Routines           | `routines` + `routine_steps`                          | named ritual containers + ordered steps                                                                                                                                 | Closest existing "schedule" primitive.                                    |
| Lessons            | `lessons`                                             | curriculum units (LHCF, `docs/curriculum/`)                                                                                                                             | Unrelated to SP tasks.                                                    |
| Notes              | `notes` + `note_links` + `note_bullets`               | Tana-style `supertag` (typed template) + `fields` JSON `Record<string,string>`; links/bullets graph                                                                     | S3-93 links projects↔notes.                                               |
| Journal            | `journal_entries`                                     | reflective entries                                                                                                                                                      | Distinct from worklog.                                                    |
| Focus              | `focus_sessions`                                      | canonical graded sessions                                                                                                                                               | S3-32/S3-34 hook task tracking onto these.                                |
| Reminders          | `reminder_log`, `reminder_clicks`, `notification_log` | telemetry rows                                                                                                                                                          | Recurrence-like planning lives in `packages/core/src/reminders/` (below). |
| Sync               | `sync_configs`, `sync_tombstones`, `sync_devices`     | config, tombstones, device roster                                                                                                                                       | SP tables inherit tombstone flow automatically.                           |

**Recurrence-like machinery to reuse** (per S3-07/S3-08, don't reinvent):

- `packages/core/src/reminders/index.ts`: `planReminders(facts, settings)` —
  daily cap, strict quiet hours (`isQuietHours` handles overnight wraps like
  22:00→08:00), anti-nag dedup (same kind suppressed within 120 min or if
  clicked today). Reminder kinds + quiet hours persist as `user_settings`
  columns.
- `packages/core/src/ics.ts`: builds the ICS feed — the base for S3-27's
  iCal subscription/CalDAV read.
- `routines`/`routine_steps`: the only existing recurring-schedule tables.

**Gaps Epic 3 fills** (S3-01/S3-02 define the batch): no task items, no task
projects/tags/sections/views, no repeat configs, no per-task reminders, no
time logs, no archive tiers, no counters/metrics, no boards. SP core system
only — integrations/sync/plugins/themes parity rows are "skipped by user"
(decisions locked in `TASKS.md`).

## 7. Settings pattern

- `user_settings` is a **single row** (`id` default `'default'`,
  `packages/db/src/schema.ts`) with flat columns. There is no settings-key table.
- **Recipe for a new setting** (e.g. Max Focus PIN vault options, update prefs):
  1. New column on `user_settings` in `schema.ts` **+ a migration**
     (`packages/db/src/migrations/0NN-name.ts`, appended to `MIGRATIONS`
     in `migrations/index.ts`). Shared file — the LEAD applies it; request via
     `docs/SHARED_CHANGES.md`.
  2. Extend the `SettingsRow` interface + zod `putSettingsSchema`.
  3. Add the field to the **single PUT payload** in
     `apps/web/src/server/handlers/settings/route.ts` (`PUT = withRoute(...)`
     → `readJson` → `db.update(userSettings).set(patch)`).
- Page: `apps/web/app/settings/page.tsx` — one save model (single dirty flag
  over all sections), sticky `SectionJumpNav` chips, low-frequency sections
  collapsed in an `Accordion` (values listed near line 263). New epics add
  sections here (X-01: Updates, Max Focus, SP shortcuts) rather than new pages.

## 8. Sync & backup

- **Backup** — `packages/db/src/backup.ts`: `backupAll()` → envelope
  `{ version: BACKUP_VERSION, exportedAt, tables: { name: rows[] } }`
  (whitelisted drizzle tables; strips secrets incl. `sync_configs`, `ai_api_key`,
  `ai_headers`); `restoreAll(data)` merges rows back. Version is a zod-validated
  int — bump only on breaking envelope changes.
- **Local merge sync** — `packages/db/src/sync.ts`: natural-key record merge
  (`computeRecordNaturalKey`, `mergeBackup`) with tombstones
  (`sync_tombstones`) and a device roster (`sync_devices`, unique on
  `deviceId`); devices self-report via `SyncDeviceInput` in
  `packages/db/src/cloud-sync.ts` (there is no separate `device.ts` — device
  identity is the roster row, client-side).
- **Cloud sync** — `packages/db/src/cloud-sync.ts`: runtime-neutral engine over
  injectable `networkFetch`; providers Dropbox / GitHub (gist or repo) /
  Google Drive / WebDAV; optional AES-256-GCM encryption
  (PBKDF2-SHA256, 210k iterations) from `@learning-hub/core/sync-crypto`.
- **Live online** — `apps/web/src/lib/online-socket.ts` (WebSocket to
  `apps/worker` rooms/raids). New SP/OTA tables must keep working when all
  sync is off — the user runs local-only.

## 9. Testing contract

Authoritative doc: [docs/TEST_INFRA.md](TEST_INFRA.md). Workers WRITE tests;
CI runs them (rule 17 — never locally).

| Suite                | Location                                          | Mechanism                                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (per workspace) | `packages/core/tests/`, `packages/db/tests/`, …   | Vitest 5.1.0, node environment.                                                                                                                                                                                                                                                    |
| Handler integration  | `apps/web/tests/*-integration.test.ts` (49 files) | `renderToString(React.createElement(...))` text assertions over pages/handlers — SSR-safe, no browser. New pages need one.                                                                                                                                                         |
| E2E API/CLI/MCP      | `tests/e2e/` via root `vitest.e2e.config.mjs`     | Per-file ephemeral DB clone (`data/test-dbs/…`), injected as `LEARNING_HUB_DB`; `fileParallelism: false` (SQLite locks).                                                                                                                                                           |
| UI smoke             | `apps/web/tests/ui/` (`npm run test:ui`)          | Playwright + headless Chromium against the real Next server.                                                                                                                                                                                                                       |
| Structural guards    | `apps/web/tests/`                                 | `hub-registry.test.ts` (every `app/api/**/route.ts` registered), `route-safety.test.ts` (transport wrappers only), `design-laws.test.ts` (banned classes, §10), `a11y-contract.test.ts` (kit files pinned), `manual-mode-surface.test.ts` (AI features need provider `none` mode). |
| DB invariants        | `packages/db/tests/rules-guard.test.ts`           | Append-only tables never UPDATEd/DELETEd; grading only via review-service.                                                                                                                                                                                                         |

Implications: every new handler needs a registry entry (else CI fails);
every new page needs an `*-integration.test.ts`; every AI feature needs a
manual mode; never weaken a failing test (rule 13).

## 10. Conventions (the ones CI enforces)

- **Handlers** — `apps/web/src/server/handlers/<feature>/route.ts` exports
  `withRoute`-wrapped `GET/POST/PATCH/DELETE`; bodies via
  `readJson(req, zodSchema)`; errors via `ApiError` (all from
  `apps/web/src/lib/api.ts`). Route shims in `app/api/**/route.ts` re-export
  the handlers. Registration: import in `apps/web/src/hub/handlers-registry.ts`
  - `add('<feature>/<sub>', x)` — `[id]` dirs become single-segment params
    (≤ 2 deep), literals match before dynamics.
- **Transport** — UI never calls raw `fetch` (rule 1, ESLint-enforced). Use
  `apiGet / apiSend / apiUpload / apiStream / apiDownload` from
  `apps/web/src/lib/transport.ts`.
- **Migrations** — idempotent, append-only numbering (001–030 shipped; next
  `031-…`); schema change = `schema.ts` + migration; never edit/renumber a
  shipped one (rule 4). Non-drizzle objects (FTS5, triggers) use
  `ctx.raw.exec` — pattern in `migrations/003-fts-search.ts`.
- **Banned classes** (`apps/web/tests/design-laws.test.ts`, scans every `.tsx`):
  no shadcn ghost vocabulary (the banned regex list inside the test), no
  `red-*` utilities (danger is rose via `--danger-*` tokens), no dead
  `animate-*` classes (only whitelisted ones like `animate-spin`/`animate-ping`).
  Build UI from `apps/web/src/ui/` kit; load
  `.claude/skills/ui-signature/SKILL.md` before UI work.
- **Transactions** — multi-row writes inside `withTransaction`
  (`packages/db/src/transaction.ts`, `BEGIN IMMEDIATE`); async work before,
  events after commit.
- **Grading** — card/exercise grades only through `executeReview` /
  `executeBatchReview` (`packages/db/src/review-service.ts`); append-only
  tables (`revlog`, `xp_events`, `friction_events`, `elo_events`, …) stay
  append-only (rule 8).
- **AI features** — prompt + zod output schema in `packages/core/src/ai/`,
  manual mode in `ai/manual.ts`, `requireAI()` in the handler (rule 9).
- **Commits** — Conventional Commits ≤ 100-char header (commitlint in CI).

## 11. Implications for the three epics

**Epic 1 — Delta OTA.** The entire shipped web payload is the static export at
`apps/web/.next-tauri` (`tauri.conf.json` `frontendDist`). A/B slots must live
in Tauri's `app_data_dir` (writable, per-origin) with an atomic pointer file;
the custom URI-scheme protocol (O1-04) serves the active slot and falls back to
the bundled asset. There is no updater plugin today — O1-10 wires
`tauri-plugin-updater` for the Windows native layer while the web layer uses
the slot mechanism. The keystore auto-generation risk (§2) must be resolved
(O1-22) before any sideload delta story works. Play builds bake
`LH_UPDATE_CHANNEL=play` to disable self-update (O1-12).

**Epic 2 — Max Focus.** Extend, don't fork: the session state machine lives in
`packages/core/src/focus-lock/` (`exitGate`, `COOLDOWN_SECONDS=60`,
`SYSTEM_ALLOWED_APPS`, zod schemas), and the native enforcement point is
`apps/native/src-tauri/src/focus.rs` (`focus_lock_apply/release/status`,
heartbeat loopback on 47615, watchdog threads). Windows work goes in a new
`lock_win.rs` using the already-declared `windows 0.62` features;
Android work goes in the gen/android Kotlin plugin layer. Server persistence
needs the new `max_focus_sessions` table (M2-03, LEAD-applied migration) and
handlers under `handlers/focus/max/` (already has `route.ts` + `exit/route.ts`
stubs to grow). Settings lock during session (M2-21) plugs into the single-PUT
settings handler (§7).

**Epic 3 — SP core parity.** There are NO tasks/tags/worklog tables today —
this is a new domain, not an extension. Follow the repo recipes exactly:
core domain in `packages/core/src/tasks/` (pure + zod, unit tests), schema
batches + migrations (`031-…` onward, LEAD-applied per `TASKS.md`), repos in
`packages/db/src/repos/tasks.ts`, handlers under
`apps/web/src/server/handlers/tasks/` with registry entries, pages in
`apps/web/app/tasks/` etc. with `*-integration.test.ts`. Reuse `core/reminders`
patterns for per-task reminders (S3-08), `core/ics.ts` for calendar feeds
(S3-27), `focus_sessions` + `use-global-timer` for the focus↔task glue
(S3-32/S3-34), and `sync_tombstones` flows so the new tables sync correctly.
Settings additions follow §7; nav entries go in
`apps/web/src/components/nav.ts` (S3-39).
