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
    apply_lock_windows_with_allowlist(app, &[])
}

/// [`apply_lock_windows`] with the session's allowlisted executables
/// (M2-09): allowlisted apps may take the foreground during the session,
/// everything else is refocused by the guard. The allowlist arrives from the
/// web session (`FocusLockPayload.apps` via the M2-23 commands).
pub fn apply_lock_windows_with_allowlist(
    app: &AppHandle,
    allowed_apps: &[String],
) -> Result<(), String> {
    apply_lock_windows_with_allowlist_and_tier(app, allowed_apps, false)
}

/// [`apply_lock_windows_with_allowlist`] with the M2-08 tier-2 decision:
/// `admin_hardening` (session tier `windows-admin`) additionally enables
/// the DisableTaskMgr policy + watchdog (lock_watchdog), restored on
/// release. Hardening is best-effort: a failed policy write proceeds at
/// tier 1.
pub fn apply_lock_windows_with_allowlist_and_tier(
    app: &AppHandle,
    allowed_apps: &[String],
    admin_hardening: bool,
) -> Result<(), String> {
    release_lock_windows(app)?;
    if admin_hardening {
        crate::lock_watchdog::acquire_hardening(true);
    }
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

    // Session-scoped keyboard suppression (M2-06): with the lock windows up,
    // the OS-shell escapes they cannot block (Win, Alt+Tab, Alt+F4, Ctrl+Esc)
    // are swallowed by the low-level hook until release.
    #[cfg(windows)]
    key_hooks::install().map_err(|e| format!("max focus: keyboard hook install failed: {e}"))?;
    #[cfg(windows)]
    refocus::start(app.clone(), allowed_apps)
        .map_err(|e| format!("max focus: refocus guard failed: {e}"))?;

    Ok(())
}

/// Closes every lock window and lifts the keyboard suppression. Idempotent
/// (no-op when none exist) — the M2-24 resume path relies on that.
pub fn release_lock_windows(app: &AppHandle) -> Result<(), String> {
    // M2-08: the hardening guard lives for the session — release drops it
    // (restore guarantee via the Drop impl), a no-op when not hardened.
    crate::lock_watchdog::release_hardening();
    #[cfg(windows)]
    refocus::stop().map_err(|e| format!("max focus: refocus guard stop failed: {e}"))?;
    #[cfg(windows)]
    key_hooks::remove().map_err(|e| format!("max focus: keyboard hook removal failed: {e}"))?;

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

// ── Low-level keyboard suppression (M2-06, Windows) ────────────────────────

/// Virtual-key codes the Max Focus hook is concerned with (duplicated as plain
/// consts so the decision logic stays testable without the windows crate).
pub const VK_TAB: u32 = 0x09;
pub const VK_ESCAPE: u32 = 0x1B;
pub const VK_F4: u32 = 0x73;
pub const VK_LWIN: u32 = 0x5B;
pub const VK_RWIN: u32 = 0x5C;
pub const VK_CONTROL: u32 = 0x11;

/// Pure decision at the heart of the low-level hook: should this key event be
/// swallowed? Scope (M2-06, locked decisions): the Win key, Alt+Tab, Alt+F4
/// and Ctrl+Esc — the OS-shell escapes a fullscreen lock window cannot block
/// on its own. Everything else (including plain Alt, plain Esc, plain F4,
/// typing, the emergency dialer's own keys) passes through untouched.
///
/// `alt_down` comes from the hook's `LLKHF_ALTDOWN` flag; `ctrl_down` from the
/// hook's own VK_CONTROL tracking (see [`key_hooks`]).
pub fn should_swallow_key(vk_code: u32, alt_down: bool, ctrl_down: bool, win_key: bool) -> bool {
    win_key
        || (alt_down && vk_code == VK_TAB)
        || (alt_down && vk_code == VK_F4)
        || (ctrl_down && vk_code == VK_ESCAPE)
}

/// Task Manager's image name (M2-07's refocus trigger).
pub const TASKMGR_PROCESS: &str = "taskmgr.exe";

/// Normalize a process image name for allowlist comparisons: lowercase,
/// `.exe` suffix stripped (the session allowlist is authored without it).
pub fn normalize_process_name(process: &str) -> String {
    let lower = process.trim().to_ascii_lowercase();
    lower.strip_suffix(".exe").unwrap_or(&lower).to_string()
}

/// Pure allowlist match (M2-09): true when the foreground process may keep
/// focus. Exact match on the normalized name against the session allowlist
/// (the `apps` array of `FocusLockPayload`); an empty allowlist allows
/// nothing — the lock window is the only permitted foreground.
pub fn app_is_allowed(process: &str, allowed_apps: &[String]) -> bool {
    if allowed_apps.is_empty() {
        return false;
    }
    let normalized = normalize_process_name(process);
    if normalized.is_empty() {
        return false;
    }
    allowed_apps
        .iter()
        .any(|app| normalize_process_name(app) == normalized)
}

/// Pure decision for the M2-07 foreground guard: yank focus back to the lock
/// when the foreground window is NOT one of our lock windows, OR when Task
/// Manager is in front (Ctrl+Alt+Del cannot be hooked at any tier; tier 1
/// steals focus back, M2-08's admin tier also disables the process).
pub fn needs_refocus(foreground_process: &str, foreground_is_lock_window: bool) -> bool {
    should_refocus(foreground_process, foreground_is_lock_window, &[])
}

/// M2-09 refinement of [`needs_refocus`]: allowlisted apps may take the
/// foreground freely (the user can open exactly the sessions' `apps`), every
/// other foreign window is refocused, and Task Manager ALWAYS triggers — it
/// can never be allowlisted into legitimacy (tier 1; M2-08 disables it).
pub fn should_refocus(
    foreground_process: &str,
    foreground_is_lock_window: bool,
    allowed_apps: &[String],
) -> bool {
    foreground_process == TASKMGR_PROCESS
        || (!foreground_is_lock_window && !app_is_allowed(foreground_process, allowed_apps))
}

/// Lowercased file-name tail of a full image path (C:\...\Taskmgr.exe ->
/// "taskmgr.exe"); empty for empty input.
pub fn file_name_tail(full_path: &str) -> String {
    let tail = full_path
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    tail.trim().to_string()
}

/// Session-scoped low-level keyboard hook (Windows only; compiles to nothing
/// elsewhere — the `windows` crate is a Windows-only dependency).
///
/// Architecture: one dedicated thread installs a `WH_KEYBOARD_LL` hook and
/// pumps messages; the hook proc itself only touches atomics and NEVER blocks
/// (a slow LL hook is silently removed by Windows after LowLevelHooksTimeout).
/// Removal posts `WM_QUIT` to that thread, which unhooks from the same thread
/// that installed the hook (the OS requirement).
///
/// Lifecycle is owned by the session: `apply_lock_windows` installs,
/// `release_lock_windows` removes — so the suppression can never outlive the
/// lock windows, and a crashed session converges clean on the next apply
/// (install is idempotent).
#[cfg(windows)]
pub mod key_hooks {
    use super::{should_swallow_key, VK_CONTROL, VK_LWIN, VK_RWIN};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc;
    use std::thread::JoinHandle;
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, KBDLLHOOKSTRUCT, PostThreadMessageW, SetWindowsHookExW,
        UnhookWindowsHookEx, LLKHF_ALTDOWN, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_QUIT,
        WM_SYSKEYDOWN,
    };

    /// True only while a Max Focus session holds the lock windows — the hook
    /// checks this FIRST so idle-system typing never pays the branch cost.
    static HOOK_ACTIVE: AtomicBool = AtomicBool::new(false);
    /// Ctrl tracker: the LL hook struct carries no Ctrl flag, so we follow
    /// VK_CONTROL down/up events ourselves (they always pass through).
    static CTRL_DOWN: AtomicBool = AtomicBool::new(false);

    /// The installed hook's OS thread id + join handle (for WM_QUIT + join).
    struct HookThread {
        thread_id: u32,
        handle: Option<JoinHandle<()>>,
    }

    static HOOK_THREAD: std::sync::Mutex<Option<HookThread>> = std::sync::Mutex::new(None);

    /// Install the hook (idempotent). Blocks until the hook thread confirms
    /// the hook is live (or fails fast with the install error).
    pub fn install() -> Result<(), String> {
        let mut guard = HOOK_THREAD.lock().map_err(|_| "hook state poisoned")?;
        if guard.is_some() {
            return Ok(());
        }
        let (tx, rx) = mpsc::channel();
        let handle = std::thread::Builder::new()
            .name("max-focus-kbd-hook".into())
            .spawn(move || hook_thread_main(tx))
            .map_err(|e| format!("max focus: spawning keyboard hook thread failed: {e}"))?;

        // The thread sends (thread_id, installed) before entering the loop.
        match rx.recv_timeout(std::time::Duration::from_secs(5)) {
            Ok((thread_id, true)) => {
                *guard = Some(HookThread {
                    thread_id,
                    handle: Some(handle),
                });
                HOOK_ACTIVE.store(true, Ordering::Release);
                Ok(())
            }
            Ok((_, false)) => Err("max focus: SetWindowsHookExW failed on the hook thread".into()),
            Err(_) => Err("max focus: keyboard hook thread did not report ready".into()),
        }
    }

    /// Remove the hook (idempotent): deactivate first, then WM_QUIT the hook
    /// thread so `UnhookWindowsHookEx` runs on the installing thread.
    pub fn remove() -> Result<(), String> {
        let mut guard = HOOK_THREAD.lock().map_err(|_| "hook state poisoned")?;
        HOOK_ACTIVE.store(false, Ordering::Release);
        CTRL_DOWN.store(false, Ordering::Release);
        if let Some(hook) = guard.take() {
            unsafe {
                let _ = PostThreadMessageW(hook.thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
            }
            if let Some(handle) = hook.handle {
                let _ = handle.join();
            }
        }
        Ok(())
    }

    /// True while the session-scoped suppression is live (M2-23 status).
    pub fn active() -> bool {
        HOOK_ACTIVE.load(Ordering::Acquire)
    }

    /// Hook thread: install, report readiness, pump messages until WM_QUIT,
    /// then unhook from THIS thread.
    fn hook_thread_main(ready: mpsc::Sender<(u32, bool)>) {
        unsafe {
            let installed = SetWindowsHookExW(WH_KEYBOARD_LL, Some(ll_keyboard_proc), None, 0);
            let hook = match installed {
                Ok(h) => h,
                Err(e) => {
                    let _ = ready.send((0, false));
                    log::warn!("max focus: keyboard hook install failed: {e}");
                    return;
                }
            };
            let thread_id = windows::Win32::System::Threading::GetCurrentThreadId();
            let _ = ready.send((thread_id, true));

            // LL hooks receive their events through the message loop; nothing
            // needs dispatching, so the loop only waits for WM_QUIT.
            let mut msg = MSG::default();
            let _ = GetMessageW(&mut msg, None, 0, 0);
            let _ = UnhookWindowsHookEx(hook);
        }
    }

    /// The low-level keyboard proc: minimal, never blocking — swallow the
    /// session-scoped escape keys, pass everything else through.
    unsafe extern "system" fn ll_keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 && HOOK_ACTIVE.load(Ordering::Acquire) {
            let info = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
            let msg = wparam.0 as u32;
            let is_key_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
            let is_key_up = !is_key_down;

            // Track Ctrl ourselves: down/up of VK_CONTROL always flows here.
            if info.vkCode == VK_CONTROL as u32 {
                CTRL_DOWN.store(is_key_down, Ordering::Release);
            }

            if is_key_down {
                let alt_down = info.flags.contains(LLKHF_ALTDOWN);
                let win_key = info.vkCode == VK_LWIN || info.vkCode == VK_RWIN;
                if should_swallow_key(info.vkCode, alt_down, CTRL_DOWN.load(Ordering::Acquire), win_key) {
                    return LRESULT(1); // swallow
                }
            }
            // Key-up events for swallowed keys pass through (harmless).
            let _ = is_key_up;
        }
        CallNextHookEx(None, code, wparam, lparam)
    }
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
    fn allowlist_matching_is_exact_and_case_insensitive() {
        use super::{app_is_allowed, normalize_process_name};
        let allow = vec!["code".to_string(), "firefox.exe".to_string()];
        assert!(app_is_allowed("code.exe", &allow));
        assert!(app_is_allowed("Code.EXE", &allow));
        assert!(app_is_allowed("firefox", &allow));
        assert!(!app_is_allowed("taskmgr.exe", &allow));
        assert!(!app_is_allowed("code2", &allow)); // prefix must not match
        assert!(!app_is_allowed("", &allow));
        assert!(!app_is_allowed("code", &[])); // empty allowlist allows nothing
        assert_eq!(normalize_process_name("  Code.exe  "), "code");
    }

    #[test]
    fn refocus_triggers_on_foreign_or_taskmgr_foreground() {
        assert!(!needs_refocus("explorer.exe", true)); // lock window on top: fine
        assert!(needs_refocus("explorer.exe", false)); // anything else: refocus
        assert!(needs_refocus("taskmgr.exe", true)); // even over a lock window
        assert!(needs_refocus("", false));
    }

    #[test]
    fn file_name_tail_handles_windows_and_posix_paths() {
        assert_eq!(file_name_tail("C:\\Windows\\System32\\Taskmgr.EXE"), "taskmgr.exe");
        assert_eq!(file_name_tail("/usr/bin/explorer"), "explorer");
        assert_eq!(file_name_tail("notepad.exe"), "notepad.exe");
        assert_eq!(file_name_tail(""), "");
    }

    #[test]
    fn hook_swallows_exactly_the_session_escape_keys() {
        use super::{should_swallow_key, VK_ESCAPE, VK_F4, VK_LWIN, VK_RWIN, VK_TAB};
        // The four locked-decision escapes.
        assert!(should_swallow_key(VK_LWIN, false, false, true));
        assert!(should_swallow_key(VK_RWIN, false, false, true));
        assert!(should_swallow_key(VK_TAB, true, false, false)); // Alt+Tab
        assert!(should_swallow_key(VK_F4, true, false, false)); // Alt+F4
        assert!(should_swallow_key(VK_ESCAPE, false, true, false)); // Ctrl+Esc
        // Near misses pass through: plain keys and half-combos.
        assert!(!should_swallow_key(VK_TAB, false, false, false));
        assert!(!should_swallow_key(VK_TAB, false, true, false)); // Ctrl+Tab allowed
        assert!(!should_swallow_key(VK_F4, false, false, false));
        assert!(!should_swallow_key(VK_ESCAPE, true, false, false)); // Alt+Esc allowed
        assert!(!should_swallow_key(0x41, true, true, false)); // plain typing
        // Win flag dominates regardless of modifiers.
        assert!(should_swallow_key(0x41, true, true, true));
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

/// Foreground guard (M2-07, Windows): a light polling loop that keeps the
/// lock windows visually on top when the OS shell escapes the hook —
/// Task Manager (Ctrl+Alt+Del is unblockable at any tier) or any other window
/// that stole focus. Tier 1 response = yank focus straight back to the
/// topmost lock window; M2-08's admin tier hardens this by disabling Task
/// Manager itself. `needs_refocus` is the pure, testable decision.
#[cfg(windows)]
pub mod refocus {
    use super::{file_name_tail, should_refocus, LOCK_WINDOW_PREFIX};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc;
    use std::thread::JoinHandle;
    use tauri::{AppHandle, Manager};
    use windows::Win32::Foundation::{CloseHandle, HWND};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow, SetWindowPos,
        HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
    };

    /// Poll cadence — light enough to be "immediate" to a human, cheap enough
    /// to run for hours (one GetForegroundWindow + PID lookup per tick).
    pub const POLL_INTERVAL_MS: u64 = 500;
    /// Task Manager's image name (all Windows versions to date).
    pub const TASKMGR_PROCESS: &str = "taskmgr.exe";

    static REFOCUS_ACTIVE: AtomicBool = AtomicBool::new(false);
    static REFOCUS_THREAD: std::sync::Mutex<Option<JoinHandle<()>>> = std::sync::Mutex::new(None);

    /// Start the guard loop (idempotent). `allowed_apps` is the session's
    /// allowlisted executables (normalized here once) — those may take the
    /// foreground; everything else is refocused (M2-09). The loop
    /// self-terminates when [`stop`] flips the active flag.
    pub fn start(app: AppHandle, allowed_apps: &[String]) -> Result<(), String> {
        let mut guard = REFOCUS_THREAD.lock().map_err(|_| "refocus state poisoned")?;
        if guard.is_some() {
            return Ok(());
        }
        let allowed: Vec<String> = allowed_apps.to_vec();
        REFOCUS_ACTIVE.store(true, Ordering::Release);
        let (tx, rx) = mpsc::channel();
        let handle = std::thread::Builder::new()
            .name("max-focus-refocus".into())
            .spawn(move || {
                let _ = tx.send(());
                while REFOCUS_ACTIVE.load(Ordering::Acquire) {
                    poll_once(&app, &allowed);
                    std::thread::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS));
                }
            })
            .map_err(|e| format!("max focus: spawning refocus thread failed: {e}"))?;
        // Best-effort handshake: don't proceed until the loop is live.
        let _ = rx.recv_timeout(std::time::Duration::from_secs(5));
        *guard = Some(handle);
        Ok(())
    }

    /// Stop the guard loop (idempotent) — called by `release_lock_windows`.
    pub fn stop() -> Result<(), String> {
        let mut guard = REFOCUS_THREAD.lock().map_err(|_| "refocus state poisoned")?;
        REFOCUS_ACTIVE.store(false, Ordering::Release);
        if let Some(handle) = guard.take() {
            let _ = handle.join();
        }
        Ok(())
    }

    /// One poll tick: if the foreground window is not a lock window — or the
    /// foreground process is Task Manager — put the topmost lock window back
    /// in front and foreground it.
    fn poll_once(app: &AppHandle, allowed_apps: &[String]) {
        let lock_hwnds: Vec<isize> = app
            .webview_windows()
            .into_iter()
            .filter(|(label, _)| label.starts_with(LOCK_WINDOW_PREFIX))
            .filter_map(|(_, window)| window.hwnd().ok())
            .map(|hwnd| hwnd.0 as isize)
            .collect();
        if lock_hwnds.is_empty() {
            return; // windows are going away (release in progress) — stand down
        }
        unsafe {
            let foreground = GetForegroundWindow();
            if foreground.is_invalid() {
                return;
            }
            let foreground_is_lock = lock_hwnds.contains(&(foreground.0 as isize));
            let process = foreground_process_name(foreground);
            if !should_refocus(&process, foreground_is_lock, allowed_apps) {
                return;
            }
            if process == TASKMGR_PROCESS {
                log::info!("max focus: Task Manager took the foreground — refocusing lock");
            }
            // The isize round-trip is lossless: tauri's HWND IS a
            // windows-0.62 HWND (same crate version), pointer-sized inside.
            if let Some(&addr) = lock_hwnds.first() {
                let lock_hwnd = HWND(addr as *mut core::ffi::c_void);
                let _ = SetWindowPos(
                    lock_hwnd,
                    Some(HWND_TOPMOST),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
                );
                // Focus stealing is best-effort: without foreground rights the
                // OS may refuse SetForegroundWindow — the TOPMOST z-order above
                // still wins visually, and M2-08's elevated tier hardens this.
                SetForegroundWindow(lock_hwnd);
            }
        }
    }

    /// Image name (lowercased tail, e.g. "taskmgr.exe") of `hwnd`'s process,
    /// or "" when the process cannot be queried (system windows, elevation).
    fn foreground_process_name(hwnd: HWND) -> String {
        unsafe {
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return String::new();
            }
            let process = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                Ok(h) => h,
                Err(_) => return String::new(),
            };
            let mut buf = [0u16; 512];
            let mut len = buf.len() as u32;
            let full = QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                windows::core::PWSTR(buf.as_mut_ptr()),
                &mut len,
            )
            .is_ok();
            let _ = CloseHandle(process);
            if !full {
                return String::new();
            }
            file_name_tail(&String::from_utf16_lossy(&buf[..len as usize]))
        }
    }
}
