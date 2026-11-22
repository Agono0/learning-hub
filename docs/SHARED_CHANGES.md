# SHARED_CHANGES — lead-applied file requests

Workers never edit shared files (`schema.ts`, `migrations/index.ts`,
`apps/web/package.json`, `tauri.conf.json`, `Cargo.toml`, `native.yml`,
settings columns, matrix doc). Append requests below; the lead applies them
in batches. Format: `[task] file → change → why`.

## Requests

- [O1-22] `.github/workflows/native.yml` → add a fail-fast guard step in the
  `android` matrix job (before the build) that exits with an error when
  `ANDROID_KEYSTORE_BASE64` is unset, so CI cannot silently auto-generate a
  new keystore and break sideload-update signatures. Exact YAML proposed in
  `docs/updates.md` §"Android signing — keystore persistence (O1-22)".

- [O1-02] `apps/native/src-tauri/Cargo.toml` → add three `[dependencies]` lines
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
  `tauri-plugin-updater`, set `plugins.updater.pubkey` to the exact contents of
  `apps/native/src-tauri/keys/lh-update.key.pub` (committed, key id
  `DB675CE9C8F2082D`) and `plugins.updater.endpoints` to the channel-pointers
  URLs (see docs/updates.md §"Channels & pointer model"): e.g.
  `https://github.com/Agono0/learning-hub/releases/download/channel-pointers/nightly.json`
  (per channel / store flavor). Why: O1-09 generated the keypair; the public
  key must be baked into the updater config before any signed nightly is
  shipped.
- [O1-10] remaining LEAD pieces for the updater wiring (worker parts are
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
  `zip = { version = "2", default-features = false, features = ["deflate"] }`
  to the same desktop/mobile-agnostic `[dependencies]` block as the O1-02
  crates. Why: `update.rs::apply_patch_bundle` (O1-19) unpacks the hot-patch
  bundles emitted by `scripts/update-manifest.mjs` (fflate zips of changed
  files, deflate). Without it the patch path cannot compile.
