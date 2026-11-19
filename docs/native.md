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

| Target          | Build                                  | `/api` served by              | Database                               |
| --------------- | -------------------------------------- | ----------------------------- | -------------------------------------- |
| `web` (default) | `next dev` / `next build`              | Next.js route shims (Node)    | better-sqlite3, `data/learning-hub.db` |
| `tauri`         | static export → `apps/web/.next-tauri` | hub worker inside the webview | sqlite-wasm on OPFS (`opfs-sahpool`)   |

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

| Task                                   | Command                                         |
| -------------------------------------- | ----------------------------------------------- |
| Windows app, hot reload                | `npm run app:dev`                               |
| Windows installer (NSIS + MSI)         | `npm run app:build`                             |
| Android on device/emulator, hot reload | `npm run android:dev`                           |
| Android APK                            | `npm run android:build`                         |
| Build the native web bundle only       | `npm run web:tauri`                             |
| Run that exact bundle in Chrome/Edge   | `npm run preview:tauri` → http://localhost:4173 |

`scripts/tauri-android.mjs` prepares the Android environment automatically:
newest NDK under `ANDROID_HOME`, and a JDK Gradle can run on (Android Studio's
bundled JBR, or `ANDROID_JAVA_HOME`). Very new JDKs (27+) fail inside Gradle
with _Unsupported class file major version_.

## CI

- `ci.yml` (every push/PR): tests, the web build **and** the native web bundle
  (`npm run web:tauri`) — catches native-only breakage cheaply.
- `native.yml` (push to `main`, `v*` tags, manual): full Windows installer and
  Android APK builds. APKs are published directly to GitHub Releases as standalone
  `.apk` files (never wrapped in a `.zip`) and uploaded as workflow artifacts.

### Android APK Signing & Size Optimization

- **Signed APK by default:** Release builds are configured with `signingConfigs.release`.
  If custom credentials (`KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`
  or `ANDROID_KEYSTORE_BASE64` secret in CI) are present, it signs using the production key;
  otherwise it falls back to standard v1+v2 signing so the APK is always signed and
  immediately installable on Android devices without certificate errors.
- **Direct `.apk` distribution:** `native.yml` publishes raw `.apk` assets directly to
  GitHub Releases (`Learning-HUB-arm64-v8a.apk`, `Learning-HUB-universal.apk`), bypassing
  GitHub Actions zip wrappers.
- **Deep size optimizations:**
  - **ABI splits:** Produces dedicated `arm64-v8a` APKs for modern devices (slashing binary
    size by 60%+ compared to bundling all 4 ABIs) alongside universal APKs.
  - **R8 Full Mode & Minification:** `isMinifyEnabled = true`, `isShrinkResources = true`,
    and `android.enableR8.fullMode = true` strip unused AndroidX / Material classes and resources.
  - **Rust release optimization:** `opt-level = "z"`, `codegen-units = 1`, `lto = true`,
    and symbol stripping in `Cargo.toml`.
  - **Packaging cleanup:** Excludes superfluous license, metadata, and proto files from APK assets.

Auto-update via the Tauri updater plugin is planned but not wired — do not add
the `@tauri-apps/plugin-updater` npm dependency until the full chain lands:
Cargo plugin in `src-tauri/Cargo.toml`, plugin registration in `lib.rs`, the
`updater:default` capability, a `plugins.updater` section (pubkey + endpoints)
in `tauri.conf.json`, a UI update check, and release signing as the
prerequisite.

## Rules that keep it working

- **UI never calls `fetch` directly** — always `@/lib/transport`.
- **A new API route needs a registry entry** in `src/hub/handlers-registry.ts`;
  `tests/hub-registry.test.ts` fails otherwise.
- **Handlers stay runtime-neutral**: no static `node:*` imports; Node-only work
  goes behind a dynamic import or an injected port (see `src/server/storage.ts`).
  ESLint enforces this for `src/server/handlers`, `src/hub` and `src/lib`.
- **Don't change the webview origin** (`useHttpsScheme`, `identifier`): OPFS
  data is scoped to it, so changing either orphans every user's database.
- **Responsive by default**: navigation comes from `src/components/nav.ts`
  (phone tab bar + sheet, tablet rail, desktop sidebar); wide content scrolls
  inside `.scroll-x`; touch targets grow automatically on coarse pointers.
