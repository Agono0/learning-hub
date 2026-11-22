//! Max Focus admin-tier hardening (M2-08): `DisableTaskMgr` policy +
//! re-assert watchdog, ALWAYS restored.
//!
//! Tier-2 hardening for Windows sessions: when the caller opts in
//! (optional elevation per session — the locked Phase-1 decision), the
//! per-user policy value `HKCU\Software\Microsoft\Windows\CurrentVersion\
//! Policies\System\DisableTaskMgr` is set to 1 so Task Manager cannot be
//! launched at all, and a watchdog thread re-asserts the value every
//! [`WATCHDOG_INTERVAL_MS`] for as long as the session lives — anything
//! that resets the policy (another tool, a tame "tweak" utility) is put
//! back within one interval.
//!
//! **The restore guarantee is structural**: the returned
//! [`TaskMgrGuard`] writes the value back to 0 in its `Drop`
//! implementation — panics, early returns and normal release all run it
//! (Rust runs `Drop` on unwind; only `std::process::abort` skips it, and
//! the next session's apply re-asserts anyway). This mirrors the M2-08
//! contract in docs/max-focus.md §"Tier 1 hardened".
//!
//! Self-contained extern bindings to advapi32 (registry) and kernel32 —
//! no extra Cargo feature is needed (same pattern as `idle.rs`). Writes
//! go to **HKCU** (per-user): the session runs elevated for tier 2, so
//! HKCU is the elevated user's hive and no admin-token juggling is
//! required for the write itself.
//!
//! The watchdog is a *thread* in this process, not a separate executable:
//! the drop guard covers everything a second process would, without a
//! binary to sign or a child to clean up (decision recorded in
//! docs/handoffs/M2-08.md).

#![allow(dead_code)]

use std::sync::atomic::{AtomicBool, Ordering};

/// Watchdog re-assert interval. Anything that resets the policy is put
/// back within this window; Task Manager launches in between are still
/// caught by the M2-07 refocus loop.
pub const WATCHDOG_INTERVAL_MS: u64 = 2_000;

/// The registry path of the DisableTaskMgr value (UTF-16, null-terminated).
const POLICY_SUBKEY: &[u8] = b"Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System\0";
const POLICY_VALUE: &[u8] = b"DisableTaskMgr\0";

const HKEY_CURRENT_USER: isize = 0x8000_0001;
const KEY_SET_VALUE: u32 = 0x0002;
const KEY_QUERY_VALUE: u32 = 0x0001;
const REG_DWORD: u32 = 4;

#[link(name = "advapi32")]
extern "system" {
    fn RegOpenKeyExW(
        hkey: isize,
        lpsubkey: *const u16,
        uloptions: u32,
        samdesired: u32,
        phkresult: *mut isize,
    ) -> i32;
    fn RegSetValueExW(
        hkey: isize,
        lpvaluename: *const u16,
        reserved: u32,
        dwtype: u32,
        lpdata: *const u8,
        cbdata: u32,
    ) -> i32;
    fn RegCloseKey(hkey: isize) -> i32;
}

/// UTF-8 → UTF-16 with a trailing null (registry strings are wide).
fn wide(s: &[u8]) -> Vec<u16> {
    let utf8 = std::str::from_utf8(s).unwrap_or("");
    utf8.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Write `DisableTaskMgr = enabled ? 1 : 0` under HKCU. Returns false when
/// the registry write fails (policy keys can be blocked by group policy —
/// the caller treats false as "hardening unavailable", never as a session
/// failure).
pub fn set_disable_task_mgr(enabled: bool) -> bool {
    #[cfg(windows)]
    {
        unsafe {
            let mut hkey: isize = 0;
            let subkey = wide(POLICY_SUBKEY);
            if RegOpenKeyExW(
                HKEY_CURRENT_USER,
                subkey.as_ptr(),
                0,
                KEY_SET_VALUE | KEY_QUERY_VALUE,
                &mut hkey,
            ) != 0
            {
                return false;
            }
            let value_name = wide(POLICY_VALUE);
            let data: u32 = u32::from(enabled);
            let ok = RegSetValueExW(
                hkey,
                value_name.as_ptr(),
                0,
                REG_DWORD,
                data.to_ne_bytes().as_ptr().cast(),
                4,
            ) == 0;
            RegCloseKey(hkey);
            ok
        }
    }
    #[cfg(not(windows))]
    {
        // Non-Windows desktop: no Task Manager to disable — a no-op that
        // still reports success so the session flow is identical.
        let _ = enabled;
        true
    }
}

/// Live flag for the watchdog thread: `true` while the session is active.
static WATCHDOG_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Enables tier-2 hardening: writes the policy once, then spawns the
/// watchdog thread that re-asserts it every [`WATCHDOG_INTERVAL_MS`] until
/// the returned guard drops (or [`TaskMgrGuard::release`] is called).
///
/// `enabled` is the caller's elevation decision (optional per session).
/// When the registry write fails the guard still returns (active = false)
/// so the session proceeds at tier 1 — hardening is best-effort BY DESIGN.
pub fn enable_admin_hardening() -> TaskMgrGuard {
    let write_ok = set_disable_task_mgr(true);
    WATCHDOG_ACTIVE.store(true, Ordering::SeqCst);
    let handle = std::thread::Builder::new()
        .name("max-focus-taskmgr-watchdog".into())
        .spawn(move || {
            while WATCHDOG_ACTIVE.load(Ordering::SeqCst) {
                std::thread::sleep(std::time::Duration::from_millis(WATCHDOG_INTERVAL_MS));
                if WATCHDOG_ACTIVE.load(Ordering::SeqCst) {
                    // Re-assert; a failed write is retried next tick.
                    let _ = set_disable_task_mgr(true);
                }
            }
        })
        .ok();
    TaskMgrGuard {
        active: write_ok,
        handle,
    }
}

/// The drop guard: dropping it stops the watchdog and RESTORES the policy
/// (DisableTaskMgr → 0). Two restores are harmless; one write always wins.
pub struct TaskMgrGuard {
    /// Whether the policy write succeeded (false = tier-1 fallback).
    pub active: bool,
    handle: Option<std::thread::JoinHandle<()>>,
}

/// The session-lifetime slot: the guard lives here until
/// [`release_hardening`] drops it (lock_win's release path on session end).
static HARDENING: std::sync::Mutex<Option<TaskMgrGuard>> = std::sync::Mutex::new(None);

/// Acquire tier-2 hardening for the running session (idempotent: a second
/// acquire while hardened is a no-op success). Returns whether the policy
/// write succeeded (false = tier-1 fallback; the session proceeds either
/// way — hardening is best-effort BY DESIGN).
///
/// `_enabled` is the caller's elevation decision, kept for call-site
/// readability: acquire happens only while an opted-in (`windows-admin`)
/// session runs, and the hardening itself is always ON for as long as the
/// guard is held — dropping it restores the policy.
pub fn acquire_hardening(_enabled: bool) -> bool {
    let mut slot = HARDENING.lock().unwrap_or_else(|e| e.into_inner());
    if slot.is_some() {
        return true;
    }
    let guard = enable_admin_hardening();
    let active = guard.active;
    *slot = Some(guard);
    active
}

/// Release the hardening: stops the watchdog and restores the policy.
/// Safe to call when nothing is held (no-op).
pub fn release_hardening() {
    let mut slot = HARDENING.lock().unwrap_or_else(|e| e.into_inner());
    *slot = None; // Drop impl runs here — the restore guarantee.
}

impl TaskMgrGuard {
    /// Explicit release (same effect as dropping, but readable at call
    /// sites).
    pub fn release(self) {
        // `self` drops here → the Drop impl runs.
    }
}

impl Drop for TaskMgrGuard {
    fn drop(&mut self) {
        WATCHDOG_ACTIVE.store(false, Ordering::SeqCst);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
        let _ = set_disable_task_mgr(false);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acquire_then_release_stops_the_watchdog() {
        // Non-Windows: set_disable_task_mgr is a no-op success; the guard
        // lifecycle (watchdog start/stop on release) is still exercised.
        assert!(acquire_hardening(true));
        assert!(WATCHDOG_ACTIVE.load(Ordering::SeqCst));
        release_hardening();
        assert!(!WATCHDOG_ACTIVE.load(Ordering::SeqCst));
    }

    #[test]
    fn acquire_is_idempotent_and_release_is_a_noop_when_empty() {
        assert!(acquire_hardening(false));
        assert!(acquire_hardening(false)); // second acquire is a no-op success
        release_hardening();
        release_hardening(); // nothing held — must not panic
        assert!(!WATCHDOG_ACTIVE.load(Ordering::SeqCst));
    }
}
