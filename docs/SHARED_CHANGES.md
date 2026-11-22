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
