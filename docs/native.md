# Native apps (Windows + Android) — Tauri 2

One codebase, three runtimes. `apps/web` is the **only** place UI and backend
logic live; the browser, the Windows app and the Android app all run it
unchanged. A change to any page or handler ships to every platform on the next
build — there is no per-platform code to keep in sync.

## How it fits together

```
apps/web (Next.js)
├── app/**/page.tsx          UI — identical on every platform
├── app/api/**/route.ts      thin shims → src/server/handlers   (web target only)
├── src/server/handlers/**   the backend: pure Request → Response functions
├── src/lib/transport.ts     THE network seam: apiGet/apiSend/apiUpload/apiStream/apiDownload
└── src/hub/                 in-webview backend for the native apps
    ├── worker.ts            Web Worker: sqlite-wasm (OPFS) + the same handlers
    ├── handlers-registry.ts static route table (test-enforced to match app/api)
    ├── protocol.ts          main ⇄ worker message contract
    └── net-bridge.ts        worker fetch → main thread → native HTTP (AI providers)

apps/native/src-tauri        thin Rust shell: dialogs, file writes, HTTP,
                             notifications, haptics, window state — no app logic
```

| Target | Build | `/api` served by | Database |
| --- | --- | --- | --- |
| `web` (default) | `next dev` / `next build` | Next.js route shims (Node) | better-sqlite3, `data/learning-hub.db` |
| `tauri` | static export → `apps/web/.next-tauri` | hub worker inside the webview | sqlite-wasm on OPFS (`opfs-sahpool`) |

The target is chosen by `LEARNING_HUB_TARGET=tauri` (set by the scripts
below). In that mode `next.config.ts` drops the `.ts` route shims from the
build and aliases Node-only modules (`better-sqlite3`, `node:fs`, …) to
`src/platform/shims/*` — they are imported by shared packages for their Node
code paths but never executed in the webview.

### Why AI calls go through the main thread

Provider APIs block browser CORS. Under Tauri, `@learning-hub/ai-adapters`
routes every request through `networkFetch`, which the worker points at
`net-bridge.ts`; the main thread executes it with `tauri-plugin-http` (Rust
reqwest) and streams the body back, so chat streaming still works. Tauri IPC is
not reachable from Web Workers, hence the hop.

## Commands

| Task | Command |
| --- | --- |
| Windows app, hot reload | `npm run app:dev` |
| Windows installer (NSIS + MSI) | `npm run app:build` |
| Android on device/emulator, hot reload | `npm run android:dev` |
| Android APK | `npm run android:build` |
| Build the native web bundle only | `npm run web:tauri` |
| Run that exact bundle in Chrome/Edge | `npm run preview:tauri` → http://localhost:4173 |

`scripts/tauri-android.mjs` prepares the Android environment automatically:
newest NDK under `ANDROID_HOME`, and a JDK Gradle can run on (Android Studio's
bundled JBR, or `ANDROID_JAVA_HOME`). Very new JDKs (27+) fail inside Gradle
with *Unsupported class file major version*.

## Rules that keep it working

- **UI never calls `fetch` directly** — always `@/lib/transport`.
- **A new API route needs a registry entry** in `src/hub/handlers-registry.ts`;
  `tests/hub-registry.test.ts` fails otherwise.
- **Handlers stay runtime-neutral**: no static `node:*` imports; Node-only work
  goes behind a dynamic import or an injected port (see `src/server/storage.ts`).
- **Don't change the webview origin** (`useHttpsScheme`, `identifier`): OPFS
  data is scoped to it, so changing either orphans every user's database.
- **Responsive by default**: navigation comes from `src/components/nav.ts`
  (phone tab bar + sheet, tablet rail, desktop sidebar); wide content scrolls
  inside `.scroll-x`; touch targets grow automatically on coarse pointers.
