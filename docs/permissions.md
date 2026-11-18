# Device Permissions — architecture

One screen (`/permissions`), one catalog, one adapter. This document explains
how permission handling works across web, Windows, Android and iOS, and the
rules any new permission must follow.

## Layers (dependency-safe)

```
packages/core/src/permissions/      ← PURE catalog + decision logic (no I/O, unit-tested)
apps/web/src/platform/permissions.ts ← the ONLY module touching OS/browser APIs
apps/web/src/lib/use-permissions.ts  ← react-query/localStorage binding
apps/web/src/components/PermissionCenter.tsx  ← /permissions UI
apps/web/src/components/PermissionNudge.tsx   ← calm first-run banner (AppShell)
apps/web/app/permissions/page.tsx    ← page shell
```

Rule: **status detection and prompting never leak out of
`platform/permissions.ts`.** Components consume snapshots via
`usePermissionSnapshot()` and decisions via `usePermissionPrefs()`.

## The catalog

`PERMISSION_CATALOG` (core) is the single source of truth for:

- `title` / `summary` — copy shown on every surface (center, nudge, settings).
- `deniedImpact` — what *concretely* stops working without it (honest, no
  scare copy).
- `enables` — feature names surfaced in the readiness matrix.
- `platforms` — where the capability exists (`web | android | ios | desktop`).
- `canQuery` / `canRequest` — whether the runtime can read status and prompt.
- `grantSteps` — numbered OS-settings steps per platform for manual grants.
- `impact` — calm onboarding order (1 = ask first).

Current entries: `notifications`, `push` (web only), `exact_alarms` (Android,
manual), `battery_optimization` (Android, manual).

## Statuses

`granted | denied | undetermined | manual | unsupported`

- `manual` — the capability exists but JS cannot query it (Android battery
  optimization, exact alarms). We show guided OS-settings steps; we never
  guess "granted".
- `denied` is a **supported state, not an error**: the card explains what is
  limited and how to allow it. The app never re-prompts automatically.
- `unsupported` — off-platform; hidden from the readiness denominator.

## Decisions are device-local

The user's asking preferences (`ask_now | later | never` + last-asked stamp)
live in `localStorage` under `lh-permission-prefs` — never in SQLite — because
OS permissions are per-device. Rules enforced by pure code in core:

- At most **one** prompt offered at a time (`nextPermissionToAsk`, impact
  order).
- `later` = hide 3 days (`PROMPT_THROTTLE_MS`); `never` = hide until the
  user resets guidance in the center.
- Snapshots re-detect on window focus (`onPermissionsMaybeChanged`) so
  returning from OS settings updates instantly.

## Android specifics

- The notification runtime permission (Android 13+, `POST_NOTIFICATIONS`) is
  requested by `tauri-plugin-notification` via the JS path
  (`requestPermission('notifications')`).
- `exact_alarms` (`SCHEDULE_EXACT_ALARM`) and battery-optimization exemption
  are **special app accesses**: no prompt API exists, so the center teaches
  the exact OS-settings path. Timer reliability guidance lives in
  `docs/native/` (see the focus timer docs for Doze behavior).

## Adding a permission (checklist)

1. Add the id to `PERMISSION_IDS` + a complete catalog entry (including
   `grantSteps` for every platform it ships on — required when `canRequest`
   is false).
2. Add detection + request logic to `platform/permissions.ts` **only**.
3. Extend the core tests (catalog integrity, readiness, prompt decisions) and
   the web wiring-contract test.
4. Update this file and the Permission Center card order if `impact` changes.
