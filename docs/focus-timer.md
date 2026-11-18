# Global focus timer — architecture

One engine, visible everywhere, calm completions.

## Layers

```
packages/core/src/focus-timer/   ← PURE wall-clock engine (state machine, drift-free)
apps/web/src/lib/use-global-timer.tsx  ← provider: persistence, events → session PATCH + gated notifications
apps/web/src/components/dashboard/TimerWidget.tsx  ← home-page widget (registered in BUILT_IN_WIDGETS)
apps/web/src/components/TimerChip.tsx  ← compact nav chip (desktop sidebar + mobile header)
```

## Why wall-clock

State stores absolute `endsAt` instants; remaining time is _derived_
(`remainingSeconds(state, now)`), never accumulated. Backgrounding, device
sleep and reloads therefore cannot drift the clock, and any surface can show
the timer without owning it.

## Persistence

Device-local `localStorage` (`lh-focus-timer-state`), validated by zod on
load — corrupt data degrades to idle, never crashes the shell. Timer state is
a _device_ fact (like OS permissions); the graded session history lives in
`focus_sessions` via the canonical API.

## Completion flow

1. `advance(state, now)` derives `focus_complete` / `break_complete`
   (at most one of each per call — missed-hours gaps settle calmly, never
   spam 20 notifications).
2. Focus blocks PATCH their `focus_sessions` row (`/api/focus/[id]`), so XP
   and stats flow through the one canonical path.
3. Both events pass the **Notification Center gate** (`evaluateDelivery` —
   master switch, DND, channel choice, quiet hours, daily cap) before any OS
   notification; every decision lands in the `notification_log` ledger.
4. Foreground users also get a toast.

## Rules for contributors

- Never tick-accumulate time — derive from `endsAt`.
- Never call OS notification APIs directly from timer code; go through the
  gate (`evaluateDelivery`) + `platform/permissions.ts` helpers.
- The focus page's graded session flow (friction gate, leaks, Max Focus)
  remains authoritative; the global engine is the lightweight pomodoro
  companion and logs through the same session API.
