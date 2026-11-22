# TASKS.md — mega-run queue (delta OTA · Max Focus lock · SP core parity)

Status: `[ ]` open · `[~W1..W3]` claimed · `[x] done` · `[!] blocked`
Workers claim the FIRST open task whose deps are all `[x]` and whose files don't overlap any in-flight claim. Shared files (schema.ts, migrations/index.ts, apps/web/package.json, tauri.conf.json, Cargo.toml, native.yml, settings columns, matrix doc) are LEAD-only — workers append requests to docs/SHARED_CHANGES.md. Each task ends with: tests written, local gate green, docs/handoffs/<ID>.md written, status `[x]`.

Decisions locked (Phase 1): Android Play+sideload (Play builds disable self-update); Windows NSIS + official updater; Nightly/Beta/Stable ask-first apply-on-restart; GitHub Releases hosting; Max Focus exit = PIN + hard cap 4h; Android Tier1 Owner + Tier2 fallback; Windows admin optional per session; SP scope = Core system only (integrations/sync/plugins/themes = skipped by user).

## Phase 0 — discovery docs

- [x] P0-1 | docs | ARCHITECTURE_NOTES.md: stack map (native shell, CI, focus machinery, task-like domains, settings, sync, test infra) | doc complete, every claim has a path | docs/ARCHITECTURE_NOTES.md | - |
- [x] P0-2 | docs | SUPER_PRODUCTIVITY_FEATURE_MATRIX.md: all 44 SP modules → exists/partial/missing → plan or "skipped by user" (integrations/sync/plugins/themes rows = skipped by user) | every SP feature row present | docs/SUPER_PRODUCTIVITY_FEATURE_MATRIX.md | W2: 51 rows, 8 sections + coverage summary; prettier clean |

## Epic 1 — Delta OTA (O1)

- [x] O1-01 | OTA | Update domain types in core: manifest.json, pointer (nightly.json), channel enum, minNativeVersion, semver-ish compare | zod schemas + unit tests | packages/core/src/update/index.ts, packages/core/src/index.ts export, packages/core/tests/update.test.ts | dep P0-1 waived by lead (discovery complete) |
- [x] O1-02 | OTA | Rust update module skeleton: fetch pointer+manifest, Ed25519/minisign verify, sha256 per-file verify | cargo checks via CI; unit test for verify (known key fixture) | apps/native/src-tauri/src/update.rs, Cargo.toml (minisign-verify, sha2, ureq or use plugin http) | O1-01 |
- [x] O1-03 | OTA | Rust A/B slots in app_data_dir: download to inactive slot, atomic pointer file (tmp+rename), list current | unit-testable helpers + tests | apps/native/src-tauri/src/update.rs | O1-02 |
- [x] O1-04 | OTA | Custom URI-scheme protocol serving active slot with fallback to bundled AssetResolver; capabilities rebinding | dev-served page loads from slot when set, bundled otherwise | apps/native/src-tauri/src/lib.rs, src/update.rs, capabilities/*.json | O1-03 |
- [x] O1-05 | OTA | Boot-confirm rollback: webview ready invoke; N missed confirmations → flip pointer back + log | unit test of confirm counter | apps/native/src-tauri/src/update.rs, lib.rs | O1-04 |
- [x] O1-06 | OTA | Apply-on-restart + never-during-Max-Focus: update service refuses apply while session active (core gate) | unit tests | packages/core/src/update + focus-lock interplay, apps/native/src-tauri/src/update.rs | O1-03, M2-01 |
- [x] O1-07 | OTA | Manifest generator script: hash .next-tauri → manifest.json (files{path,sha256,size}), emit changed-file patch set vs previous manifest | script runs, fixtures tested | scripts/update-manifest.mjs, tests | O1-01 |
- [x] O1-08 | OTA | CI: nightly workflow — build web+native, generate+sign manifest, diff vs previous release, tag nightly-YYYYMMDD-<sha>, upload assets + pointer | workflow yaml valid; dry-run artifact list | .github/workflows/nightly.yml | O1-07 |
- [x] O1-09 | OTA | Sign keypair: generate Ed25519 minisign keys; pubkey committed to tauri.conf + repo; private key documented as Actions secret (user adds) | pubkey in repo, docs/updates.md key section | apps/native/src-tauri/tauri.conf.json (LEAD), docs/updates.md | O1-02 |
- [x] O1-10 | OTA | tauri-plugin-updater wiring for Windows native layer: conf + capability + Rust init + signature artifacts (createUpdaterArtifacts) | conf valid; updater builder reachable in dev | apps/native/src-tauri/tauri.conf.json, Cargo.toml, lib.rs, capabilities (LEAD-applied) | O1-02 |
- [x] O1-11 | OTA | Promote workflow: manual dispatch nightly→beta/stable (re-tag pointer, keep artifacts) | workflow yaml + docs | .github/workflows/promote.yml | O1-08 |
- [x] O1-12 | OTA | Play channel flag: build-time env LH_UPDATE_CHANNEL=play bakes self-update off; sideload default on | unit test of flag reader both ways | apps/web/src/lib/updates.ts (client service), next.config env, docs | O1-01 |
- [x] O1-13 | OTA | Android sideload install: Kotlin PackageInstaller session for full per-ABI APK; REQUEST_INSTALL_PACKAGES; consent flow | code + docs; CI compiles | apps/native/src-tauri/gen/android/.../MaxUpdatePlugin.kt + manifest, Cargo bridge | O1-02 |
- [x] O1-14 | OTA | Settings > Updates UI: stream picker (nightly/beta/stable), check-now, auto-check interval, Wi-Fi-only (Android), current version + changelog panel | page renders SSR-safe; integration test | apps/web/app/settings/page.tsx (Updates section), apps/web/src/lib/updates.ts | O1-12 |
- [x] O1-15 | OTA | Update-available banner + apply prompt (respect ask-first; shows size: patch vs full) | component + test | apps/web/src/components/UpdateBanner.tsx | O1-14 |
- [x] O1-16 | OTA | Rust download: resumable ranges, progress events to webview | unit tests for range math | apps/native/src-tauri/src/update.rs | O1-03 |
- [x] O1-17 | OTA | Rollback test: boot-confirm flip-back covered; slot pointer atomicity test | tests green | apps/native/src-tauri/src/update.rs tests | O1-05 |
- [x] O1-18 | OTA | Tamper tests: modified manifest/file/pointer rejected (bad sha256, bad signature) | tests green | apps/native/src-tauri/src/update.rs tests | O1-02 |
- [x] O1-19 | OTA | Upgrade-from-N test: apply patches from each of last 5 manifests (fixture chain) | tests green | tests in update.rs + fixtures | O1-07 |
- [x] O1-20 | OTA | Measured patch size: CI job applies a one-line web change → records hot patch KB into release notes + docs/updates.md | <50 KB recorded or deviation explained | .github/workflows/nightly.yml, docs/updates.md | O1-08 |
- [x] O1-21 | OTA | Android bsdiff delta APK (stretch): CI generates per-ABI patch vs previous release; client applies + re-signs via persisted keystore | measured sizes; fallback to full APK | scripts, Kotlin apply, native.yml | O1-13 |
- [x] O1-22 | OTA | Keystore persistence: docs + workflow guard requiring ANDROID_KEYSTORE_BASE64 secret; local keytool fallback only for dev | docs + workflow check step | .github/workflows/native.yml (LEAD), docs/updates.md | P0-1 |
- [x] O1-23 | OTA | docs/updates.md: architecture, channels, key ceremony, rollback, Play policy note | doc complete | docs/updates.md | O1-08 |
- [x] O1-24 | OTA | LIMITATIONS.md: Ctrl+Alt+Del, Play hot-patch policy, Android silent-install limits | doc exists | docs/LIMITATIONS.md | O1-13, M2-07 |

## Epic 2 — Max Focus device lock (M2)

- [x] M2-01 | LOCK | Session state machine in core: locked→cooldown→can_confirm→ended + hardCapAt, unlock reasons (timer/pin/battery/failure/tamper), monotonic anchor vs wall clock | unit tests all transitions | packages/core/src/focus-lock/session.ts, tests | P0-1 |
- [x] M2-02 | LOCK | PIN vault: PBKDF2 hash (web crypto) + salt in userSettings JSON; first-use set + security-question recovery; verify API | unit tests | packages/core/src/focus-lock/pin.ts + tests, handler | M2-01 |
- [x] M2-03 | LOCK | maxFocusSessions table + migration (LEAD applies): tier, deviceId, startedAt, plannedEnd, hardCapAt, state, exitReason | migration + repo CRUD + tests | packages/db/src/schema.ts, migrations/0xx-max-focus.ts, repos/focus-lock.ts | M2-01 | W2: resolved per lead decision — reuse extended focus_sessions (migration 033); repo persists state/tier/exitReason/hardCapAt through the lifecycle + setters/getters/extend/machine-mapper/history lists; tests in focus-lock-repo.test.ts |
- [x] M2-04 | LOCK | Handlers: start/status/extend/exit(+reason+pin verify)/history via withRoute + zod | integration tests | apps/web/src/server/handlers/focus/max/…, hub registry | M2-03 | W2: start(+tier)/status/extend/history routes + PIN-verified exit (in-memory rate limit) + registry + max-focus-integration.test.ts; NOTE: registry + exit route landed inside W1 9657c80 sweep (shared tree)
- [x] M2-05 | LOCK | Windows Rust: topmost fullscreen window across ALL monitors | code + CI compile | apps/native/src-tauri/src/lock_win.rs | M2-01 |
- [x] M2-06 | LOCK | Windows Rust: low-level keyboard hooks (Win, Alt+Tab, Alt+F4, Ctrl+Esc) scoped to session | code + docs | apps/native/src-tauri/src/lock_win.rs | M2-05 |
- [x] M2-07 | LOCK | Windows: Task Manager/desktop-switch detect + immediate refocus loop | code | apps/native/src-tauri/src/lock_win.rs | M2-06 |
- [ ] M2-08 | LOCK | Windows admin tier: optional elevation → DisableTaskMgr + watchdog process; ALWAYS restored on end (guarantee via drop guard) | code + docs | apps/native/src-tauri/src/lock_win.rs, lock_watchdog | M2-07 |
- [x] M2-09 | LOCK | Windows allowlisted app switching (user can open allowlisted exes only) | code | apps/native/src-tauri/src/lock_win.rs | M2-06 |
- [x] M2-10 | LOCK | Android Kotlin: Device Owner provisioning helper + exact ADB dpm command emitted by setup wizard | wizard shows command; docs | apps/native/src-tauri/gen/android (Kotlin), apps/web/app/focus/page.tsx section | M2-01 |
- [x] M2-11 | LOCK | Android Kotlin: Lock Task Mode plugin (startLockTask + allowlisted packages + lock-task features) | code + docs | gen/android Kotlin plugin + Cargo bridge | M2-10 |
- [x] M2-12 | LOCK | Android Kotlin Tier 2: AccessibilityService foreground-app watcher + return-to-focus | code + disclosure screen | gen/android Kotlin + manifest | M2-01 |
- [x] M2-13 | LOCK | Android Kotlin Tier 2: full-screen overlay (SYSTEM_ALERT_WINDOW) + UsageStats backup detector | code | gen/android | M2-12 |
- [x] M2-14 | LOCK | Android Kotlin: Device Admin anti-uninstall + BOOT_COMPLETED resume + foreground service with elapsedRealtime | code + manifest perms | gen/android | M2-11, M2-13 |
- [x] M2-15 | LOCK | Emergency dialer always reachable: SYSTEM_ALLOWED_APPS enforcement on both platforms; dialer tile during session | tests + UI | packages/core focus-lock SYSTEM_ALLOWED_APPS, lock UIs | M2-05, M2-11 |
- [x] M2-16 | LOCK | Pre-session checklist UI: permission audit, what-will-be-blocked list, explicit confirm | page section + integration test | apps/web/app/focus/page.tsx | M2-04 | W2: MaxFocusPrecheck.tsx (blocked-list chips from resolved allowlist, platform permission audit, explicit confirm gating the start button) + SSR test
- [x] M2-17 | LOCK | Accessibility + Device Admin disclosure screens (store-policy compliant copy) | screens exist | apps/web/src/components/MaxFocusDisclosures.tsx | M2-12, M2-14 |
- [x] M2-18 | LOCK | Early-exit flow UI: PIN entry + mandatory reason → POST exit (logged) | component + test | apps/web/src/components/MaxFocusExitGate.tsx | M2-04, M2-02 | W2: MaxFocusExitGate.tsx owns request/cooldown/PIN-setup/PIN+reason arc (device-local vault via core createPinVault) + SSR test; replaces the page inline flow (old confirm had no PIN and would 400 against M2-04)
- [x] M2-19 | LOCK | Hard-cap + battery auto-unlock: monitor battery (Tauri), unlock + log on threshold | code + unit tests | core session + Rust + Kotlin | M2-01 |
- [x] M2-20 | LOCK | Tamper detection: clock change (monotonic mismatch), permission revoked → end session + friction log | core logic + tests | packages/core/src/focus-lock/session.ts | M2-01 |
- [x] M2-21 | LOCK | Settings locked during session (client guard + server refuses settings PUT) | handler test + UI guard | settings handler, focus-lock | M2-03 | W2: settings PUT refuses with 423 while a max lock is active (GET readable; standard sessions unaffected) + client Callout + disabled save + guard test
- [x] M2-22 | LOCK | Allowlist editor UI: domains + apps (seeded distraction_apps) per session preset | UI + test | apps/web/app/focus/page.tsx section | M2-04 | W2: MaxFocusAllowlistEditor.tsx — preset CRUD (name/domains/apps/default) over the existing allowlists routes + SSR test; wired into the configurator branch
- [x] M2-23 | LOCK | Rust session commands: focus_session_apply/status/release wired to state machine; webview bridge events | commands compile; invoke tests | apps/native/src-tauri/src/focus.rs | M2-05 |
- [x] M2-24 | LOCK | Reboot/kill resume: persisted session state re-applied on boot (both platforms) | code + tests | core + Rust + Kotlin | M2-14, M2-23 |
- [x] M2-25 | LOCK | Session history UI (sessions, exits, reasons) | page section + test | apps/web/app/focus/page.tsx | M2-04 | W2: MaxFocusSessionHistory.tsx — sessions with state/tier/exitReason badges (one hue per meaning) + friction reflections, fed by the M2-04 history route + SSR test
- [x] M2-26 | LOCK | Unit tests: full state-machine matrix incl. tamper/clock/battery | tests green | packages/core/tests/focus-lock-session.test.ts | M2-01, M2-20 |
- [x] M2-27 | LOCK | docs/MAX_FOCUS_TESTPLAN.md: every escape route × tier × platform + expected behavior | doc complete | docs/MAX_FOCUS_TESTPLAN.md | M2-24 |
- [x] M2-28 | LOCK | docs/max-focus.md: architecture, tiers, PIN/recovery, store disclosures | doc complete | docs/max-focus.md | M2-27 |
- [ ] M2-29 | LOCK | Integration tests for max handlers (SSR-safe, route coverage) | tests green | apps/web/tests/max-focus-integration.test.ts | M2-04 |
- [x] M2-30 | LOCK | Desktop e2e smoke: lock apply→release round-trip in CI (headless) | vitest e2e | tests/e2e/max-focus-lock-roundtrip.test.ts (skipIf off-Windows; reason-union parity runs everywhere) | M2-23 |
- [ ] M2-31 | LOCK | Notification: persistent "session running" + unlock notification | code | apps/web notifications gate | M2-04 |

## Epic 3 — SP core parity (S3)

Schema batches are LEAP-applied by lead after worker writes migration file.

- [x] S3-01 | SP | DB schema batch A (LEAD applies migration): taskProjects, taskTags, taskItems (parentId, projectId, tagIds JSON?→link table, estimateMs, timeSpentOnDay JSON, due, dueWithTime, deadline, priority, isDone, doneAt, wonthado, repeatCfgId, notes, order), taskRepeatCfgs, taskReminders | migration idempotent; drizzle types export | packages/db/src/schema.ts + migrations/0xx-sp-tasks.ts | W2: migration 031 + tests + SHARED_CHANGES paste; LEAD applies schema.ts batch |
- [x] S3-02 | SP | DB schema batch B (LEAD applies): taskTimeLogs (per task/day/session ms), taskSections, taskAttachments, taskArchiveTiers, simpleCounters, metricDays, taskViews(boards) JSON | migration + types | packages/db/src/schema.ts + migrations/0xx-sp-views.ts | S3-01 |
- [x] S3-03 | SP | Core task domain: model + ops (create/update/complete/reopen/duplicate/bulk/validate) pure functions | unit tests | packages/core/src/tasks/index.ts + tests | S3-01 |
- [x] S3-04 | SP | Core subtasks: one nesting level, parent aggregates time/estimate | unit tests | packages/core/src/tasks/subtasks.ts | S3-03 |
- [x] S3-05 | SP | Core projects: CRUD, backlog flag, archive/duplicate, notes field | unit tests | packages/core/src/tasks/projects.ts | S3-03 |
- [x] S3-06 | SP | Core tags: CRUD, colors, OR/AND filter, "no tags", Today virtual tag | unit tests | packages/core/src/tasks/tags.ts | S3-03 |
- [x] S3-07 | SP | Core repeat engine: cycles d/w/m/y + interval + start/end + skip dates + re-anchor modes + projections | unit tests (SP parity cases) | packages/core/src/tasks/repeat.ts | S3-03 |
- [x] S3-08 | SP | Core reminders: per-task reminder planner (reuse core/reminders patterns), exact-alarm note (Android) | unit tests | packages/core/src/tasks/reminders.ts | S3-03, S3-02 |
- [x] S3-09 | SP | Short-syntax parser: #tag +project 10m/1h @date @every p1..3 !deadline + autocomplete token model | exhaustive unit tests | packages/core/src/tasks/short-syntax.ts | S3-07 |
- [x] S3-10 | SP | Time-tracking core: current task, per-day maps, merge/conflict | unit tests | packages/core/src/tasks/time-tracking.ts | S3-03 |
- [x] S3-11 | SP | Archive core: young/old tiers, auto-archive config, restore | unit tests | packages/core/src/tasks/archive.ts | S3-03 |
- [x] S3-12 | SP | Recently-deleted trash (30-day, device-local) | unit tests | packages/core/src/tasks/trash.ts | S3-03 |
- [x] S3-13 | SP | Undo core: last-op undo stack for task ops | unit tests | packages/core/src/tasks/undo.ts | S3-03 |
- [x] S3-14 | SP | Search core: task+note search incl. done/archived option | unit tests | packages/core/src/tasks/search.ts | S3-03 |
- [x] S3-15 | SP | DB repos: tasks+projects+tags+repeat+reminders+logs (all queries reusable) | repo tests | packages/db/src/repos/tasks.ts | S3-02, S3-03 |
- [x] S3-16 | SP | Handlers batch A: tasks CRUD + bulk + duplicate + move-to-project + archive/restore | integration tests | apps/web/src/server/handlers/tasks/…, hub registry | S3-15 |
- [x] S3-17 | SP | Handlers batch B: projects/tags/sections + views(boards) persistence | integration tests | handlers + registry | S3-15 |
- [x] S3-18 | SP | Handlers batch C: time-tracking tick/stop + worklog + export CSV + finish-day | integration tests | handlers | S3-15, S3-10 |
- [x] S3-19 | SP | Handlers batch D: reminders schedule + planner read + schedule read + metrics + counters | integration tests | handlers | S3-15, S3-08 |
- [ ] S3-20 | SP | Today/Inbox page: add-task-bar (short-syntax + autocomplete), task list, drag order, sections, multi-select bar | page + integration test | apps/web/app/tasks/page.tsx | S3-16 |
- [ ] S3-21 | SP | Task detail panel: fields, subtasks, reminders, attachments, time estimates dialogs | component + test | apps/web/src/components/tasks/TaskDetail.tsx | S3-20 |
- [ ] S3-22 | SP | Projects UI: project pages, backlog, notes, colors, archive/duplicate | pages + tests | apps/web/app/tasks/projects/… | S3-16, S3-05 |
- [ ] S3-23 | SP | Tags UI: tag pages, filters, colors | pages + tests | apps/web/app/tasks/tags/… | S3-16, S3-06 |
- [x] S3-24 | SP | Boards page: Kanban + Eisenhower built-ins + custom rule views (rule chips, drag applies rules) | page + tests | core/boards.ts engine + app/boards/page.tsx + lib/board-views (device-local custom views) + nav entry | S3-17 |
- [ ] S3-25 | SP | Planner upgrade: day columns, workload+capacity %, calendar events, drag-to-schedule, overdue row | upgrade existing planner page + tests | apps/web/app/planner/page.tsx, components/StudyPlannerMatrix upgrade | S3-17, S3-09 |
- [ ] S3-26 | SP | Schedule view: 30-day timeline, blocks sized by estimate, tray mode | page + tests | apps/web/app/schedule/page.tsx | S3-25 |
- [x] S3-27 | SP | Calendar import: iCal feed subscription (extend core/ics.ts) + CalDAV VTODO read | core + handler + UI | packages/core/src/ics.ts parser, calendar/import handler + registry, lib/calendar-feeds + CalendarSubscriptions on planner | S3-26 |
- [x] S3-28 | SP | Worklog page: history day/week, inline corrections, CSV export UI | page + tests | apps/web/app/worklog/page.tsx (consumes S3-18 endpoints; handoff notes the contract) | S3-18 |
- [ ] S3-29 | SP | Finish-day flow: summary, auto-archive, plan-tomorrow prompt, celebration | page flow + tests | apps/web/app/tasks/finish-day | S3-18, S3-11 |
- [ ] S3-30 | SP | Metrics: per-day records, aggregates, line charts (hand-rolled SVG), activity heatmap | page + tests | apps/web/app/metrics/page.tsx + core/metrics.ts | S3-19 |
- [ ] S3-31 | SP | Habits/counters upgrade: simple counters with streaks + charts (existing habits kept) | core + UI + tests | packages/core/src/tasks/counters.ts, habits page upgrade | S3-19 |
- [ ] S3-32 | SP | Focus modes: Pomodoro/Flowtime/Countdown strategies on existing timer; task-tracking bidirectional; break reminders | core + UI + tests | packages/core/src/tasks/focus-modes.ts, focus page integration | S3-10 |
- [ ] S3-33 | SP | Idle detection (desktop Tauri): subtract idle, classify dialog; suppress during Max Focus | Rust command + core + UI | apps/native/src-tauri/src/idle.rs, core | S3-32 |
- [ ] S3-34 | SP | Max Focus wiring: start focus session from task; task auto-tracked during lock | core glue + UI | focus-lock + tasks | M2-01, S3-32 |
- [ ] S3-35 | SP | Keyboard shortcuts: configurable map + cheat sheet; task shortcuts (done/subtask/schedule…) | core + settings UI | packages/core/src/tasks/shortcuts.ts, settings section | S3-20 |
- [ ] S3-36 | SP | Markdown paste → tasks; task ↔ markdown checklist conversion | core + UI + tests | packages/core/src/tasks/markdown.ts | S3-03 |
- [ ] S3-37 | SP | Task detail attachments + bookmark links (files/URLs/commands) | UI + handler | tasks components | S3-21 |
- [ ] S3-38 | SP | Global search page upgrade: unified tasks+notes results | page upgrade | apps/web/app/search upgrade | S3-14 |
- [ ] S3-39 | SP | Nav integration: Tasks/Projects/Tags/Boards/Schedule/Worklog/Metrics entries (nav.ts shortLabels) | nav + routes registered | apps/web/src/components/nav.ts | S3-20 |
- [ ] S3-40 | SP | Onboarding addition: SP first-run steps (create project, add task via short syntax) | wizard step | OnboardingWizard | S3-20 |
- [ ] S3-41 | SP | Docs: docs/tasks.md (data model, shortcuts, parity map) | doc complete | docs/tasks.md | S3-39 |
- [ ] S3-42 | SP | Integration tests: renderToString for every new page (today/boards/schedule/worklog/metrics) | tests green | apps/web/tests/sp-*-integration.test.ts | S3-20..S3-30 |
- [ ] S3-43 | SP | WorkContext totals: per project/tag today-time, tracked-title (document title shows current task + time) | core + UI | core/tasks/work-context.ts | S3-10 |
- [ ] S3-44 | SP | Task-view customizer: show/hide/sort/group per view + "save as view" | component + core | core/boards.ts extension | S3-24 |
- [ ] S3-45 | SP | Estimated-vs-spent indicators, priority indicators, deadline badges across lists | components | tasks components | S3-20 |
- [ ] S3-46 | SP | Task summary tables + per-project rollup | components | tasks | S3-43 |
- [ ] S3-47 | SP | Repeating-task UI: repeat config dialog (cycle/interval/anchor modes) | component | tasks components | S3-07 |
- [ ] S3-48 | SP | Reminder UI: per-task reminders dialog + global toggles | component | tasks | S3-08 |
- [ ] S3-49 | SP | "Add tasks for tomorrow" + today-planning sync (Today/Planner exclusivity) | UI + core | tasks | S3-29 |
- [ ] S3-50 | SP | Evaluation sheet: reflection note, impact 1-4, energy 1-3 per day | UI + handler | metrics | S3-30 |
- [ ] S3-51 | SP | Tracking reminder dialog for untracked counters/metrics | UI | metrics | S3-31 |
- [ ] S3-52 | SP | Matrix final pass: every row done or skipped-by-user; publish doc | doc updated | docs/SUPER_PRODUCTIVITY_FEATURE_MATRIX.md | S3-50 |

## Cross-cutting (X)

- [ ] X-01 | X | Settings: new sections registered (Updates, Max Focus, SP shortcuts/planner config) with one save model | sections exist | settings page | O1-14, M2-16, S3-35 |
- [ ] X-02 | X | docs/SHARED_CHANGES.md maintained by lead (deps, schema batches, conf changes) | current | docs/SHARED_CHANGES.md | P0-1 |
- [ ] X-03 | X | Every 10 tasks: CI run on feature/mega-run green; regressions re-queued at top as [!] fix tasks | CI green cadence | .github (watch) | O1-08 |
- [ ] X-04 | X | Final: full CI green + open PR "feat: delta OTA updates, Max Focus device lock, Super Productivity feature parity" with patch sizes + matrix + LIMITATIONS summary + screenshots | PR open | - | all |

## Expansion block (granular tasks for parity depth)

- [x] S3-60 | SP | Core: task ordering/ordinal per list + drag-reorder math | unit tests | packages/core/src/tasks/order.ts | S3-03
- [x] S3-61 | SP | Core: task-grouping (by project/tag/date) pure helpers | unit tests | packages/core/src/tasks/grouping.ts | S3-03
- [x] S3-62 | SP | Core: estimate parsing/validation (10m/1h/1h30m) + remaining math | unit tests | packages/core/src/tasks/estimates.ts | S3-03 W2: committed in 3af7caa (estimates.ts + tests + handoff); marker flip missed on quota cut
- [x] S3-63 | SP | Core: deadline vs due semantics (past-deadline flagging) | unit tests | packages/core/src/tasks/deadlines.ts | S3-03
- [x] S3-64 | SP | Core: priority model (p1..p3 + strategies via tags) | unit tests | packages/core/src/tasks/priority.ts | S3-06
- [x] S3-65 | SP | Core: today membership = due date only (virtual tag math) | unit tests | packages/core/src/tasks/today.ts | S3-03
- [x] S3-66 | SP | Core: won't-do state exclusions from counts | unit tests | packages/core/src/tasks/wontdo.ts | S3-03
- [ ] S3-67 | SP | DB: taskItem full-text index (FTS5 migration) for search | migration + repo queries | packages/db migrations + repos/tasks.ts | S3-01
- [ ] S3-68 | SP | UI: add-task-bar autocomplete token highlighting | component test | tasks components | S3-09
- [ ] S3-69 | SP | UI: inline subtask add input + checklist progress (2/5) on rows | component | tasks components | S3-04
- [ ] S3-70 | SP | UI: multi-select bar (select-all, bulk complete/project/tag/delete) | component | tasks components | S3-16
- [ ] S3-71 | SP | UI: task context menu (duplicate, move, schedule, archive) | component | tasks components | S3-16
- [ ] S3-72 | SP | UI: drag-and-drop reorder + cross-day planner drops | component + core | planner + tasks | S3-25
- [ ] S3-73 | SP | UI: keyboard nav K/J + X select + ? cheat sheet overlay | component | tasks components | S3-35
- [ ] S3-74 | SP | UI: project bookmarks (links/files/commands rows) | component | projects UI | S3-22
- [ ] S3-75 | SP | UI: archived-projects section + trophy reopen flow | component | projects UI | S3-22
- [ ] S3-76 | SP | UI: recently-deleted trash view with restore | component | trash | S3-12
- [ ] S3-77 | SP | UI: time-tracking tick indicator + tracked-title document title | lib + UI | use-global-timer glue | S3-10
- [ ] S3-78 | SP | UI: idle-classify dialog (assign to task / break / discard) | component | idle | S3-33
- [ ] S3-79 | SP | UI: daily summary / share-work-summary text builder | core + UI | metrics | S3-30
- [ ] S3-80 | SP | UI: countdown default = task remaining estimate | glue | focus-modes | S3-32
- [ ] S3-81 | SP | UI: break-time never logged to task (guard) | core test | time-tracking | S3-32
- [ ] S3-82 | SP | UI: schedule drag-to-schedule (resize handle + touch press-hold) | component | schedule | S3-26
- [ ] S3-83 | SP | UI: per-calendar color + visibility toggle | component | schedule | S3-27
- [ ] S3-84 | SP | UI: eisenhower keyboard quadrant nav | component | boards | S3-24
- [ ] S3-85 | SP | UI: boards "save as view" from any filtered list | component | boards | S3-44
- [x] S3-86 | SP | Core: mention/@ config for task notes | unit tests | core/tasks | S3-03
- [ ] S3-87 | SP | Core: markdown paste service (list → tasks) end-to-end | unit tests | core/tasks/markdown.ts | S3-36
- [ ] S3-88 | SP | Core: worklog week/month rollups + leaf-only totals | unit tests | core/tasks/worklog.ts | S3-10
- [ ] S3-89 | SP | Core: activity heatmap data builder | unit tests | metrics | S3-30
- [ ] S3-90 | SP | Core: streak-duration calc for counters | unit tests | counters | S3-31
- [x] S3-91 | SP | Handlers: simple-counters REST (list/get/set/increment) | integration tests | handlers | S3-15
- [x] S3-92 | SP | Handlers: task-repeat-cfg CRUD routes | integration tests | handlers | S3-15
- [ ] S3-93 | SP | Handlers: notes-project linking (project notes) | integration tests | handlers + notes | S3-05
- [ ] S3-94 | SP | UI: planner capacity % + over-budget indicators | component | planner | S3-25
- [ ] S3-95 | SP | UI: schedule "from previous days" row + deadline flags | component | schedule | S3-26
- [ ] S3-96 | SP | UI: impact stars + lazy chart components | component | metrics | S3-30
- [ ] S3-97 | SP | Docs: keyboard shortcut default map table in docs/tasks.md | doc section | docs/tasks.md | S3-35
- [ ] S3-98 | SP | UI: empty/first-run states for all new pages (honest EmptyState) | sweep | new pages | S3-42
- [ ] S3-99 | SP | Perf: task list virtualization for 1000+ items | component | tasks | S3-20
- [ ] S3-100 | SP | A11y: focus-visible + aria for board quadrants/drag handles | sweep | boards/planner | S3-24
- [x] O1-25 | OTA | Update check interval + Wi-Fi-only honored by the check scheduler | code + tests | apps/web/src/lib/updates.ts client service (scheduler owns the loop; settings are webview-local; Rust keeps download/promote) | O1-14 |
- [x] O1-26 | OTA | Changelog fetch (release notes body) rendered in Settings | UI + lib | updates.ts + settings | O1-14
- [x] O1-27 | OTA | Update progress events → banner progress bar | glue | UpdateBanner | O1-16
- [x] O1-28 | OTA | Nightly pointer schema validation client-side (reject unknown fields gracefully) | tests | core/update | O1-01
- [x] O1-29 | OTA | Desktop tray/notification "update ready, restart to apply" | UI | UpdateBanner | O1-15
- [ ] O1-30 | OTA | Android: Play-flavor build task in native.yml producing play-flagged APKs | workflow | native.yml (LEAD) | O1-12
- [x] M2-32 | LOCK | Android: per-tier permission checklist state machine (what's granted vs needed) | core + UI | focus-lock + focus page | M2-16 W2: core/focus-lock/tiers.ts — TIER_REQUIREMENTS + tierChecklist + bestAvailableTier + labels, unit-tested; rendered by the M2-16 precheck
- [x] M2-33 | LOCK | Windows: session state persisted + restored after app restart (not just reboot) | code + tests | lock_win.rs | M2-24
- [x] M2-34 | LOCK | Both: "session ended by cap/battery" post-session report card | UI + handler | focus page | M2-19
- [ ] M2-35 | LOCK | Docs: admin/watchdog security notes in docs/max-focus.md (no secrets, restore guarantees) | doc section | docs/max-focus.md | M2-08

## Worker protocol reminders

- Claim by editing status; commit code directly on feature/mega-run (disjoint files only); write docs/handoffs/<ID>.md; append shared-file needs to docs/SHARED_CHANGES.md — never edit shared files yourself.
- Local gate per task: npm run typecheck && npm run lint && npx prettier --check <files>. Never npm test/build (rule 17). Tests you WRITE run in CI.
- Rust/Kotlin tasks: code must compile in CI; verify via cargo fmt/clippy-safe patterns and mirror existing file style.
