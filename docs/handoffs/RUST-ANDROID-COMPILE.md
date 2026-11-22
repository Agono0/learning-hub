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
