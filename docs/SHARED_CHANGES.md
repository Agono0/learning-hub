# SHARED_CHANGES — lead-applied file requests

Workers never edit shared files (`schema.ts`, `migrations/index.ts`,
`apps/web/package.json`, `tauri.conf.json`, `Cargo.toml`, `native.yml`,
settings columns, matrix doc). Append requests below; the lead applies them
in batches. Format: `[task] file → change → why`.

## Requests

- [O1-22] `.github/workflows/native.yml` → add a fail-fast guard step in the
  `android` matrix job (before the build) that exits with an error when
  `ANDROID_KEYSTORE_BASE64` is unset, so CI cannot silently auto-generate a
  new keystore and break sideload-update signatures. Exact YAML proposed in
  `docs/updates.md` §"Android signing — keystore persistence (O1-22)".

- [O1-02] `apps/native/src-tauri/Cargo.toml` → add three `[dependencies]` lines
  (this supersedes the earlier draft request that existed before O1-02 was
  claimed [~W1] and coded in `src/update.rs`):
  `minisign-verify = "0.2"`, `sha2 = "0.10"`,
  `ureq = { version = "2", default-features = false, features = ["tls"] }`.
  NO `hex` crate (update.rs hand-rolls lowercase hex) and NO plugin-http use
  on the Rust side (its `tauri_plugin_http::reqwest` re-export is async-only;
  the updater needs a blocking, timeout-bound client that is unit-testable
  without a tauri runtime — hence ureq, per the O1-02 brief "ureq or use
  plugin http"). Without these crates `src/update.rs` cannot compile and the
  native CI job fails.

- [O1-10] `apps/native/src-tauri/tauri.conf.json` → when wiring
  `tauri-plugin-updater`, set `plugins.updater.pubkey` to the exact contents of
  `apps/native/src-tauri/keys/lh-update.key.pub` (committed, key id
  `DB675CE9C8F2082D`) and `plugins.updater.endpoints` to the channel-pointers
  URLs (see docs/updates.md §"Channels & pointer model"): e.g.
  `https://github.com/Agono0/learning-hub/releases/download/channel-pointers/nightly.json`
  (per channel / store flavor). Why: O1-09 generated the keypair; the public
  key must be baked into the updater config before any signed nightly is
  shipped.
