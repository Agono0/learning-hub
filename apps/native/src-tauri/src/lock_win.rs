//! Max Focus lock windows (M2-05): topmost fullscreen windows across ALL
//! monitors for the duration of a Max Focus session.
//!
//! Implemented with Tauri's own window APIs — one borderless, always-on-top,
//! fullscreen webview window per available monitor, zero new dependencies
//! (no raw Win32, no Cargo feature additions). Each lock window loads the
//! bundled app shell; M2-18 renders the early-exit gate (PIN + reason) and
//! M2-17 the disclosure screens inside it, so the blackout is *content*, not
//! just a black rectangle.
//!
//! Lifecycle mirrors `focus.rs`: `apply_lock_windows` on session start,
//! `release_lock_windows` on end — both idempotent, so a crashed session can
//! always be cleaned up by the next apply/release call (M2-24 resume path).
//!
//! Unit-testable pieces (coverage math, label matching, prefix rules) are
//! plain functions; window creation itself is exercised by CI compilation
//! and the M2-30 e2e smoke.
#![allow(dead_code)]

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Label prefix for lock windows — `webview_windows()` filtering and the
/// web layer both key off this (keep in sync with docs/max-focus.md).
pub const LOCK_WINDOW_PREFIX: &str = "max-focus-lock";

/// Creates one fullscreen, always-on-top, decoration-free window per
/// available monitor. Idempotent: any stale lock windows (from a crashed
/// session) are closed first, so apply-after-crash converges to exactly one
/// window per monitor.
pub fn apply_lock_windows(app: &AppHandle) -> Result<(), String> {
    release_lock_windows(app)?;
    let monitors = app
        .available_monitors()
        .map_err(|e| format!("max focus: enumerating monitors failed: {e}"))?;
    if monitors.is_empty() {
        return Err("max focus: no monitors detected".into());
    }
    for (index, monitor) in monitors.iter().enumerate() {
        let label = lock_window_label(index);
        let position = monitor.position();
        let size = monitor.size();
        WebviewWindowBuilder::new(
            app,
            &label,
            // The bundled shell; the lock route inside it is owned by the
            // web layer (M2-16/M2-18 render the checklist and exit gate).
            WebviewUrl::App("index.html".into()),
        )
        .title("Max Focus")
        .position(position.x as f64, position.y as f64)
        .inner_size(size.width as f64, size.height as f64)
        .decorations(false)
        .always_on_top(true)
        .fullscreen(true)
        .resizable(false)
        .skip_taskbar(true)
        // Never steal focus from the session UI the user was just on.
        .focused(false)
        .build()
        .map_err(|e| format!("max focus: creating lock window '{label}' failed: {e}"))?;
    }
    Ok(())
}

/// Closes every lock window. Idempotent (no-op when none exist).
pub fn release_lock_windows(app: &AppHandle) -> Result<(), String> {
    for (label, window) in app.webview_windows() {
        if is_lock_window_label(&label) {
            window
                .close()
                .map_err(|e| format!("max focus: closing '{label}' failed: {e}"))?;
        }
    }
    Ok(())
}

/// True while at least one lock window is alive (M2-23 status command basis).
pub fn is_locked(app: &AppHandle) -> bool {
    app.webview_windows().keys().any(|label| is_lock_window_label(label))
}

/// `max-focus-lock-<index>` — one window per monitor index.
fn lock_window_label(index: usize) -> String {
    format!("{LOCK_WINDOW_PREFIX}-{index}")
}

/// Label → lock-window check (single source of truth for the prefix rule).
fn is_lock_window_label(label: &str) -> bool {
    label.starts_with(LOCK_WINDOW_PREFIX)
        && label[LOCK_WINDOW_PREFIX.len()..].starts_with('-')
}

/// Sanity check: a lock window must cover its monitor's full rectangle
/// (position AND size) — used by M2-23 status reporting and M2-07's
/// refocus loop to detect a window that lost its geometry.
pub fn covers_monitor(
    monitor_position: (f64, f64),
    monitor_size: (f64, f64),
    window_position: (f64, f64),
    window_size: (f64, f64),
) -> bool {
    let (mx, my) = monitor_position;
    let (mw, mh) = monitor_size;
    let (wx, wy) = window_position;
    let (ww, wh) = window_size;
    wx <= mx && wy <= my && wx + ww >= mx + mw && wy + wh >= my + mh
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_labels_round_trip_through_the_prefix_rule() {
        assert!(is_lock_window_label(&lock_window_label(0)));
        assert!(is_lock_window_label(&lock_window_label(12)));
        // Look-alikes that must NOT match.
        assert!(!is_lock_window_label("max-focus-lock"));
        assert!(!is_lock_window_label("max-focus-lockx-0"));
        assert!(!is_lock_window_label("main"));
        assert!(!is_lock_window_label("max-focus-lockX0"));
    }

    #[test]
    fn coverage_math_requires_full_monitor_rect() {
        let monitor = ((0.0, 0.0), (1920.0, 1080.0));
        // Exact cover.
        assert!(covers_monitor(
            monitor.0,
            monitor.1,
            monitor.0,
            monitor.1
        ));
        // Oversized (fullscreen APIs sometimes overshoot by a pixel) — fine.
        assert!(covers_monitor(monitor.0, monitor.1, (-1.0, -1.0), (1922.0, 1082.0)));
        // Offset — not covering.
        assert!(!covers_monitor(monitor.0, monitor.1, (10.0, 0.0), (1920.0, 1080.0)));
        // Too small — not covering.
        assert!(!covers_monitor(monitor.0, monitor.1, (0.0, 0.0), (1919.0, 1080.0)));
        // Second monitor at negative X (left of primary) — covered exactly.
        let left = ((-1920.0, 0.0), (1920.0, 1080.0));
        assert!(covers_monitor(left.0, left.1, left.0, left.1));
        assert!(!covers_monitor(left.0, left.1, (0.0, 0.0), (1920.0, 1080.0)));
    }
}
