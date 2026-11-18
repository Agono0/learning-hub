# Notification Center — user-managed delivery

One policy, one gate, one ledger. This document explains how notifications
are delivered across the app, and the rules for adding a channel.

## Layers (dependency-safe)

```
packages/core/src/notification-center/   ← PURE policy: catalog + evaluateDelivery (no I/O)
packages/db   ← persistence: user_settings.notification_prefs (JSON) + notification_log (append-only)
apps/web/src/server/handlers/notifications/{prefs,log}/route.ts ← GET/PUT policy, GET/POST ledger
apps/web/src/platform/reminders.ts       ← the dispatcher consults the gate before every OS send
apps/web/src/components/NotificationCenter.tsx  ← /notifications UI
```

Rule: **no module may call the OS notification APIs without passing
`evaluateDelivery` first** (the only legitimate exception is the explicit
"Send test" button in the center and the Permission Center, which the user
triggered themselves).

## The policy

`notification_prefs` (JSON on `user_settings`, defaults derived from the pure
catalog via `defaultNotificationPrefs()`):

- `masterEnabled` — off = the app never contacts the OS. In-app surfaces still work.
- `channels[channelId] = { enabled, viaOs }` — per-channel choice; `viaOs`
  routes to an OS notification or keeps it in-app.
- `quietHours { enabled, start, end }` — OS deliveries held overnight
  (handles 22:00→08:00 wrap). Held notifications never queue up — the morning
  is not greeted with a backlog.
- `dailyCap` — max OS notifications per local calendar day, across channels.
- `doNotDisturbUntil` — one-click silence (1h / 3h / until tomorrow morning,
  quiet-hours aware via `nextDndUntil`).

Decision order (first match wins, from `evaluateDelivery`):
`masterEnabled` → DND → channel enabled → quiet hours → daily cap → **deliver**.

Every outcome — delivered _and_ suppressed — is appended to
`notification_log` with its `DeliveryDecision`, and the history feed in the
center shows both. Nothing is hidden from the user; trust comes from
transparency.

## Daily cap timezone

The cap counts the **user's** calendar day. Routes accept `tzOffset` (the
client's `Date#getTimezoneOffset()`); `localDayBoundsIso` converts it to day
bounds. The client passes its offset when fetching prefs.

## Reminder planner vs delivery gate

`packages/core/src/reminders` decides _what_ deserves attention (due reviews,
streak risk…). `packages/core/src/notification-center` decides _how it may be
delivered right now_. They compose in `platform/reminders.ts`:
`planReminders` output → `evaluateDelivery` → OS send (or ledger row).

## Adding a channel (checklist)

1. Add the id to `NOTIFICATION_CHANNEL_IDS` + a complete catalog entry
   (`title`, `description`, `category`, `defaultEnabled`, `defaultViaOs`).
   New channels may default **off** — additive channels must not start
   buzzing existing users.
2. If it maps to a reminder kind, extend `REMINDER_KIND_TO_CHANNEL`.
3. Fire through the gate: `evaluateDelivery(channel, prefs, ctx)` → deliver
   via `platform/permissions.ts` helpers → `logNotification` (or the
   `/api/notifications/log` POST from the client).
4. Tests: core (defaults + gate branches), repo (round-trip), API (route
   contract). Update this file.

## Android notes

OS delivery requires the notification permission — see `docs/permissions.md`
for the capability map. Exact-alarm scheduling for timer completions is part
of the focus timer (see the timer docs); the gate above still applies.
