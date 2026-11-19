# Error handling — one voice for every failure

Users see honest, specific, actionable failures — never stack traces, never
ad-hoc per-page strings. One pure taxonomy decides the copy; the UI layers
only decide WHERE it renders.

## Layers (dependency-safe)

```
packages/core/src/errors/            ← PURE taxonomy: classifyError + retry policy (unit-tested)
apps/web/src/lib/transport-retry.ts  ← GET-only retry with backoff (mutating calls never auto-retry)
apps/web/src/lib/use-api-error.ts    ← hook: classify + toast + remember
apps/web/src/ui/ErrorBoundary.tsx    ← crash containment for widget-sized subtrees
apps/web/src/ui/OfflineBanner.tsx    ← honest connection state in the chrome
apps/web/app/error.tsx · global-error.tsx  ← route-level boundaries
```

## The taxonomy

`classifyError(err, { online })` → `{ code, title, recovery, canRetry, detail }`:

| Code           | Trigger                         | Retry? | Copy intent                                  |
| -------------- | ------------------------------- | ------ | -------------------------------------------- |
| `offline`      | `!online`, or network TypeError | yes    | "You're offline — saved data still works"    |
| `server`       | HTTP ≥ 500                      | yes    | "The server hit a problem — try again soon"  |
| `not_found`    | HTTP 404                        | no     | "Deleted or outdated link — refresh"         |
| `validation`   | HTTP 400/422                    | no     | "Fix the highlighted input"                  |
| `unauthorized` | HTTP 401/403                    | no     | "Sign in again"                              |
| `timeout`      | 408 / AbortError                | yes    | "Took too long — a retry is faster"          |
| `storage`      | Quota errors                    | yes    | "Couldn't save on this device"               |
| `unknown`      | everything else                 | yes    | "Unexpected — try again, report if repeated" |

Rules:

- Server `detail` NEVER appears in the headline — it rides in `detail` for
  logs and the copy-details affordance.
- Retry is offered only when `canRetry` (a retry can actually succeed).
  `shouldRetry(error, attempt)` caps at 2 attempts, backoff 800ms → 1.6s
  (ceiling 15s).

## Retry policy

`apiGetRetry` (transport-retry) retries **GETs only**. Mutations (POST/PUT/
PATCH/DELETE) are never auto-retried — a retried mutation can double-commit;
the honest path is the failure toast on the action itself.

## Crash containment

The dashboard wraps every widget in `<ErrorBoundary label={w.title}>`: a
crash in one card renders a classified Callout + Try-again (max 2 in-place
resets, then "Reload the page"), and the rest of the page keeps working.
Full stacks go to the console, never to the user.

## Adding a failure surface (checklist)

1. Classify with `classifyRequestError` / `useApiError().present` — no
   hand-written fallback strings.
2. Retry affordances only when `error.canRetry`.
3. Wrap any third-party/plugin-rendered subtree in `ErrorBoundary`.
4. Extend the core taxonomy tests when adding a code; update this file.
