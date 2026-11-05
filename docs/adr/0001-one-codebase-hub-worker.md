# 0001. One codebase for web + native: runtime-neutral handlers, in-webview hub worker

- Status: Accepted
- Date: 2026-11-05

## Context

Learning HUB must run in the browser (Next.js on Node), on Windows and on
Android, and every change should ship to all of them without per-platform
edits. A Tauri webview has no Node runtime: no `better-sqlite3`, no `fs`, no
API routes. Maintaining a second backend (Rust or a separate JS server per
platform) would double every feature.

## Decision

- All backend logic lives in **runtime-neutral handlers** (`Request → Response`)
  under `apps/web/src/server/handlers/**`.
- The web target serves them through thin Next.js route shims (`app/api/**`).
- The native target builds a static export and runs the **same handlers** in a
  Web Worker (`apps/web/src/hub/worker.ts`) on **sqlite-wasm** persisted in
  **OPFS** (`opfs-sahpool`), routed by a static registry.
- UI code reaches the backend only through `@/lib/transport`, which picks HTTP
  or the worker.
- Outbound AI traffic from the worker goes through the main thread to
  `tauri-plugin-http` (no webview CORS).

## Consequences

- One implementation of every feature; the Rust shell stays thin.
- Handlers must never statically import Node-only modules (ESLint-enforced).
- Every route must be in the hub registry (test-enforced).
- The webview origin (`useHttpsScheme`, app `identifier`) must never change:
  OPFS data is scoped to it.
- Details: [docs/native.md](../native.md).
