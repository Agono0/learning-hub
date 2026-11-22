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

- [O1-02] `apps/native/src-tauri/Cargo.toml` → add three `[dependencies]` lines:
  `minisign-verify = "0.2"`, `sha2 = "0.10"`, `hex = "0.4"` (and `ureq = { version = "2", features = ["json"] }` ONLY if `tauri_plugin_http::reqwest` proves unusable for the updater fetch — plugin http is already a dependency and is preferred). Why: O1-02's update.rs needs minisign (Ed25519) verification of the signed manifest/pointer and per-file sha256 verification; without these crates the module cannot compile and the Rust CI job fails. O1-02 is currently unclaimable for workers because this file is LEAD-only.
