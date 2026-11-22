# Super Productivity → Learning HUB parity matrix

> **Source of truth for SP feature parity.** Reference: Super Productivity master
> `features/` tree at commit date **2026-11-22** (SP is MIT-licensed).
> **Ideas are adapted; no verbatim SP code is copied into this repo.**
>
> Scope locked in Phase 1 (see `TASKS.md` decisions): **Core system only** —
> issue integrations, sync providers, the third-party plugin API, custom-CSS
> themes, i18n and importers are **skipped by the user**.
>
> Status legend — **done**: shipped equivalent (with the task refs) ·
> **partial**: core/handlers shipped, named UI refinements open · **exists**:
> shipped equivalent that predates Epic 3 · **missing**: still open (refs
> given) · **skipped**: skipped by the user (Phase-1 lock). The **Refs**
> column cites `TASKS.md` IDs; path notes refer to this repo.
>
> Final pass (S3-52): every row below carries its honest state and refs;
> §10 totals them. Rows still `partial`/`missing` name exactly the open
> `TASKS.md` IDs that close them — nothing is marked done ahead of its code.

## 1. Tasks

| SP feature                  | SP behavior                                                                                           | Status      | Refs                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| tasks (model + CRUD)        | Task items with project, tags, estimate, per-day time, due, deadline, priority, done, won't-do, order | **done**    | S3-01 · S3-03 · S3-15 · S3-16 · S3-20 (+ ordering S3-60, grouping S3-61, today S3-65, won't-do S3-66) |
| add-task-bar (short syntax) | One input parses `#tag` `+project` `10m/1h` `@date` `@every` `!deadline` with live autocomplete       | **done**    | S3-09 + AddTaskBar (token-highlight refinement S3-68 open)                                            |
| subtasks                    | One nesting level; parent aggregates time/estimate                                                    | **done**    | S3-04 + TaskDetail (S3-21); inline row UI S3-69 open                                                  |
| attachments                 | Attach files, URLs, shell commands to a task                                                          | **partial** | handlers landed (S3-19 family); dialog wiring S3-37 open                                              |
| bulk ops                    | Multi-select: complete, set project/tag, delete, move                                                 | **done**    | S3-16 + MultiSelectBar (S3-20)                                                                        |
| duplicate / move            | Context-menu duplicate task, move to project                                                          | **done**    | S3-03 core · S3-16 handlers · TaskRow kebab (S3-71 menu deepens)                                      |
| archive orchestrator        | Auto-archive done/aged tasks into young/old tiers                                                     | **done**    | S3-11 (+ tiers table S3-02)                                                                           |
| recently-deleted            | 30-day trash with restore                                                                             | **partial** | S3-12 core + restore; trash view S3-76 open                                                           |
| deadlines                   | Deadline field + overdue flagging separate from due date                                              | **done**    | S3-63 + DeadlineBadge (S3-45)                                                                         |
| time estimates              | Estimate parsing (`10m/1h30m`) + remaining-time math                                                  | **done**    | S3-62 + EstimateSpentBadge (S3-45)                                                                    |
| summary tables              | Per-day / per-project work rollup tables                                                              | **done**    | S3-46 over S3-88 leaf-only rollups                                                                    |
| work-view                   | Main "work on today" list view                                                                        | **done**    | S3-20                                                                                                 |
| task-repeat-cfg             | Recurrence config: cycle d/w/m/y, interval, start/end, skip dates, re-anchor modes                    | **done**    | S3-07 · S3-92 · dialog S3-47 · titles via 034                                                         |
| per-task reminders          | Reminders attached to a task; exact alarms on Android                                                 | **done**    | S3-08 · S3-19 · dialog S3-48 · offset_ms via 034                                                      |

## 2. Organization

| SP feature           | SP behavior                                                            | Status      | Refs                                                                        |
| -------------------- | ---------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| project              | Projects with backlog flag, notes, archive, duplicate, themes          | **partial** | S3-05 core done; projects UI S3-22 + notes linking S3-93 open               |
| tag                  | Colored tags, OR/AND filters, "no tags", Today virtual tag, strategies | **partial** | S3-06 + S3-64 strategies done; tags UI S3-23 open                           |
| section              | Sections dividing a task list                                          | **done**    | S3-02 `taskSections` · S3-17 handlers · `sectionId` via 034                 |
| boards               | Kanban + Eisenhower built-ins + custom rule-based views                | **done**    | S3-24 + keyboard nav S3-84 + a11y S3-100                                    |
| task-view-customizer | Show/hide/sort/group per view; "save as view"                          | **done**    | S3-44 + S3-85                                                               |
| menu-tree            | Configurable grouped navigation tree                                   | **done**    | S3-39 nav entries; deep tree configurability not planned                    |
| note                 | Standalone notes, pinned notes, drafts                                 | **exists**  | `notes` table + FTS (migration 003) + notes page; pinned/drafts not planned |

## 3. Planning

| SP feature             | SP behavior                                                            | Status   | Refs                                             |
| ---------------------- | ---------------------------------------------------------------------- | -------- | ------------------------------------------------ |
| planner                | Weekly/day planning with workload and calendar events                  | **done** | S3-25 (capacity % S3-94 open)                    |
| schedule               | 30-day timeline, blocks sized by estimate, drag-to-schedule, tray mode | **done** | S3-26 (drag S3-82, previous-days row S3-95 open) |
| calendar-integration   | iCal feed subscription, CalDAV VTODO read, Google Calendar OAuth       | **done** | S3-27 (Google OAuth not planned — future)        |
| add-tasks-for-tomorrow | Quick "plan tomorrow" entry + sync with Today exclusivity              | **done** | S3-49 (structural exclusivity, S3-65)            |

## 4. Time & focus

| SP feature        | SP behavior                                                        | Status      | Refs                                                                                     |
| ----------------- | ------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------- |
| time-tracking     | Per-task tracking, current task, per-day maps, merge/conflict      | **done**    | S3-10 + `taskTimeLogs` (S3-02) + handlers S3-18 (tick UI S3-77 open)                     |
| worklog           | Day/week worklog with inline corrections + CSV export              | **done**    | S3-18 · S3-28 · rollups S3-88                                                            |
| work-context      | Per-project/tag today-time totals; current work context            | **done**    | S3-43 (document-title UI S3-77 open)                                                     |
| idle              | Detect idle time, subtract from logs, classify dialog              | **missing** | S3-33 open                                                                               |
| focus-mode        | Pomodoro / Flowtime / Countdown strategies + task-tracking binding | **partial** | timer phases exist (`use-global-timer`); S3-32 strategies + S3-34 Max-Focus binding open |
| take-a-break      | Break reminders and break overlay after focus                      | **partial** | break phase exists; S3-32 reminder cadence open                                          |
| tracking-reminder | Nudge dialog when counters/metrics go untracked                    | **done**    | S3-51                                                                                    |

## 5. Rituals & metrics

| SP feature              | SP behavior                                                          | Status      | Refs                                                                                                 |
| ----------------------- | -------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| before-finish-day       | Pre-finish prompt: plan tomorrow, review today                       | **missing** | S3-29 open (core calls ready: S3-49)                                                                 |
| finish-day-before-close | End-of-day flow before app close: summary, auto-archive, celebration | **missing** | S3-29 open                                                                                           |
| archive (young/old)     | Two-tier auto-archive of done tasks                                  | **done**    | S3-11                                                                                                |
| history                 | Browse past days' tracked work                                       | **done**    | S3-28 worklog + S3-30 metric history                                                                 |
| metric                  | Per-day records, heatmap, evaluation sheet, impact 1-4 / energy 1-3  | **done**    | S3-30 · S3-02 · evaluation sheet S3-50 (heatmap S3-89, impact stars S3-96, share summary S3-79 open) |
| simple-counter          | Simple habit counters with streaks and charts                        | **partial** | schema S3-02 + handlers S3-91 done; streaks S3-90 / charts + upgrade S3-31 open                      |

## 6. UX & configuration

| SP feature            | SP behavior                                        | Status      | Refs                                                                |
| --------------------- | -------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| onboarding + shepherd | First-run wizard + step-by-step guided tour        | **partial** | OnboardingWizard exists; SP steps S3-40 open; deep tour not planned |
| panels                | Right/bottom dockable panels                       | **done**    | panel/sheet pattern (S3-21 TaskDetail); docking not planned         |
| markdown-checklist    | Paste markdown → tasks; task ↔ markdown conversion | **missing** | S3-36 / S3-87 open                                                  |
| config                | GlobalConfigState feature toggles across modules   | **done**    | settings page single-PUT model; X-01 verified section set           |

## 7. Platform

| SP feature        | SP behavior                                                        | Status      | Refs                                                                                |
| ----------------- | ------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------- |
| android           | Foreground service, home-screen widget, share-target, exact alarms | **partial** | M2-14 foreground service + S3-08 exact alarms done; widget/share-target not planned |
| ios               | Native iOS app                                                     | **skipped** | skipped by user                                                                     |
| mobile            | Mobile-adapted UI                                                  | **exists**  | mobile-first is a repo rule (360px, 44px) + `apps/native`                           |
| browser extension | Quick-add tasks, site blocking from the browser                    | **exists**  | `apps/extension` (DNR blocking + focus_bridge)                                      |

## 8. Cross-cutting

| SP feature                        | SP behavior                                                                   | Status      | Refs                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| keyboard shortcuts                | Fully configurable shortcut map + cheat sheet                                 | **missing** | S3-35 open (+ S3-73/S3-97); eisenhower board nav ships today (S3-84, docs/tasks.md §8) |
| local REST API                    | Desktop REST API on port :3876 with documented endpoints                      | **exists**  | `apps/server` + route shims (`docs/api-server.md`); SP-shape routes skipped by user    |
| MCP server                        | Exposes SP as MCP tools for agents                                            | **exists**  | `apps/mcp`; SP-shape tools skipped by user                                             |
| plugin API                        | Third-party plugin runtime                                                    | **exists**  | internal system (`plugins/`, `docs/plugins.md`); third-party API skipped by user       |
| invoicing plugin                  | SP plugin generating invoices from tracked time                               | **skipped** | skipped by user                                                                        |
| import/export + importers         | JSON export/import; Todoist / TickTick / MS To-Do importers                   | **partial** | JSON backup covers it; importers skipped by user                                       |
| backup / restore                  | Automatic backups every ~5 min + manual restore                               | **exists**  | `packages/db/src/backup.ts` + backup page                                              |
| sync (providers)                  | Op-log + vector clocks; WebDAV / Nextcloud / Dropbox / local-file / SuperSync | **partial** | device roster + cloud-sync (migrations 005, 021); SP providers skipped by user         |
| URL schemes                       | Deep-link actions into the app                                                | **skipped** | skipped by user (not planned this run)                                                 |
| global search                     | Unified search across tasks, notes, issues                                    | **done**    | S3-14 core · S3-38 page upgrade                                                        |
| theming                           | 16 built-in themes + custom `.css` theme loading                              | **partial** | 6 `data-theme` palettes + dark + e-ink; `.css` loading skipped by user                 |
| i18n                              | 13 languages incl. localized short-syntax dates                               | **skipped** | skipped by user (English-only)                                                         |
| tracked-title                     | Window title shows current task + elapsed time                                | **partial** | S3-43 totals done; document-title UI S3-77 open                                        |
| update mechanism                  | Service-worker update check (web) / desktop self-update                       | **done**    | O1 epic complete (nightly channel, signed manifests, A/B slots, Play flag)             |
| tracking-presence                 | Records user presence to support automatic time tracking                      | **skipped** | skipped by user                                                                        |
| plainspace                        | Distraction-free plain writing space                                          | **skipped** | skipped by user                                                                        |
| dialog-please-rate                | Occasional "rate this app" dialog                                             | **skipped** | skipped by user                                                                        |
| issue integrations (14 providers) | Jira/GitHub/GitLab/… integration + issue panel inside the app                 | **skipped** | skipped by user (all providers)                                                        |
| license                           | MIT license                                                                   | **exists**  | `LICENSE`                                                                              |

## 9. Coverage summary (counts by section)

| Section               | Rows   | done   | exists | partial | missing | skipped |
| --------------------- | ------ | ------ | ------ | ------- | ------- | ------- |
| 1. Tasks              | 14     | 12     | 0      | 2       | 0       | 0       |
| 2. Organization       | 7      | 4      | 1      | 2       | 0       | 0       |
| 3. Planning           | 4      | 4      | 0      | 0       | 0       | 0       |
| 4. Time & focus       | 7      | 4      | 0      | 2       | 1       | 0       |
| 5. Rituals & metrics  | 6      | 3      | 0      | 1       | 2       | 0       |
| 6. UX & configuration | 4      | 2      | 0      | 1       | 1       | 0       |
| 7. Platform           | 4      | 0      | 2      | 1       | 0       | 1       |
| 8. Cross-cutting      | 19     | 2      | 5      | 4       | 1       | 7       |
| **Total**             | **65** | **31** | **8**  | **13**  | **5**   | **8**   |

## 10. What closes the gap

The 5 `missing` and 11 `partial` rows name their closing IDs inline; the
open set is exactly: S3-22, S3-23, S3-29, S3-31, S3-32, S3-33, S3-34,
S3-35, S3-37, S3-40, S3-69–S3-83, S3-87, S3-90, S3-93–S3-99 (see
`TASKS.md`). Everything else is done with refs above, or skipped by the
Phase-1 user lock. This document is regenerated by hand per final pass
(S3-52); the source of truth for task states is always `TASKS.md`.
