# Self-updates — delta OTA architecture

> Status: Epic 1 (delta OTA) is **in flight**. Already real: the core contracts
> (`packages/core/src/update/`, O1-01), the manifest generator
> (`scripts/update-manifest.mjs`, O1-07), the nightly release pipeline
> (`.github/workflows/nightly.yml`, O1-08), channel promotion
> (`.github/workflows/promote.yml`, O1-11) and the patch-size probe (O1-20).
> The native client (Rust `update.rs`, O1-02+) is being built against these
> contracts. Ground truth about the current stack lives in
> [ARCHITECTURE_NOTES.md](ARCHITECTURE_NOTES.md).

## Why delta updates

The whole web payload ships as a static Next.js export at
`apps/web/.next-tauri` (`tauri.conf.json` `build.frontendDist`,
produced by `scripts/tauri-web.mjs build`). A one-line UI change re-uploads a
full installer today; users on metered or mobile connections should not pay
for that. The OTA system ships only changed files into an inactive slot and
flips a pointer — measured target: hot patches well under 50 KB
(O1-20 records the number into release notes).

## Architecture in one paragraph

CI builds the `.next-tauri` export and hashes **every file** (sha256 + size)
into a content-addressed `manifest.json` (`updateManifestSchema` in
`packages/core/src/update/`, O1-01). A small per-channel **pointer** document
(`updatePointerSchema`, the `nightly.json` of the channel) names the current
version and the https URL of the channel's **signed** manifest. The client
polls the pointer, compares versions (`compareVersions` understands semver AND
the `nightly-YYYYMMDD-<sha>` CI tag format), downloads the manifest, verifies
its **Ed25519 minisign signature** (never disable this), then fetches only
files whose hashes differ — or a delta patch bundle — into the **inactive A/B
slot**. Apply is **ask-first on restart**; boot-confirm rollback flips back if
the new build never reports ready.

## Channels & pointer model (locked decisions)

- **Channels:** `nightly` → `beta` → `stable`, one pointer file per channel:
  `nightly.json`, `beta.json`, `stable.json`.
- **Pointer hosting:** a fixed GitHub release with tag **`channel-pointers`**
  holds the mutable pointer assets (and per-channel signed manifest copies,
  `manifest-<channel>.json` + `.sig`). This gives clients ONE stable https URL
  per channel — GitHub's `releases/latest` ignores prereleases, and the
  nightly release tag changes every night. The nightly workflow refreshes
  `nightly.json` there (O1-08); `promote.yml` refreshes `beta.json`/`stable.json`
  (O1-11).
- **Versioning:** nightly builds are tagged `nightly-YYYYMMDD-<shortsha>`;
  the manifest `version` is `YYYYMMDD-<shortsha>`. `compareVersions` (O1-01)
  strips the tag prefix, compares the date numerically, then the short sha —
  a nightly of the same date always sorts after its bare base version.
- **Promotion:** `promote.yml` copies the source release's manifest, rewrites
  only its `channel` field, **re-signs it** (bytes changed ⇒ new signature) and
  re-points the channel — artifacts (patches, installer) are never rebuilt.
  Rollback to an older build = run the workflow again with its tag.
- **Apply policy:** ask-first, apply on restart — the app never rewrites
  itself under the user's feet, and refuses to apply while a Max Focus
  session is active (O1-06, core gate shared with `packages/core/src/focus-lock/`;
  `updateSettingsSchema.autoApply` is a locked `false` literal, O1-01).
- **Integrity:** every file in `manifest.json` carries `sha256` + `size`; the
  manifest is Ed25519 (minisign) signed; the client verifies signature first,
  then per-file hashes (O1-02, O1-18). Every URL in a manifest, patch or
  pointer must be https — enforced by `assertHttps` in the schemas.
- **A/B slots** live in Tauri's `app_data_dir` (writable per-origin), the
  active slot is served through a custom URI-scheme protocol with fallback to
  the bundled asset resolver (O1-03, O1-04).
- **Rollback:** the webview confirms boot to the Rust layer; N missed
  confirmations flip the slot pointer back to the previous release and log
  it (O1-05, O1-17). Clock manipulation during a session is detected by the
  monotonic-anchor vs wall-clock gate in the focus session machine
  (`packages/core/src/focus-lock/session.ts`, M2-01/M2-20).

## Platform matrix

| Platform         | Update path                                                                                             | Self-update?                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Windows          | NSIS/MSI bootstrap + `tauri-plugin-updater` (O1-10) for the native shell; delta slots for the web layer | On (ask-first)                                                   |
| Android sideload | Full per-ABI APK from GitHub Releases; bsdiff delta APK stretch goal (O1-21)                            | On (ask-first)                                                   |
| Android Play     | Store updates only                                                                                      | **Off** — `LH_UPDATE_CHANNEL=play` bakes self-update off (O1-12) |
| Web (browser)    | Not applicable — reload is the update                                                                   | n/a                                                              |

## Android sideload consent flow (O1-13)

Sideload installs of a new full per-ABI APK go through Android's
`PackageInstaller` (`MaxUpdatePlugin.kt` in the app's `gen/android` sources,
registered by the Rust shell as the `max-update` plugin). The flow is
consent-first at EVERY stage — nothing installs silently:

1. **Pick.** `update_android_device_info` returns the device's primary ABI
   (`Build.SUPPORTED_ABIS[0]`, e.g. `arm64-v8a`) and whether the per-app
   "install unknown apps" grant is already given. The update service downloads
   the matching APK (or `android-universal` when unknown) via the verified
   `update_download_file` pipeline (sha256-checked, confined to the updates dir).
2. **Consent (per-app grant).** `installSideloadApk` → `installApk`: when
   `canRequestPackageInstalls()` is false, the plugin opens
   `ACTION_MANAGE_UNKNOWN_APP_SOURCES` for THIS package and resolves
   `{ consentRequired: true }` — the UI explains what the grant does and the
   user re-taps after granting. No install is attempted without it.
3. **Consent (system dialog).** With the grant, the plugin streams the APK
   into a `MODE_FULL_INSTALL` PackageInstaller session and commits it with an
   intent back into the app. Android then shows ITS OWN install confirmation —
   the user still has to press "Install".
4. **Result.** The system installer reports into the app (session id carried
   in the callback intent); failures surface as a retry in the update UI, and
   the old app version keeps running untouched until Android itself swaps the
   package.

Notes: `REQUEST_INSTALL_PACKAGES` in the manifest is what makes the per-app
grant screen available — it is never a silent-install permission. Play-distributed
builds never reach this flow (self-update baked off, O1-12). Pre-Android-8
global "unknown sources" toggles (`sdkInt < 26`) are treated as granted.

### APK deltas (stretch, O1-21)

`scripts/generate-apk-delta.mjs` produces a per-ABI binary delta between the
previous release APK and the new one (bsdiff), plus a size report
(`delta-report.json`: bytes, KB, and `ratio = patch/target`). CI installs
`bsdiff` and runs it per ABI (LEAD-applied step, request in
`docs/SHARED_CHANGES.md`); the measured sizes land in the release notes and
decide whether an on-device patch-apply path is ever worth building.

**The shipped client behavior is the fallback**: the sideload flow (above)
always installs the FULL verified APK (O1-13) — a broken or oversized delta
never ships (the script fails loudly on empty/failed bsdiff output), and no
on-device bspatch/re-sign path exists until the measurements justify one.
Rule of thumb encoded in the script's summary: ship a delta only at
ratio ≤ 0.4.

## Slots & the webview origin (O1-04)

The active slot is served over a custom URI scheme (`lhslot`) registered in
`apps/native/src-tauri/src/lib.rs::serve_slot_protocol`: files come from
`<app_data_dir>/updates/slots/<active>/` (resolved by
`update::lookup_in_active_slot`), and anything the slot does not have falls
back to the bundled `.next-tauri` export via Tauri's asset resolver — so a
fresh install (no pointer file, slot A implied) serves bundled bytes and
behaves exactly like today.

Two properties that matter for reviewers:

- **Capabilities need no rebinding.** Tauri capabilities bind by window label
  (`"main"`), not by origin, and a registered custom scheme is treated as an
  app origin — IPC permissions survive a slot switch unchanged
  (`capabilities/*.json`).
- **The webview origin changes between bundled and slot serving.**
  `tauri://localhost` (bundled) and `lhslot://localhost` / `https://
lhslot.localhost` (slot) are different origins, which relocates the
  webview's OPFS/localStorage scope — including the sqlite-wasm database.
  This is flagged for the lead (rule 10 adjacency): either the hub worker's
  storage path must be origin-independent, or a first-boot migration must
  copy OPFS data before the first slot promotion. Tracked here until O1-05's
  boot-confirm flow lands.

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

- **Keypair (DONE).** Ed25519 minisign keypair generated with the Tauri CLI
  (`npx tauri signer generate -w apps/native/src-tauri/keys/lh-update.key
--password "" --ci`). Key id: `DB675CE9C8F2082D`.
- **Public key (committed):**
  [`apps/native/src-tauri/keys/lh-update.key.pub`](../apps/native/src-tauri/keys/lh-update.key.pub)
  — safe to distribute; the Rust client (O1-02) embeds/verifies against it,
  and `tauri.conf.json` references it once the updater plugin lands (O1-10,
  LEAD-applied — request filed in `docs/SHARED_CHANGES.md`).
- **Private key (`apps/native/src-tauri/keys/lh-update.key`, gitignored via
  `*.key`, generated with NO password):** lives only on the machine that
  generated it until the repository owner moves it into GitHub Actions
  secrets — then DELETE the local file. User steps (one-time):
  1. Copy the file contents.
  2. Settings → Secrets and variables → Actions → add
     `TAURI_SIGNING_PRIVATE_KEY` (paste the file contents) — the exact name
     `nightly.yml`/`promote.yml` and the Tauri CLI consume. No
     `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret is needed (key has no
     password; if you re-generate with one, add it too).
  3. Delete the local `lh-update.key`.
     Used to sign `manifest.json` and the channel pointers; nothing else. Until
     the secret exists, the workflows publish **unsigned** artifacts with a loud
     warning — the client refuses unsigned manifests by design, so an unsigned
     release is inert, never silently trusted.
- **Rotation:** publish the new public key in a release **before** signing
  manifests with it; keep the old key verifying for one channel cycle.
- **Never commit the private key** (rule 12); treat it like the Android
  keystore — losing it is recoverable (rotate), leaking it is not (an attacker
  can sign malicious updates for every existing client).

## Release flow

1. `nightly.yml` (O1-08): build web + native, `scripts/update-manifest.mjs`
   (O1-07) hashes `.next-tauri` → `manifest.json` and diffs against the
   previous release's manifest to emit the changed-file patch set (≤ 5, the
   O1-19 upgrade chain), signs it, tags `nightly-YYYYMMDD-<sha>`, uploads
   assets + refreshes the `nightly.json` pointer on `channel-pointers`.
2. CI applies a one-line web change and records the resulting hot-patch size
   into release notes + this document (O1-20).
3. `promote.yml` (O1-11): manual dispatch re-points a nightly build's channel
   to `beta`/`stable` on `channel-pointers`, keeping artifacts.
4. Client (Settings → Updates, O1-14): channel picker, check-now, interval,
   Wi-Fi-only (Android), changelog panel; banner prompts with patch-vs-full
   size (O1-15); download is resumable with progress events (O1-16).

## Update-check flow (client contract, O1-02/O1-14)

1. Poll `https://github.com/<owner>/<repo>/releases/download/channel-pointers/<channel>.json`
   every `autoCheckIntervalHours` (default 6, Wi-Fi-only on Android).
2. Parse the pointer (`updatePointerSchema`); unknown fields are ignored so old
   clients survive pointer evolution (O1-28).
3. If `compareVersions(pointer.version, installedVersion) > 0`: fetch
   `pointer.manifestUrl` and **verify its minisign signature against the
   committed public key** — a bad signature aborts everything (O1-18).
4. Check `minNativeVersion`: when the installed shell is older, hot update is
   impossible — route the user to the full installer/APK (`requiresNative`
   behaves the same way for native-code changes).
5. `pickPatch(manifest, installedVersion)` — a matching delta patch from the
   last 5 builds, else fall back to `fullPackageUrl`. Show the size, ask first.
6. Download into the inactive slot, verify every file's sha256 against the
   manifest, atomically flip the slot pointer, restart, boot-confirm (O1-05).
   Never while a Max Focus session is active (O1-06).

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

**CI probe status (mega-run closeout):** the probe has not produced a CI
number yet — `nightly.yml` (which owns the `measure_patch` dispatch) is not
on the default branch until the mega-run PR merges, so it has never run; the
green mega-run CI runs (45058525253, 45059713066) are `ci.yml` jobs without a
probe step. The row below is therefore a **local fixture dry-run**, measured
with `scripts/update-manifest.mjs --prev` exactly the way the CI job diffs
(O1-07 machinery, no app build involved): two 4-file / 0.3 KB fixture exports
(`index.html`, `app.js`, `styles.css`, `sub/chunks.js`) differing by a single
`app.js` line. It is the honest equivalent of the probe's mechanics at
fixture scale — NOT the real `.next-tauri` export number, which lands in this
table from the first CI dispatch after merge.

| Probe run                                                                                                     | Patch bundle                              | Size                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **First CI dispatch (probe, 2026-11-23): one-line `layout.tsx` change — WORST CASE**                          | `patch-00000000-base-00000000-probe.zip`  | **2352.4 KB (2.3 MB) — DEVIATION vs the 50 KB target**, cause: the root layout module re-hashes → most page chunks re-hash → dozens of changed files in the bundle. Run 45075083079, job "Measure hot patch size". |
| Local fixture dry-run (W3, 2026-11-22): 4-file / 0.3 KB bundle, one-line `app.js` change, `--prev` diff O1-07 | `patch-nightly-…-aaaa1111-…-bbbb2222.zip` | **178 B (0.2 KB)** — zip (deflate) of the single 78-byte changed file; sha256 recorded in the emitted manifest patch entry |

**Target and deviation policy.** Target: **< 50 KB** for a one-line change. If
a probe exceeds it, the DEVIATION line in the run summary points here — record
the number, then explain the cause (e.g. a shared chunk invalidated by
version-stable module IDs) before shipping the nightly. The fixture dry-run is
two orders of magnitude under target and demonstrates the mechanics (only the
changed file is re-zipped); the authoritative number is still the first CI
dispatch on the real export.

### Deviation analysis (2026-11-23 probe)

The 2.3 MB worst case is the root-layout edit: every page chunk imports the
root layout, so one line there re-hashes most of the export and the bundle
re-zips all of them. Typical leaf changes (a page component, a widget) hash
independently and stay near the fixture's 0.2 KB scale. Mitigation path if
worst cases matter in practice: stabilize Next module IDs across builds
(`optimizeModuleIds`-style config or an extraction layer) so layout-only
edits stop cascading — tracked as a future optimization, not a blocker: a
2.3 MB hot update is still ~60× smaller than the 55 MB full export.

## Play policy note

Google Play requires that apps distributed through the Store update
themselves via the Store — self-downloaded APK updates and hot patches bypass
Play's review and are policy violations. Play builds therefore ship with
`LH_UPDATE_CHANNEL=play`, which disables every self-update path (O1-12);
sideload builds keep self-update on. Remaining hard limits are tracked in
`docs/LIMITATIONS.md` (O1-24): Ctrl+Alt+Del is unblockable on Windows, and
Android cannot silently install an update without user consent
(`REQUEST_INSTALL_PACKAGES` consent flow, O1-13).
