# Max Focus test plan — every escape route × tier × platform

> The verification matrix for the Max Focus device lock (Epic M2). Every escape
> route a user (or a determination test) can attempt, mapped to the mechanism
> that answers it, the expected behavior per tier, and how to verify.
> Architecture: docs/max-focus.md (M2-28), limits: docs/LIMITATIONS.md,
> code map: [ARCHITECTURE_NOTES.md](ARCHITECTURE_NOTES.md).

## Tiers and platforms

| Tier                | Android                                                                                  | Windows                                               |
| ------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **T0 — plain lock** | Fullscreen lock surface only (M2-05 parity)                                              | Lock windows on all monitors (M2-05)                  |
| **T1 — hardened**   | Device Owner: Lock Task pinning (M2-11), silent-install sessions, anti-uninstall (M2-14) | Optional elevation: DisableTaskMgr + watchdog (M2-08) |
| **T2 — fallback**   | Non-owner: AccessibilityService watcher (M2-12) + overlay/UsageStats backstops (M2-13)   | Non-admin: hook + refocus guard only (M2-06/07)       |

Provisioning gates: Android T1 requires the ADB `dpm set-device-owner` command
(M2-10 wizard); Windows T1 requires an admin-elevated session start (optional
per session — locked Phase-1 decision).

## Escape-route matrix

Legend: ✅ blocked/prevented · 🔁 detected + counter-move · ⚠️ partial (named
residual) · ❌ impossible (documented limit).

| #   | Escape route                                            | Win T0                                                                                  | Win T1                                                                            | Android T0               | Android T1 (owner)                                                    | Android T2 (a11y)                |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------- | -------------------------------- |
| 1   | `Alt+Tab`                                               | ✅ hook swallows (M2-06)                                                                | ✅                                                                                | ✅ Lock Task pin (M2-11) | ✅                                                                    | 🔁 watcher returns focus (M2-12) |
| 2   | `Alt+F4`                                                | ✅ hook swallows                                                                        | ✅                                                                                | ✅ Lock Task             | ✅                                                                    | 🔁                               |
| 3   | `Ctrl+Esc` (Start menu)                                 | ✅ hook swallows                                                                        | ✅                                                                                | ✅                       | ✅                                                                    | 🔁                               |
| 4   | `Win` / `Win+D` / `Win+Tab` (task view)                 | ✅ hook swallows Win                                                                    | ✅                                                                                | ✅                       | ✅                                                                    | 🔁                               |
| 5   | `Ctrl+Alt+Del` → Task Manager                           | ❌ unhookable (SAQ)                                                                     | ⚠️ policy disables TaskMgr + watchdog (M2-08); refocus loop wins visually (M2-07) | n/a                      | ✅ owner pinning blocks the shell switch                              | 🔁 refocus + overlay (M2-13)     |
| 6   | Click another window / taskbar                          | 🔁 refocus guard ≤500 ms (M2-07); allowlisted apps permitted (M2-09)                    | 🔁                                                                                | ✅                       | ✅                                                                    | 🔁                               |
| 7   | Kill the app (Task Manager / `adb shell am force-stop`) | ⚠️ possible → session persisted, re-applied on next boot (M2-24); friction logged       | ⚠️ (T1 watchdog makes it harder; restore guaranteed)                              | ⚠️                       | ⚠️ possible but anti-uninstall blocks removal (M2-14); resume on boot | ⚠️                               |
| 8   | Reboot / power off                                      | 🔁 boot resume (M2-24 + M2-14 receiver)                                                 | 🔁                                                                                | 🔁                       | 🔁                                                                    | 🔁                               |
| 9   | Uninstall the app mid-session                           | ❌ requires admin/user confirm                                                          | ⚠️ T1 blocks uninstall (M2-14)                                                    | ⚠️ normal uninstall flow | ✅ `setUninstallBlocked` (M2-14)                                      | ⚠️                               |
| 10  | Clock manipulation (roll back to "end" the session)     | 🔁 monotonic-vs-wall tamper gate ends session, friction log (M2-20/M2-01)               | 🔁                                                                                | 🔁                       | 🔁                                                                    | 🔁                               |
| 11  | Early exit through the UI                               | 🔁 60 s reflection cooldown + PIN + mandatory reason (M2-01/M2-02/M2-18)                | 🔁                                                                                | 🔁                       | 🔁                                                                    | 🔁                               |
| 12  | Battery about to die                                    | 🔁 auto-unlock at ≤15% on battery, reason `battery` (M2-19) — safety beats stubbornness | 🔁                                                                                | 🔁                       | 🔁                                                                    | 🔁                               |

Unblockable-everywhere: `Ctrl+Alt+Del` itself (secure attention sequence),
`Win+L` (treated as safe — session survives via resume), UAC prompts. See
docs/LIMITATIONS.md.

## Verification procedures

- **Unit (CI, rule 17):** the full state-machine matrix lives in
  `packages/core/tests/focus-lock-session.test.ts` (M2-26) — every state ×
  operation; tamper forward/backward; battery gate end-to-end; resume
  equivalence. Battery gate + emergency allowlist + PIN vault have their own
  suites (M2-19/M2-15/M2-02).
- **Rust (CI, windows job):** lock_win decision fns
  (`should_swallow_key`, `needs_refocus`/`should_refocus`/allowlist,
  `file_name_tail`) + snapshot serde + reason validation (M2-06/07/09/23).
- **Compile gates (CI):** Kotlin (android matrix) + Rust (both jobs) compile
  for every native change (rule 17).
- **Manual (per release, tiered):**
  1. T0 Windows: start session → try routes 1–4 (blocked), 6 (refocus),
     7 (kill → reboot → resume), 10 (change clock → tamper end + friction log).
  2. T1 Windows (admin session): route 5 — Task Manager disabled by policy;
     end session → policy ALWAYS restored (verify `taskmgr` launches again).
  3. Android T2 (sideload, non-owner): enable the accessibility service
     (disclosure first, M2-17), start session → routes 1–4 return focus;
     kill app → boot resume; revoke permission mid-session → tamper-style
     friction log (M2-20).
  4. Android T1 (owner via wizard command, M2-10): routes 1–6 fully pinned by
     Lock Task; emergency dialer reachable during the pin (M2-15 tile);
     uninstall blocked (M2-14).
- **E2E smoke (M2-30):** lock apply → release round-trip headless in CI.

## Failure policy

Any route observed escaping its cell in a manual run gets re-queued at the
top of TASKS.md as a `[!]` fix task (X-03 cadence) — the matrix above is the
contract those fixes restore.
