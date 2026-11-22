# SHARED_CHANGES — lead-applied file requests

Workers never edit shared files (`schema.ts`, `migrations/index.ts`,
`apps/web/package.json`, `tauri.conf.json`, `Cargo.toml`, `native.yml`,
settings columns, matrix doc). Append requests below; the lead applies them
in batches. Format: `[task] file → change → why`.

## Status (X-02 reconciliation pass)

**Every request below is APPLIED and verified in the tree** (migration
`034-sp-task-columns` + `035-task-fts`, Cargo crates, tauri.conf updater
wiring, native.yml guards/test/delta steps — each marked with its
verification). **Nothing is pending.** For the record, two later-scope
requests were folded into the affected tasks instead of shared files:
S3-74 project bookmarks persist device-local
(`apps/web/src/lib/project-bookmarks.ts`) and S3-76 trash persistence is
handler-side (W2) — both note a LEAD migration option in their handoffs.

## Requests
- [S3-33] apps/native/src-tauri/Cargo.toml → OPTIONAL upgrade (current code compiles WITHOUT it): idle.rs binds GetLastInputInfo/GetTickCount via self-contained externs. If the kit owner prefers crate bindings, add "Win32_UI_Input_KeyboardAndMouse" and "Win32_System_SystemInformation" to the windows features array and swap the externs for windows::Win32 imports.

- [O1-22] `.github/workflows/native.yml` → add a fail-fast guard step in the
  → **APPLIED** — native.yml fail-fast guard (lines 115-117).
  `android` matrix job (before the build) that exits with an error when
  `ANDROID_KEYSTORE_BASE64` is unset, so CI cannot silently auto-generate a
  new keystore and break sideload-update signatures. Exact YAML proposed in
  `docs/updates.md` §"Android signing — keystore persistence (O1-22)".

- [O1-02] `apps/native/src-tauri/Cargo.toml` → add three `[dependencies]` lines
  → **APPLIED** — `minisign-verify`, `sha2`, `ureq` all present in Cargo.toml.
  (this supersedes the earlier draft request that existed before O1-02 was
  claimed [~W1] and coded in `src/update.rs`):
  `minisign-verify = "0.2"`, `sha2 = "0.10"`,
  `ureq = { version = "2", default-features = false, features = ["tls"] }`.
  NO `hex` crate (update.rs hand-rolls lowercase hex) and NO plugin-http use
  on the Rust side (its `tauri_plugin_http::reqwest` re-export is async-only;
  the updater needs a blocking, timeout-bound client that is unit-testable
  without a tauri runtime — hence ureq, per the O1-02 brief "ureq or use
  plugin http"). Without these crates `src/update.rs` cannot compile and the
  native CI job fails.

- [O1-10] `apps/native/src-tauri/tauri.conf.json` → when wiring
  → **APPLIED** — `plugins.updater` block live in tauri.conf.json (updater key at line 53) with the committed pubkey.
  `tauri-plugin-updater`, set `plugins.updater.pubkey` to the exact contents of
  `apps/native/src-tauri/keys/lh-update.key.pub` (committed, key id
  `DB675CE9C8F2082D`) and `plugins.updater.endpoints` to the channel-pointers
  URLs (see docs/updates.md §"Channels & pointer model"): e.g.
  `https://github.com/Agono0/learning-hub/releases/download/channel-pointers/nightly.json`
  (per channel / store flavor). Why: O1-09 generated the keypair; the public
  key must be baked into the updater config before any signed nightly is
  shipped.
- [O1-10] remaining LEAD pieces for the updater wiring (worker parts are
  → **APPLIED** — `tauri-plugin-updater = "2"` in Cargo.toml, `createUpdaterArtifacts` + `plugins.updater` + passive `installMode` in tauri.conf.json.
  committed: `lib.rs` inits `tauri_plugin_updater` on desktop,
  `capabilities/desktop.json` grants `updater:default`):
  (a) `apps/native/src-tauri/Cargo.toml` → add `tauri-plugin-updater = "2"`
  under `[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]`
  (desktop-only — Android updates go through the A/B slots / Play, never the
  plugin); (b) `tauri.conf.json` → add `"createUpdaterArtifacts": true` inside
  the `bundle` object (CI then emits `.sig` artifacts next to the NSIS
  installer) and the `plugins.updater` block described in the request above,
  with `"windows": { "installMode": "passive" }` so shell updates install
  without a modal UAC loop (ask-first still applies — the plugin only
  downloads on prompt, installs on restart). Apply (a)+(b) together with the
  pubkey/endpoints request above — partial wiring breaks the desktop build.

- [S3-01] `packages/db/src/schema.ts` → append the SP parity batch A tables
  → **APPLIED** — migration `031-sp-tasks.ts` (schema.ts batch A landed alongside).
  (paste below; mirrors `migrations/031-sp-tasks.ts` exactly — fresh DBs get
  them from schema.ts / runtime DDL, existing DBs from the migration) AND
  register the migration in `packages/db/src/migrations/index.ts`
  (`import { spTasks } from './031-sp-tasks'` + append `spTasks` to
  `MIGRATIONS`). Migration file is already written and tested
  (`packages/db/tests/sp-tasks-migration.test.ts`). Note: link columns
  (`parent_id`, `project_id`, `repeat_cfg_id`, `task_id`, tag link) are plain
  integers + indexes — no drizzle `.references()` — so the hand-written
  migration and the generated DDL stay trivially in sync and repos (S3-15)
  own integrity. Exact paste:

```ts
/** ─── SP parity: task system (S3-01 batch A; Super Productivity model) ─── */

/** SP-parity task projects (S3-05 core): backlog flag, notes, color, archive. */
export const taskProjects = table('task_projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  notes: text('notes'),
  backlogFlag: integer('backlog_flag', { mode: 'boolean' }).notNull().default(false),
  color: text('color'),
  archivedAt: text('archived_at'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** SP-parity tags (S3-06): unique name + color; items link via task_item_tags. */
export const taskTags = table('task_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** SP repeat config (S3-07): cycle d|w|m|y, interval, start/end, skip dates, re-anchor. */
export const taskRepeatCfgs = table('task_repeat_cfgs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cycle: text('cycle').notNull(), // 'd' | 'w' | 'm' | 'y'
  interval: integer('interval').notNull().default(1),
  startDate: text('start_date'),
  endDate: text('end_date'),
  skipDates: text('skip_dates', { mode: 'json' }).$type<string[]>().notNull().default([]),
  reAnchor: text('re_anchor').notNull().default('completion'), // 'completion' | 'scheduled' | 'postponed'
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/**
 * SP-parity task item (S3-03): one nesting level via parent_id; per-day time
 * map; won't-do state; order = list ordinal (habits.'order' house style).
 */
export const taskItems = table('task_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  parentId: integer('parent_id'), // one nesting level (SP subtasks)
  projectId: integer('project_id'),
  title: text('title').notNull(),
  notes: text('notes'),
  priority: text('priority').notNull().default('none'), // 'none' | 'low' | 'medium' | 'high'
  estimateMs: integer('estimate_ms'),
  timeSpentOnDay: text('time_spent_on_day', { mode: 'json' })
    .$type<Record<string, number>>()
    .notNull()
    .default({}), // date (YYYY-MM-DD) → ms tracked that day
  due: text('due'), // YYYY-MM-DD, or full ISO when dueWithTime
  dueWithTime: integer('due_with_time', { mode: 'boolean' }).notNull().default(false),
  deadline: text('deadline'),
  isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
  doneAt: text('done_at'),
  wonthado: integer('wonthado', { mode: 'boolean' }).notNull().default(false), // SP "won't do"
  repeatCfgId: integer('repeat_cfg_id'),
  order: integer('order').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** task_items ↔ task_tags many-to-many (composite PK covers item→tags). */
export const taskItemTags = table(
  'task_item_tags',
  {
    itemId: integer('item_id').notNull(),
    tagId: integer('tag_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.tagId] })],
)

/** SP per-task reminders (S3-08); exact_alarm flags the Android exact-alarm path. */
export const taskReminders = table('task_reminders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull(),
  remindAt: text('remind_at').notNull(),
  type: text('type').notNull().default('at_time'), // 'at_time' | 'relative'
  exactAlarm: integer('exact_alarm', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})
```

`primaryKey` must be imported from 'drizzle-orm/sqlite-core' in schema.ts if
not already (check the existing import line — `uniqueIndex` is already
imported).

- [O1-19] `apps/native/src-tauri/Cargo.toml` → add
  → **APPLIED** — `zip = { version = "2", default-features = false, features = ["deflate"] }` present in `Cargo.toml`.
  `zip = { version = "2", default-features = false, features = ["deflate"] }`
  to the same desktop/mobile-agnostic `[dependencies]` block as the O1-02
  crates. Why: `update.rs::apply_patch_bundle` (O1-19) unpacks the hot-patch
  bundles emitted by `scripts/update-manifest.mjs` (fflate zips of changed
  files, deflate). Without it the patch path cannot compile.

- [S3-02] `packages/db/src/schema.ts` → append the SP parity batch B tables
  → **APPLIED** — migration `032-sp-views.ts`.
  (paste below; mirrors `migrations/032-sp-views.ts` exactly — same plain
  integer link columns + indexes convention as batch A) AND register the
  migration in `packages/db/src/migrations/index.ts`
  (`import { spViews } from './032-sp-views'` + append `spViews` to
  `MIGRATIONS`). Migration file written and tested
  (`packages/db/tests/sp-views-migration.test.ts`). Exact paste:

```ts
/** ─── SP parity: task system batch B (S3-02; time logs, sections, views) ── */

/** SP time logs (S3-10): one row per tracked session per task per day. */
export const taskTimeLogs = table('task_time_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull(),
  day: text('day').notNull(), // YYYY-MM-DD
  sessionMs: integer('session_ms').notNull(),
  startedAt: text('started_at'),
  source: text('source').notNull().default('manual'), // 'manual' | 'focus' | 'idle'
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** SP task list sections (S3-02): ordered groupings inside a task list. */
export const taskSections = table('task_sections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** SP task attachments (S3-37): files, URLs and shell commands. */
export const taskAttachments = table('task_attachments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull(),
  type: text('type').notNull(), // 'file' | 'url' | 'command'
  value: text('value').notNull(),
  title: text('title'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** SP archive tiers (S3-11): young → old auto-archive state per archived task. */
export const taskArchiveTiers = table('task_archive_tiers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().unique(),
  tier: text('tier').notNull().default('young'), // 'young' | 'old'
  archivedAt: text('archived_at').notNull(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** SP simple counters (S3-31): free-floating habit counters (habits kept). */
export const simpleCounters = table('simple_counters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull(),
  color: text('color'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** Daily counter taps (S3-90 streaks read these; unique per counter+day). */
export const simpleCounterLogs = table(
  'simple_counter_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    counterId: integer('counter_id').notNull(),
    day: text('day').notNull(), // YYYY-MM-DD
    count: integer('count').notNull().default(1),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex('simple_counter_logs_day_uniq').on(t.counterId, t.day)],
)

/** SP metric days (S3-30/S3-50): one row per day — metrics map + evaluation sheet. */
export const metricDays = table('metric_days', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  day: text('day').notNull().unique(), // YYYY-MM-DD
  metrics: text('metrics', { mode: 'json' }).$type<Record<string, number>>().notNull().default({}), // metric key → ms/count that day
  impact: integer('impact'), // 1–4 (evaluation sheet, S3-50)
  energy: integer('energy'), // 1–3 (evaluation sheet, S3-50)
  reflection: text('reflection'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

/** SP saved views / boards (S3-24/S3-44): built-ins are seeded, these are user views. */
export const taskViews = table('task_views', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('custom'), // 'kanban' | 'eisenhower' | 'custom'
  filter: text('filter', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}), // rule chips: { tags: [...], projectId, priority, ... }
  sortBy: text('sort_by'),
  groupBy: text('group_by'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})
```

- [Rust tests never run in CI] `.github/workflows/native.yml` (and/or ci.yml)
  → **APPLIED** — native.yml runs `cargo test --manifest-path apps/native/src-tauri/Cargo.toml --release` (line 70).
  → add a `cargo test` step for `apps/native/src-tauri` (e.g.
  `cargo test --manifest-path apps/native/src-tauri/Cargo.toml --release` on the
  windows job). Why: today native.yml only BUILDs (`npm run app:build`), and
  `cargo build` does not even compile `#[cfg(test)]` code — so all the Rust
  unit tests written by O1-02/O1-03/O1-05/O1-16/O1-17/O1-18/O1-19 (update.rs)
  and lock_win.rs are never executed or compile-checked. One step closes the
  gap the mega-run's "tests green" acceptances rely on.

- [O1-21] `.github/workflows/native.yml` → in the `android` matrix job (after
  → **APPLIED** — native.yml android job: bsdiff install + `scripts/generate-apk-delta.mjs` step (lines 168-174).
  the APK build step): `sudo apt-get install -y bsdiff` (ubuntu runner) and a
  step that, when a previous release APK for the same ABI exists (downloaded
  like the manifest via `gh release download --pattern '*.apk'`), runs
  `node scripts/generate-apk-delta.mjs --base <prev.apk> --target <new.apk>
--out dist/delta --label <abi> --report dist/delta/delta-report.json` and
  uploads `dist/delta` with the release assets. The webview KEEPS the full-APK
  fallback (O1-13) until the measured ratios justify an on-device patch path
  (decision recorded in docs/updates.md §"Android sideload consent flow").

- [M2-08] `apps/native/src-tauri/Cargo.toml` → add
  → **APPLIED** — `Win32_System_Registry` present in `Cargo.toml` (DisableTaskMgr policy).
  `"Win32_System_Registry"` to the existing `windows` dependency features
  (the `[target.'cfg(windows)'.dependencies]` block). Why: the admin tier's
  `DisableTaskMgr` policy is a per-user registry value
  (`HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System`);
  without the feature the M2-08 worker code cannot compile and the Rust CI
  job fails. The watchdog's TerminateProcess path needs no new feature.

- [M2-19] `apps/native/src-tauri/Cargo.toml` → add
  → **APPLIED** — `Win32_System_Power` present in `Cargo.toml` (battery monitor compiles).
  `"Win32_System_Power"` to the existing `windows` dependency features. Why:
  the Windows side of the battery auto-unlock monitor reads
  `GetSystemPowerStatus` (battery % + AC state) from
  `Win32::System::Power`; without the feature the Rust battery monitor
  cannot compile. The Android monitor (battery broadcast) needs no feature
  and is already wired (`focus_android_battery_status`).

- [S3-15] `packages/db/src/schema.ts` + `packages/db/src/migrations/0xx-sp-tasks-fix.ts`
  → **APPLIED** — same migration 034 (`section_id`, `title`, `offset_ms`).
  (future batch, low priority) → add a nullable `offset_ms INTEGER` column to
  `task_reminders` (and optionally `title TEXT` to `task_repeat_cfgs`). Why:
  the core model (S3-08) carries `offsetMs` for `relative` reminders, but the
  applied 031 table has nowhere to put it — repos/tasks.ts currently encodes
  the offset as a string inside the NOT NULL `remind_at` column
  (`reminderFromRow` is the single decode point). With a real column the repo
  decode changes in one place; repeat-cfg `title` is lower priority (SP
  titles are generated).

- [S3-20] `packages/db/src/schema.ts` + `packages/db/src/migrations/0xx-sp-sections.ts`
  → **APPLIED** — migration `034-sp-task-columns.ts` adds both columns; the repo decodes `offset_ms` with a legacy pre-034 fallback (`repos/tasks.ts::reminderFromRow`).
  (future batch) → add a nullable `section_id INTEGER REFERENCES
task_sections(id)` column to `task_items`. Why: SP's Today list sections
  are header rows tasks belong to; the applied schema has
  `task_sections` but no task→section link, so S3-20 renders sections as a
  management strip (honest UI) instead of true list dividers. With the
  column, `apps/web/app/tasks/page.tsx` renders section headers inline and
  drag-into-section works.
