# CI fix batch 2 — W3 (run 45056518056; commits def443e, 5b5a467, 09c01e8, e4ae519)

All 11 CI test failures (4 files) — every fix verified with SCOPED vitest
runs on exactly the touched files (owner-approved protocol): 32/32
scheduler, 7/7 settings, 5/5 worklog, 4/4+3-skipped apk-delta, plus
calendar-import / boards-integration / search-tasks-unified / metrics-page
/ update-channel-flag / update-notes-api (43/43) as regression sweeps.

1. **generate-apk-delta.test.ts (2, ubuntu)** — the REAL root cause was not
   "bsdiff diffs the fixtures": the fake `bsdiff` stub wrote
   `process.argv[3]` — which inside a node script is the TARGET argument
   (`[node, script, base, target, patch]` → patch is `argv[4]`) — so every
   exec silently OVERWROTE the target fixture and left the patch path
   empty → "bsdiff produced an empty patch". The stub now writes
   `argv[4]`; the patch-bytes assertion corrected to the stub's real
   output (`'PATCHDATA'` is 9 chars × 64 = 576, the old `64 * 10` was
   never exercised because the empty-patch throw fired first). Fixtures
   are genuinely different buffers (different fill bytes + sizes), and the
   identical-files → empty-patch → full-APK-fallback contract stays
   covered by the explicit 'empty' stub test.
2. **update-scheduler.test.ts (6)** — three distinct root causes:
   - `vi.stubGlobal('navigator', …)` is unreliable in the node env (CI:
     probe returned `null` for every stubbed shape — the assignment does
     not replace Node's navigator binding). The probe now takes an
     INJECTED host: `isConnectionUnmetered({ connection })`; undefined
     falls back to the real global. The probe matrix tests inject hosts
     directly; no global stubbing anywhere.
   - `transportMocks.isTauri = true` never reached the module: the vi.mock
     factory copied the PRIMITIVE at import time. The mock now exposes
     `isTauri` through a getter (live reads).
   - `checkForUpdate`'s env-dependent cases imported the module FRESH
     (`freshUpdates()` = `vi.resetModules()` + dynamic import) because
     `APP_VERSION` is a module-level constant — `vi.stubEnv` after a
     static import can never change the verdict (the 'available' case
     collapsed to 'up-to-date').
   - `requestUpdateDownload` gained `opts.unmetered` (inject the probe
     result; undefined runs the real probe) — the apply-path gate matrix
     is now deterministic on every runner, and a new test pins the
     no-injection node behavior (unknown → defer).
3. **updates-settings.test.ts (1)** — `UpdateChangelog.tsx` (O1-26) lacked
   the default `import React`; vitest's classic JSX runtime crashed SSR of
   Settings > Updates with "React is not defined". Added.
4. **worklog-page.test.ts (1)** — the SSR assertion expected post-data copy
   ("re-derived automatically") that only renders after queries land:
   ranges are effect-set, so queries are DISABLED at SSR and the honest
   shell is the 'No tracked time yet' empty state. Assertions now pin that
   (and assert the corrections copy is absent, not present).

`updates.ts` public surface change: `isConnectionUnmetered(host?)` and
`requestUpdateDownload(file, opts?)` — both purely additive optional
params; no callers break (grep-verified: only the tests + the scheduler
use them).

S3-24 boards was already complete (bc0e7ea + the CI quadrant-filter fix
7524096 + S3-84/S3-100 6de7fed); nothing further pending in that lane.
