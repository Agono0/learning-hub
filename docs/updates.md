# Self-updates — delta OTA architecture

> Status: Epic 1 (delta OTA) is **in flight** — this document describes the
> target architecture and the parts already true today. Sections marked with a
> task ID (`O1-xx`, see `TASKS.md`) are not yet implemented. Ground truth about
> the current stack lives in [ARCHITECTURE_NOTES.md](ARCHITECTURE_NOTES.md).

## Why delta updates

The whole web payload ships as a static Next.js export at
`apps/web/.next-tauri` (`tauri.conf.json` `build.frontendDist`,
produced by `scripts/tauri-web.mjs build`). A one-line UI change re-uploads a
full installer today; users on metered or mobile connections should not pay
for that. The OTA system ships only changed files into an inactive slot and
flips a pointer — measured target: hot patches well under 50 KB
(O1-20 records the number into release notes).

## Channels & pointer model (locked decisions)

- **Channels:** `nightly` → `beta` → `stable`, pointer files per channel
  (`nightly.json`, …) hosted on **GitHub Releases** (O1-01, O1-08, O1-11).
- **Apply policy:** ask-first, apply on restart — the app never rewrites
  itself under the user's feet, and refuses to apply while a Max Focus
  session is active (O1-06, core gate shared with `packages/core/src/focus-lock/`).
- **Integrity:** every file in `manifest.json` carries `sha256` + `size`; the
  manifest is Ed25519 (minisign) signed; the client verifies signature first,
  then per-file hashes (O1-02, O1-18).
- **Rollback:** the webview confirms boot to the Rust layer; N missed
  confirmations flip the slot pointer back to the previous release and log
  it (O1-05, O1-17).
- **A/B slots** live in Tauri's `app_data_dir` (writable per-origin), the
  active slot is served through a custom URI-scheme protocol with fallback to
  the bundled asset resolver (O1-03, O1-04).

## Platform matrix

| Platform         | Update path                                                                                             | Self-update?                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Windows          | NSIS/MSI bootstrap + `tauri-plugin-updater` (O1-10) for the native shell; delta slots for the web layer | On (ask-first)                                                   |
| Android sideload | Full per-ABI APK from GitHub Releases; bsdiff delta APK stretch goal (O1-21)                            | On (ask-first)                                                   |
| Android Play     | Store updates only                                                                                      | **Off** — `LH_UPDATE_CHANNEL=play` bakes self-update off (O1-12) |
| Web (browser)    | Not applicable — reload is the update                                                                   | n/a                                                              |

## Android signing — keystore persistence (O1-22)

**Problem.** `scripts/tauri-android.mjs` signs release APKs from
`KEYSTORE_FILE`/`KEYSTORE_PASSWORD`:

- if `ANDROID_KEYSTORE_BASE64` is set, it decodes it to `release.keystore`;
- **otherwise it AUTO-GENERATES a keystore via `keytool`** (default store
  password `learninghub123`).

A CI run without the secret therefore produces a different signing key every
time. Android refuses to install an update whose signature does not match the
installed app — sideload deltas would be impossible and users would have to
uninstall/reinstall each release.

**Required setup (one-time, user action):**

1. Generate the release keystore once, locally:
   ```sh
   keytool -genkeypair -v -keystore release.keystore \
     -alias learninghub -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Add **two** repository secrets (Settings → Secrets and variables → Actions):
   - `ANDROID_KEYSTORE_BASE64` — base64 of `release.keystore`
     (`base64 -w0 release.keystore` / on macOS `base64 -i release.keystore`).
   - `KEYSTORE_PASSWORD` (and `KEY_ALIAS` if non-default) — the store/key
     passwords from step 1.
3. **Keep `release.keystore` out of git** (it is build output/secret material;
   rule 12). Back it up outside the repository — losing it forfeits the
   install base.

**Workflow guard (requested to LEAD via `docs/SHARED_CHANGES.md`).** The
`android` matrix job in `.github/workflows/native.yml` gains a fail-fast step
before building release APKs:

```yaml
- name: Require persisted Android keystore
  if: ${{ github.event_name != 'workflow_dispatch' || env.REQUIRE_KEYSTORE == '1' }}
  run: |
    if [ -z "${ANDROID_KEYSTORE_BASE64:-}" ]; then
      echo "::error::ANDROID_KEYSTORE_BASE64 is not set — CI would generate a NEW keystore and break sideload updates."
      exit 1
    fi
  env:
    ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
```

The `keytool` fallback in `scripts/tauri-android.mjs` remains **local dev
only** (running `npm run android:build` on a workstation); CI release builds
must never rely on it. Play-flavor builds (O1-30) use the same persisted
keystore so store and sideload artifacts share an identity where policy allows.

## Manifest signing key ceremony (O1-09)

- **Keypair:** Ed25519 minisign keys generated once (`O1-02` verifies with
  `minisign-verify` + `sha2` in `apps/native/src-tauri/src/update.rs`).
- **Public key:** committed to the repository (and referenced by
  `tauri.conf.json` once the updater plugin lands — LEAD-applied file).
- **Private key:** GitHub Actions secret (e.g. `LH_UPDATE_SIGNING_KEY`),
  used only by the nightly workflow (O1-08) to sign `manifest.json`.
- **Rotation:** publish the new public key in a release **before** signing
  manifests with it; keep the old key verifying for one channel cycle.

## Release flow (target)

1. `nightly.yml` (O1-08): build web + native, `scripts/update-manifest.mjs`
   (O1-07) hashes `.next-tauri` → `manifest.json` and diffs against the
   previous release's manifest to emit the changed-file patch set, signs it,
   tags `nightly-YYYYMMDD-<sha>`, uploads assets + channel pointer.
2. CI applies a one-line web change and records the resulting hot-patch size
   into release notes + this document (O1-20).
3. `promote.yml` (O1-11): manual dispatch re-tags a nightly build's pointer to
   `beta`/`stable`, keeping artifacts.
4. Client (Settings → Updates, O1-14): channel picker, check-now, interval,
   Wi-Fi-only (Android), changelog panel; banner prompts with patch-vs-full
   size (O1-15); download is resumable with progress events (O1-16).

## Measured hot patch size (O1-20)

**Method.** Dispatch `Nightly OTA` with `measure_patch = true`. The
`measure-patch` job builds the web export twice: once as the baseline, then
after appending a single comment line to `apps/web/app/layout.tsx` (a real
one-line web change), regenerating the export both times. The second export is
diffed against the first via `scripts/update-manifest.mjs --prev` (O1-07), so
the measured artifact is exactly the hot patch a nightly would ship for a
one-line edit: only re-hashed chunks, zipped. The job prints the patch size in
KB, fails loudly when the probe changes no files, and writes the number to the
workflow run summary — copy it into the nightly release notes.

**Recorded results.**

| Probe run                                                   | Patch bundle | Size |
| ----------------------------------------------------------- | ------------ | ---- |
| _(first CI dispatch — record the step-summary number here)_ | —            | —    |

**Target and deviation policy.** Target: **< 50 KB** for a one-line change. If
a probe exceeds it, the DEVIATION line in the run summary points here — record
the number, then explain the cause (e.g. a shared chunk invalidated by
version-stable module IDs) before shipping the nightly. Local machines never
produce this number (rule 17: builds run in CI only), so this table is filled
from CI dispatch runs, not from a workstation.

## Play policy note

Google Play requires that apps distributed through the Store update
themselves via the Store — self-downloaded APK updates and hot patches bypass
Play's review and are policy violations. Play builds therefore ship with
`LH_UPDATE_CHANNEL=play`, which disables every self-update path (O1-12);
sideload builds keep self-update on. Remaining hard limits are tracked in
`docs/LIMITATIONS.md` (O1-24): Ctrl+Alt+Del is unblockable on Windows, and
Android cannot silently install an update without user consent
(`REQUEST_INSTALL_PACKAGES` consent flow, O1-13).
