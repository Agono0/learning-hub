//! Learning HUB — idle detection (S3-33).
//!
//! One command, `system_idle_ms`, reports how long since the last user
//! input (mouse/keyboard). The webview feeds it to the core idle gate
//! (`packages/core/src/tasks/idle.ts`), which classifies the gap and offers
//! the S3-78 classify dialog; tracking never silently absorbs dead time.
//!
//! Windows reads `GetLastInputInfo` via a self-contained extern binding —
//! user32/kernel32 link automatically and NO extra crate feature is needed
//! (a cleaner `windows`-crate feature upgrade is optional; see
//! docs/handoffs/S3-33-S3-78.md). Non-Windows desktop targets report
//! `available: false` and the webview hides the dialog.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct IdleStatus {
    /// Milliseconds since the last user input (0 when unknown).
    pub idle_ms: u64,
    /// False when the platform cannot report idle (the webview hides the gate).
    pub available: bool,
}

/// Seconds since the last input, from the OS.
#[cfg(windows)]
fn last_input_seconds() -> Option<u32> {
    #[repr(C)]
    struct LastInputInfo {
        cb_size: u32,
        dw_time: u32,
    }
    #[link(name = "user32")]
    extern "system" {
        fn GetLastInputInfo(plii: *mut LastInputInfo) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetTickCount() -> u32;
    }
    unsafe {
        let mut info = LastInputInfo {
            cb_size: std::mem::size_of::<LastInputInfo>() as u32,
            dw_time: 0,
        };
        if GetLastInputInfo(&mut info) != 0 {
            // Millisecond counters wrap ~49.7 days; the wrapping subtract is
            // correct for the idle window (well under the wrap distance).
            return Some(GetTickCount().wrapping_sub(info.dw_time) / 1000);
        }
        None
    }
}

/// Tauri command: how long since the last user input.
#[tauri::command]
pub fn system_idle_ms() -> IdleStatus {
    #[cfg(windows)]
    {
        match last_input_seconds() {
            Some(seconds) => IdleStatus {
                idle_ms: u64::from(seconds) * 1000,
                available: true,
            },
            None => IdleStatus {
                idle_ms: 0,
                available: false,
            },
        }
    }
    #[cfg(not(windows))]
    {
        IdleStatus {
            idle_ms: 0,
            available: false,
        }
    }
}
