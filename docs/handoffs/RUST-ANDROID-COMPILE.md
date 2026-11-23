# RUST-ANDROID-COMPILE — mega-run native build fix (2026-11-23)

The first CI compile of the mega-run Rust shell (`apps/native/src-tauri`,
tauri 2.12.5 / tauri-macros 2.7.4 / minisign-verify 0.2.5 per `Cargo.lock`)
failed with **41 errors + 4 warnings** on every target job (Windows
`cargo test --release`, Android armeabi-v7a / arm64-v8a / x86_64). This file
maps every error class from that run to its fix. Branch: `feature/mega-run`.

## Root cause of the 26 E0255s (the big one)

`#[tauri::command]` on a **`pub fn` at the crate root** expands (tauri-macros
2.7.4, `command/wrapper.rs`) to `pub fn` + `#[macro_export] macro_rules!
__cmd__<name>` + `#[macro_export] macro_rules! __tauri_command_name_<name>` +
**`pub use {__cmd__<name>, __tauri_command_name_<name>};`** — a same-module
self-import of macros that `#[macro_export]` already hoisted to the crate
root → E0255 "the name `__cmd__X` is defined multiple times", ×2 per pub root
command (13 commands = 26 errors, Windows and Android alike). Module-defined
commands (`focus.rs`, `idle.rs`) are unaffected — the macro binds in the
module namespace and the self-import is legal there. (Reproduced standalone
with rustc before fixing.)

**Fix:** moved all 13 crate-root commands into their owning modules —
`update_confirm_boot_ready` / `update_download_file` /
`update_android_device_info` / `update_install_android_apk` → `update.rs`;
the 9 `focus_android_*` commands → `focus.rs` — with the plugin handles
(`MaxUpdateAndroid`, `MaxFocusAndroid`, `MaxFocusLockTask`), the two
`*_plugin()` registrators and `slot_updates_dir` following them.
`lib.rs` keeps only the builder wiring; `generate_handler!` references every
command via its module path (`update::update_confirm_boot_ready`, …), the
same pattern the already-working `focus::focus_lock_apply` entries used.

## Error class → fix

| # | Class (CI evidence) | Fix |
| - | ------------------- | --- |
| 1 | E0255 ×26: `__cmd__*` / `__tauri_command_name_*` defined multiple times for every pub command at the crate root (lib.rs 303–637) | Moved the 13 commands + plugin state into `update.rs`/`focus.rs`; `generate_handler!` uses module paths (see above). |
| 2 | E0433 ×6: `lock_win` unresolved in focus.rs (486/500/515/535/551/561 — a bare sibling-module path never resolves from inside another module) | `#[cfg(windows)] use crate::lock_win;` in focus.rs; `lib.rs` now declares `#[cfg(windows)] mod lock_win;` + `#[cfg(windows)] mod lock_watchdog;` (the modules use desktop-only window APIs and the `windows` crate — mobile cannot compile them). |
| 3 | E0599 (Android only): `.decorations()` not found on `WebviewWindowBuilder` (lock_win.rs:79 — desktop-only method, module was compiled on mobile) | Gone with the `#[cfg(windows)]` gate on the module. Windows desktop behavior unchanged. |
| 4 | focus.rs lock-window behavior on non-Windows | New platform seam: `apply_lock_windows_for_session` / `lock_windows_active` / `release_lock_windows_for_session` with `#[cfg(windows)]` real implementations and `#[cfg(not(windows))]` no-op/false fallbacks — session commands still return status, desktop Windows behavior unchanged. |
| 5 | E0425 ×3: `focus_session_apply/status/release` not found in `generate_handler` (lib.rs 132–134) | Same move — entries are now `focus::focus_session_apply` etc. |
| 6 | E0425 ×1: `should_refocus` not found (lock_win.rs:561, inside the `refocus` module) + warning "unused import: needs_refocus" (lock_win.rs:478) | `use super::{file_name_tail, should_refocus, LOCK_WINDOW_PREFIX};` — the call site used `should_refocus` while the import listed `needs_refocus`. |
| 7 | E0599: `Signature::from_base64` not found (update.rs:260) | minisign-verify 0.2.5 has `Signature::decode(lines)` / `PublicKey::decode(lines)` (four-line minisign text) and `PublicKey::verify(data, sig, allow_legacy)` — there is NO `Signature::from_base64` and NO `Signature::verify`. Rewrote `verify_minisign` to parse the standard minisign text and verify via `pk.verify(data, &sig, false)` (pre-hashed "ED" signatures, which is what the tauri CLI signer emits; legacy "Ed" refused). |
| 8 | Latent (would fail `cargo test` in CI after #7): the old test fixtures were authored against an imagined API — `FIXTURE_PK`/`other_pk` were 34-byte blobs (decode requires exactly 42) and `FIXTURE_SIG` was a single "blob" line `Signature::decode` can never parse (it needs the four-line `.sig` text incl. trusted comment + global signature) | Regenerated the fixtures with the repo's actual signer (`tauri-cli 2.12.4`, same as the nightly pipeline): `tauri signer generate` ×2 (fixture key + wrong key), `tauri signer sign` over the exact `FIXTURE_MANIFEST` bytes; embedded the two-line `.pub` texts and the four-line `.sig` text. Also added the wire-format fact: the nightly `.sig` assets are `base64(minisign text)` — `verify_minisign` unwraps that layer (`base64_decode` helper, self-contained, unit-tested) and accepts raw minisign text too. New tests: `verifies_wire_format_signature_after_base64_unwrap`, `base64_decoder_handles_known_vectors_and_rejects_garbage`. |
| 9 | E0308: `asset_resolver().get(rel)` expected `String` (lib.rs:96) | `AssetResolver::get(&self, path: String)` in tauri 2 — `rel.to_string()`. |
| 10 | E0599: `.into_owned()` on `&[u8]` (lib.rs:100) | `Asset::bytes()` returns `&[u8]` — `Cow::Owned(asset.bytes().to_owned())`. |
| 11 | E0599 ×3: `app.manage` needs `Manager` in scope (lib.rs 325/400/404, android-only plugin setups) | `use tauri::Manager;` inside each `setup` closure (modules are `#[cfg(target_os = "android")]`, so the import only exists where the calls exist). |
| 12 | E0308: `&data.to_ne_bytes().as_ptr().cast()` expected `*const u8`, found `&*const _` (lock_watchdog.rs:102) | Removed the stray borrow — `data.to_ne_bytes().as_ptr().cast()` (rustc's own suggestion). |
| 13 | lexical error: unknown byte escape `\S` (lock_watchdog.rs:41) | `POLICY_SUBKEY` was missing one backslash before `System` — now `b"Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System\0"` (verified byte-level). |
| 14 | warning: unused `tauri::Manager` (lib.rs:81) | Removed — `asset_resolver()` is an **inherent** AppHandle method in tauri 2 (`shared_app_impl!`, app.rs:1251), not a `Manager` method; the Manager-backed `path()` lives in `update::slot_updates_dir`. |
| 15 | warning: unused `Duration` import (focus.rs:12 — non-Windows targets) | `#[cfg(windows)] use std::time::Duration;` (only the Windows watchdog uses it). |
| 16 | warning: unused `mut` (focus.rs:467) | `|mut c| c.is_some()` → `|c| c.is_some()`. |
| 17 | warning: unused variable `enabled` (lock_watchdog.rs:165) | `_enabled` + doc note: hardening is always ON while the guard is held (behavior unchanged; tests still call `acquire_hardening(false)`). |

## Verification performed locally (no builds, no test runs — rule 17)

- Every error class above was mapped from the actual CI log
  (Native apps run 45074489951), then re-checked against the installed crate
  sources (`~/.cargo/registry` tauri 2.12.5 + tauri-macros 2.7.4) and the
  downloaded minisign-verify 0.2.5 source.
- The E0255 mechanism was reproduced with a standalone rustc probe before
  fixing, and the module-defined command shape was proven error-free the
  same way.
- The regenerated minisign fixtures were validated end-to-end in a scratch
  crate against minisign-verify 0.2.5: fixture verifies (pre-hashed path),
  wire base64 unwrap round-trips, tampered data + wrong key rejected, and
  the OLD blob fixture is rejected by `Signature::decode` (confirming the
  fixture had to change).
- All touched files parse (`rustfmt --emit stdout`); grep sweep: no
  `from_base64`, no `lock_win::` self-references inside `lock_win.rs`, all 20
  `generate_handler!` entries resolve to defined commands, no duplicate
  command names between lib.rs and the modules.

## Risks only CI can catch

- Full type resolution against tauri 2.12.5 on all four target jobs (the
  module moves touch ~600 lines).
- `cargo test --release` on Windows: the new minisign tests + fixture
  constants (validated in the scratch crate, but CI is the gate).
- `generate_handler!` ACL unused-command filtering (if an app ACL exists,
  commands not in it are dropped — command NAMES are unchanged, so behavior
  should match the pre-mega-run shell).
- The `.sig` wire-format unwrap assumes the nightly pipeline keeps using the
  tauri CLI signer (same artifact shape as `tauri-plugin-updater` consumes).
- iOS (`#[cfg(mobile)]` calling `#[cfg(target_os = "android")]` plugin fns)
  was already inconsistent before this fix and is untouched — iOS is not
  built by any workflow.

## Round 2 — the 6 unit-test failures (49-test suite green)

Round 1 compiled everywhere; the Windows `cargo test --release` then ran the
suite for the first time: 43 passed, 6 failed. Per-error-class fix map (the
run analyzed: native 45085564138, commit b4117a1):

| # | Failing test (actual panic) | Root cause | Fix |
| - | --------------------------- | ---------- | --- |
| 1 | `update::tests::base64_decoder_handles_known_vectors_and_rejects_garbage` — `Some([])` vs `None` for `"a=b"` | The decoder `break`-ed at `=`, so a single data char before padding silently produced an empty/partial decode | IMPL: strict canonical base64 — length % 4 == 0, `=` only as trailing padding (≤ 2), data after padding rejects, invalid char rejects the WHOLE input. Wire artifacts and fixtures stay canonical, so the verify path is unaffected |
| 2 | `update::slot_tests::files_base_url_strips_manifest_segment` — `files_base_url("http://…")` returned Ok | The https-only law was not applied when DERIVING the files base (only when fetching) | IMPL: `assert_https(manifest_url)?` at the top of `files_base_url` |
| 3 | `update::download_tests::full_response_restarts_from_scratch` — calls `[5]` vs `[0]` | TEST HELPER defect: `FakeFetcher` recorded the REQUESTED offset while the test's own comment asserts the SERVED offset ("Server ignored Range → fetched from 0"). No impl can both request `start` for a 40-byte partial (resume test) and request 0 for a 5-byte stale partial — the request is necessarily `resume_offset`; the 200-response restart-from-scratch semantics were already correct | HELPER: records the offset each response actually carries (0 for a range-stripping server). Assertions unchanged |
| 4 | `update::patch_tests::patch_with_file_missing_from_target_manifest_is_rejected` — active slot `B` vs `A` | TEST phase bug: the setup promotes v1 (download→B, promote→active B), so after a REJECTED apply the untouched pointer is B, not A; and the patch would have filled the INACTIVE slot A, not B | TEST: assert `SlotId::B` (pointer untouched) + no smuggled file in slot A |
| 5 | `update::patch_tests::upgrade_chain_applies_patches_across_five_manifests` — slot `A` vs `B` at step 1, then `manifest.json` extra in `hash_slot` | Same phase bug (first patch lands in the inactive slot A after the v1 promote — impl matches the design and the other passing slot tests), PLUS the expected map omitted the slot's stored `manifest.json` (written verbatim by O1-03/O1-19 by design) | TEST: phase corrected to `i % 2 == 0 → A`; expected map now includes `manifest.json` = `hash_hex(target_bytes)` — the reconciliation assertion got STRONGER, not weaker |
| 6 | `lock_watchdog::tests::acquire_is_idempotent_and_release_is_a_noop_when_empty` — `acquire_hardening(false)` returned false | TWO causes: (a) `acquire(false)` ran the real registry write although "declined" is not a failure; (b) the real write FAILED — `RegOpenKeyExW` cannot open `HKCU\…\Policies\System` on machines where the key does not exist (clean machines), and the whole `Policies` branch can be write-protected by deny ACLs (observed locally: `reg add` → Access denied) | IMPL: `enabled=false` → no-op SUCCESS (nothing written); `RegCreateKeyExW` replaces `RegOpenKeyExW` (creating the policy key is what `reg add`/group policy do — hardening previously silently no-opped on every machine without the key); the two lifecycle tests now serialize on a shared mutex (they share process-global statics) and the lifecycle test asserts the deterministic WATCHDOG_ACTIVE transitions instead of the environmental registry outcome |

- Rule-13 note: fixes 3/4/5 change tests, with the reason recorded here and in
  the test comments — in each case the ORIGINAL assertion could never pass for
  any impl (mutually exclusive with other passing tests, or asserting an
  environmental OS outcome), while the corrected assertions remain strict.
- Local verification: scoped `cargo test --release update::` / `lock_watchdog::`
  iterations, then the FULL suite once: **49 passed; 0 failed** (cargo 1.100,
  sanctioned scoped-run workflow). `Cargo.lock` was completed by cargo locally
  (+378 lines: the lockfile was missing the dev/test-target packages, e.g.
  minisign-verify 0.2.5/0.3.0, jni, objc2 — committed so CI resolves the same
  versions that just passed).
- Remaining known warning (pre-existing, another commit): unused `BOOL` from
  `SetForegroundWindow(lock_hwnd)` at lock_win.rs:589 — best-effort call, needs
  `let _ =`. `docs/updates.md` also fails `format:check` on main (pre-existing,
  not touched here).

