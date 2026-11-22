# Max Focus — the device lock

> Max Focus turns a device into a single-purpose learning machine for a fixed
> session: fullscreen lock surfaces on every monitor, OS-shell escapes
> suppressed, an anti-gaming early-exit gate, and safety valves that always
> win. This document is the architecture + operator reference; the escape-route
> verification matrix lives in
> [docs/MAX_FOCUS_TESTPLAN.md](MAX_FOCUS_TESTPLAN.md), hard platform limits in
> [docs/LIMITATIONS.md](LIMITATIONS.md).

## Architecture in one paragraph

The web layer owns the session STATE MACHINE — a pure module in
`packages/core/src/focus-lock/session.ts` (M2-01): `locked → cooldown →
can_confirm → ended` with a 60-second reflection cooldown, a 4-hour absolute
hard cap (`hardCapAtMs`), five unlock reasons (`timer | pin | battery |
failure | tamper`), and tamper detection that compares wall-clock elapsed
against a monotonic anchor on every tick. The native layers are the platform
ACTUATORS: Rust applies fullscreen lock windows per monitor + a session-scoped
keyboard hook + a foreground refocus guard (Windows, `lock_win.rs`,
M2-05/06/07/09), Kotlin enforces Lock Task or the AccessibilityService
watcher + overlay backstops (Android, M2-10/11/12/13/14). Apply/status/release
commands emit bridge events (`max-focus://applied|released`) that the session
UI consumes (M2-23).

## Session lifecycle

1. **Start** (pre-session checklist, M2-16): permissions audited, allowlist
   chosen, explicit confirm → `startMaxFocusSession` (machine, `locked`),
   `focus_session_apply` (native), session persisted for resume (M2-24).
2. **Locked**: `advanceSession` ticks with paired wall+monotonic clock
   readings; the hard cap ends the session (reason `timer`) no matter what.
3. **Early exit** (M2-18): `locked → cooldown` (60 s reflection),
   `cooldown → can_confirm`, then PIN verified (M2-02 vault) + mandatory
   reflection note → `ended` (reason `pin`). The cooldown cannot be bypassed
   even with the PIN; re-requesting keeps the EARLIEST request.
4. **System ends**: battery ≤15% on battery power (M2-19), watchdog failure,
   or clock tamper (M2-20) → `forceUnlockSession` with the logged reason.
5. **Resume** (M2-24): a reboot or kill is not an exit — the persisted
   session re-applies on boot with a fresh monotonic anchor (original
   deadlines preserved); the report card (M2-34) shows cap/battery endings.

## Tiers (per platform)

| Tier        | Windows                                                                       | Android                                                                          |
| ----------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| T0 plain    | lock windows (M2-05)                                                          | lock surface                                                                     |
| T1 hardened | optional elevation: DisableTaskMgr policy + watchdog, ALWAYS restored (M2-08) | Device Owner: Lock Task pinning (M2-11), anti-uninstall (M2-14), silent installs |
| T2 fallback | hook + refocus guard only (M2-06/07/09)                                       | AccessibilityService watcher + overlay + UsageStats backstops (M2-12/13)         |

Android Tier 1 is provisioned once via ADB — the setup wizard shows the exact
command (M2-10):

```
adb shell dpm set-device-owner dev.learninghub.app/dev.learninghub.app.MaxDeviceAdminReceiver
```

Enabling device admin alone grants nothing; Owner status is what enables Lock
Task and silent install sessions.

## PIN + recovery (M2-02)

- The exit PIN is 4–12 digits, stored ONLY as a PBKDF2-HMAC-SHA256 record
  (600k iterations, per-record CSPRNG salt, hex fields) inside the user
  settings JSON — never plaintext, never transportable.
- First use sets PIN + optional security question; the answer is normalized
  (trim + lowercase) and hashed under its OWN salt. Recovery verifies the
  answer and re-enables setting a NEW pin — the old one is never revealed.
- Verification is rate-limited at the handler (M2-04); the machine consumes
  the boolean verdict only (`confirmSessionExit(..., { pinVerified })`).
- The PIN never unlocks instantly from any state: even verified, the
  cooldown must have elapsed (`can_confirm` is unreachable without it).

## Emergency calls (M2-15)

The emergency dialer is ALWAYS reachable: the session's effective app
allowlist is `user apps ∪ SYSTEM_ALLOWED_APPS` (every known OEM dialer +
contacts + telecom) — enforced in core (`mergeAllowlists`) so no
configuration, corruption, or sync can remove it, and surfaced as an
always-visible `tel:` tile in the session surface. Regional emergency
numbers are never hardcoded; the tile opens the platform dialer. On Windows
the `tel:` flow is never swallowed by the keyboard hook (only Win/Alt+Tab/
Alt+F4/Ctrl+Esc are).

## Store disclosures (M2-17)

Both permission screens live in `MaxFocusDisclosures.tsx` and are shown
BEFORE any settings jump:

- **Accessibility (Tier 2)**: observes window transitions (package names)
  ONLY — content access is disabled at the config level; acts only during an
  active session; revocable in system settings; nothing recorded or sent.
- **Device admin**: session notification + Owner-tier anti-uninstall; never a
  wipe, never location, never data reading; revocable in Settings → Security
  → Device admin apps (the session becomes softer — Tier 2 — and the app
  keeps working).

The same privacy law is enforced structurally on Android: the watcher's
service config sets `canRetrieveWindowContent="false"`.

## Security notes (admin/watchdog, M2-35)

- The admin tier's policy changes are per-session and ALWAYS restored on end
  (drop-guard principle); watchdog never persists secrets (it reads no
  credentials; it watches process state only).
- The PIN vault contains no keys that protect other data — leaking it cannot
  affect sync, backups, or AI providers.
- The keyboard hook records nothing: it is a swallow-decision over virtual
  key codes (see `lock_win.rs::should_swallow_key`).
- Session anchors are monotonic (`elapsedRealtime` / interrupt time), so wall
  clock changes cannot extend or fake a session (M2-20), and the resume path
  re-bases anchors honestly (M2-24).

## Test plan

docs/MAX_FOCUS_TESTPLAN.md — the escape-route × tier × platform matrix with
unit/compile/manual procedures.
