//! Learning HUB — Max Focus Mode watchdog and loopback pairing server.
//!
//! Provides two-layer enforcement on Windows:
//! 1. A local HTTP loopback server (127.0.0.1:47615) paired with the Chrome MV3 extension.
//! 2. A foreground window watchdog minimizing unpermitted desktop applications.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

const LOOPBACK_PORT: u16 = 47615;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FocusLockPayload {
    pub ends_at: String,
    pub apps: Vec<String>,
    pub domains: Vec<String>,
    pub token: String,
    pub strict: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FocusLockStatus {
    pub active: bool,
    pub ends_at: Option<String>,
    pub last_heartbeat_at: Option<String>,
    pub watchdog_active: bool,
}

struct FocusState {
    lock: Option<FocusLockPayload>,
    last_heartbeat: Option<Instant>,
    server_running: bool,
    watchdog_running: bool,
}

static STATE: OnceLock<Arc<Mutex<FocusState>>> = OnceLock::new();

fn get_state() -> Arc<Mutex<FocusState>> {
    STATE
        .get_or_init(|| {
            Arc::new(Mutex::new(FocusState {
                lock: None,
                last_heartbeat: None,
                server_running: false,
                watchdog_running: false,
            }))
        })
        .clone()
}

// ─── Loopback HTTP Bridge (127.0.0.1:47615) ─────────────────────────────────

fn start_loopback_server(state: Arc<Mutex<FocusState>>) {
    {
        let mut s = state.lock().unwrap();
        if s.server_running {
            return;
        }
        s.server_running = true;
    }

    thread::spawn(move || {
        let listener = match TcpListener::bind(format!("127.0.0.1:{}", LOOPBACK_PORT)) {
            Ok(l) => l,
            Err(e) => {
                log::warn!("[focus-loopback] failed to bind port {}: {}", LOOPBACK_PORT, e);
                return;
            }
        };

        log::info!("[focus-loopback] listening on 127.0.0.1:{}", LOOPBACK_PORT);

        for stream in listener.incoming() {
            if let Ok(mut stream) = stream {
                let state_clone = state.clone();
                thread::spawn(move || {
                    handle_connection(&mut stream, state_clone);
                });
            }
        }
    });
}

fn handle_connection(stream: &mut TcpStream, state: Arc<Mutex<FocusState>>) {
    let mut buffer = [0u8; 4096];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let req_text = String::from_utf8_lossy(&buffer[..bytes_read]);
    let mut lines = req_text.lines();
    let req_line = match lines.next() {
        Some(l) => l,
        None => return,
    };

    let parts: Vec<&str> = req_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }
    let method = parts[0];
    let path = parts[1];

    // CORS preflight
    if method == "OPTIONS" {
        let response = "HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
Access-Control-Allow-Headers: Authorization, Content-Type\r\n\
Access-Control-Max-Age: 86400\r\n\r\n";
        let _ = stream.write_all(response.as_bytes());
        return;
    }

    // Extract Bearer token
    let mut auth_token = "";
    for line in lines {
        if line.to_lowercase().starts_with("authorization: bearer ") {
            auth_token = line[22..].trim();
            break;
        }
    }

    let current = state.lock().unwrap();
    let expected_token = current.lock.as_ref().map(|l| l.token.as_str()).unwrap_or("");

    if expected_token.is_empty() || auth_token != expected_token {
        let response = "HTTP/1.1 401 Unauthorized\r\n\
Access-Control-Allow-Origin: *\r\n\
Content-Type: application/json\r\n\r\n{\"error\":\"Unauthorized\"}";
        let _ = stream.write_all(response.as_bytes());
        return;
    }

    drop(current);

    if path == "/v1/lock" || path == "/v1/status" {
        let current = state.lock().unwrap();
        let payload = current.lock.clone();
        drop(current);

        let body = if let Some(p) = payload {
            serde_json::json!({
                "active": true,
                "endsAt": p.ends_at,
                "domains": p.domains,
                "apps": p.apps
            })
            .to_string()
        } else {
            serde_json::json!({
                "active": false,
                "endsAt": null,
                "domains": [],
                "apps": []
            })
            .to_string()
        };

        let response = format!(
            "HTTP/1.1 200 OK\r\n\
Access-Control-Allow-Origin: *\r\n\
Content-Type: application/json\r\n\
Content-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(response.as_bytes());
    } else if path == "/v1/heartbeat" {
        let mut current = state.lock().unwrap();
        current.last_heartbeat = Some(Instant::now());
        drop(current);

        let body = "{\"ok\":true}";
        let response = format!(
            "HTTP/1.1 200 OK\r\n\
Access-Control-Allow-Origin: *\r\n\
Content-Type: application/json\r\n\
Content-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(response.as_bytes());
    } else {
        let response = "HTTP/1.1 404 Not Found\r\n\
Access-Control-Allow-Origin: *\r\n\
Content-Type: application/json\r\n\r\n{\"error\":\"Not Found\"}";
        let _ = stream.write_all(response.as_bytes());
    }
}

// ─── Windows Foreground Watchdog ────────────────────────────────────────────

#[cfg(windows)]
fn start_watchdog(state: Arc<Mutex<FocusState>>) {
    use windows::Win32::Foundation::{CloseHandle, HWND};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, PostMessageW, ShowWindow, SW_MINIMIZE,
        WM_CLOSE,
    };

    {
        let mut s = state.lock().unwrap();
        if s.watchdog_running {
            return;
        }
        s.watchdog_running = true;
    }

    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(1000));

        let current = state.lock().unwrap();
        let lock_opt = current.lock.clone();
        let last_hb = current.last_heartbeat;
        drop(current);

        let lock = match lock_opt {
            Some(l) => l,
            None => continue,
        };

        unsafe {
            let hwnd: HWND = GetForegroundWindow();
            if hwnd.0.is_null() {
                continue;
            }

            let mut process_id: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut process_id));
            if process_id == 0 {
                continue;
            }

            let process_handle =
                match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) {
                    Ok(h) => h,
                    Err(_) => continue,
                };

            let mut path_buf = [0u16; 1024];
            let mut size = path_buf.len() as u32;
            let success = QueryFullProcessImageNameW(
                process_handle,
                PROCESS_NAME_WIN32,
                windows::core::PWSTR(path_buf.as_mut_ptr()),
                &mut size,
            );
            let _ = CloseHandle(process_handle);

            if success.is_err() || size == 0 {
                continue;
            }

            let full_path = String::from_utf16_lossy(&path_buf[..size as usize]);
            let exe_name = full_path
                .rsplit('\\')
                .next()
                .unwrap_or("")
                .to_lowercase();

            if exe_name.is_empty() {
                continue;
            }

            // System allowlist
            let system_apps = [
                "explorer.exe",
                "learning-hub.exe",
                "shellexperiencehost.exe",
                "startmenuexperiencehost.exe",
                "searchhost.exe",
                "textinputhost.exe",
                "lockapp.exe",
                "ctfmon.exe",
                "dwm.exe",
                "taskmgr.exe",
            ];

            if system_apps.contains(&exe_name.as_str()) {
                continue;
            }

            // User allowlist
            let mut is_allowed = false;
            for app in &lock.apps {
                let norm = app.to_lowercase();
                let clean = norm.rsplit('\\').next().unwrap_or(&norm);
                if exe_name == clean {
                    is_allowed = true;
                    break;
                }
            }

            // Chrome allowed only if extension heartbeat received within 90s
            if exe_name == "chrome.exe" {
                if let Some(hb) = last_hb {
                    if hb.elapsed() <= Duration::from_secs(90) {
                        is_allowed = true;
                    }
                }
            }

            if !is_allowed {
                log::info!("[watchdog] minimizing unallowed foreground window: {}", exe_name);
                let _ = ShowWindow(hwnd, SW_MINIMIZE);
                if lock.strict {
                    let _ = PostMessageW(Some(hwnd), WM_CLOSE, windows::Win32::Foundation::WPARAM(0), windows::Win32::Foundation::LPARAM(0));
                }
            }
        }
    });
}

#[cfg(not(windows))]
fn start_watchdog(_state: Arc<Mutex<FocusState>>) {
    // Non-Windows stub
}

// ─── Tauri Commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn focus_lock_apply(payload: FocusLockPayload) -> Result<FocusLockStatus, String> {
    let state = get_state();
    {
        let mut s = state.lock().unwrap();
        s.lock = Some(payload.clone());
        s.last_heartbeat = Some(Instant::now());
    }

    start_loopback_server(state.clone());
    start_watchdog(state.clone());

    Ok(FocusLockStatus {
        active: true,
        ends_at: Some(payload.ends_at),
        last_heartbeat_at: None,
        watchdog_active: true,
    })
}

#[tauri::command]
pub fn focus_lock_release(_token: String) -> Result<(), String> {
    let state = get_state();
    let mut s = state.lock().unwrap();
    s.lock = None;
    Ok(())
}

#[tauri::command]
pub fn focus_lock_status() -> Result<FocusLockStatus, String> {
    let state = get_state();
    let s = state.lock().unwrap();
    Ok(FocusLockStatus {
        active: s.lock.is_some(),
        ends_at: s.lock.as_ref().map(|l| l.ends_at.clone()),
        last_heartbeat_at: None,
        watchdog_active: s.watchdog_running,
    })
}

// ─── Max Focus session commands (M2-23) ─────────────────────────────────────
//
// The Max Focus lifecycle wired to the lock windows + their guards: the WEB
// layer owns the session STATE MACHINE (M2-01, `packages/core/src/focus-lock/
// session.ts` — pure TS); these commands are the platform ACTUATORS — apply
// the lock windows for a session snapshot, report live status, release with a
// logged reason. Persisting across reboots is M2-24; here the snapshot lives
// in memory only.

/// Unlock reasons accepted by `focus_session_release` — mirrors the M2-01
/// `SessionUnlockReason` union (timer | pin | battery | failure | tamper).
/// Pure + testable: the command rejects anything else so friction logs can
/// never record an unknown reason.
pub fn is_session_unlock_reason(reason: &str) -> bool {
    matches!(reason, "timer" | "pin" | "battery" | "failure" | "tamper")
}

/// The session snapshot the web layer sends at apply time — mirrors
/// `MaxFocusSession` (M2-01) field-for-field so the native layer can report
/// and (M2-24) persist exactly what the machine computed.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MaxSessionSnapshot {
    pub session_id: String,
    pub started_at_ms: u64,
    pub planned_end_ms: u64,
    pub hard_cap_at_ms: u64,
    pub mono_anchor_ms: u64,
    /// Session allowlist (ALREADY enforced/merged web-side with the emergency
    /// dialer set, M2-15 — the native layer never widens it).
    pub allowed_apps: Vec<String>,
    /// The enforcement tier (M2-08): `windows-admin` opts into the
    /// DisableTaskMgr + watchdog hardening (lock_watchdog). Defaults to None
    /// for payloads sent before the field existed (older session files).
    #[serde(default)]
    pub tier: Option<String>,
}

static MAX_SESSION: OnceLock<std::sync::Mutex<Option<MaxSessionSnapshot>>> = OnceLock::new();

fn max_session() -> &'static std::sync::Mutex<Option<MaxSessionSnapshot>> {
    MAX_SESSION.get_or_init(|| std::sync::Mutex::new(None))
}

// ─── Session persistence across APP RESTARTS (M2-33) ────────────────────────
//
// The in-memory snapshot dies with the process; a RESTART (not just a reboot —
// no BOOT_COMPLETED involved) must still restore the lock state. The snapshot
// is written atomically (tmp + rename) to `<app_data>/max-focus-session.json`
// on apply and deleted on release; `restore_persisted_max_session` re-reads
// it into memory so status/re-apply paths see the truth again. The WEB layer's
// resume decision (M2-24 `resumeMaxFocusSession`) owns WHETHER the lock
// re-applies; this file only makes the state survive.

/// Atomic write (tmp + rename in the same directory) of the session file.
pub fn write_session_file(path: &std::path::Path, snapshot: &MaxSessionSnapshot) -> Result<(), String> {
    use std::io::Write;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("max focus: creating session dir failed: {e}"))?;
    }
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(snapshot)
        .map_err(|e| format!("max focus: serializing session failed: {e}"))?;
    std::fs::File::create(&tmp)
        .and_then(|mut f| f.write_all(json.as_bytes()))
        .map_err(|e| format!("max focus: writing session tmp failed: {e}"))?;
    std::fs::rename(&tmp, path)
        .map_err(|e| format!("max focus: renaming session file failed: {e}"))
}

/// Read + parse the persisted session file (None when absent/corrupt —
/// corrupt state fails CLOSED, like the M2-24 resume gate).
pub fn read_session_file(path: &std::path::Path) -> Option<MaxSessionSnapshot> {
    let bytes = std::fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Remove the persisted session file (release path). Missing file = fine.
pub fn clear_session_file(path: &std::path::Path) {
    let _ = std::fs::remove_file(path);
}

/// `<app_data>/max-focus-session.json` for this app.
fn session_file_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("max-focus-session.json"))
        .unwrap_or_else(|_| std::env::temp_dir().join("learning-hub-max-focus-session.json"))
}

/// Re-populate the in-memory snapshot from disk (app-restart restore). The
/// lock WINDOWS are NOT re-applied here — the web resume flow (M2-24) decides
/// and calls `focus_session_apply` again; this only restores the truth for
/// `focus_session_status` so the UI never shows "unlocked" after a restart.
fn restore_persisted_max_session(app: &tauri::AppHandle) {
    if max_session().lock().map(|mut c| c.is_some()).unwrap_or(true) {
        return; // memory already holds a session, or state poisoned
    }
    if let Some(snapshot) = read_session_file(&session_file_path(app)) {
        if let Ok(mut current) = max_session().lock() {
            *current = Some(snapshot);
        }
    }
}

/// Apply the Max Focus lock: fullscreen windows per monitor + keyboard hook +
/// refocus guard (lock_win), scoped to the session's allowlisted apps.
/// Idempotent per lock_win's contract; emits `max-focus://applied`.
#[tauri::command]
pub async fn focus_session_apply(
    app: tauri::AppHandle,
    snapshot: MaxSessionSnapshot,
) -> Result<serde_json::Value, String> {
    let admin_hardening = snapshot.tier.as_deref() == Some("windows-admin");
    lock_win::apply_lock_windows_with_allowlist_and_tier(
        &app,
        &snapshot.allowed_apps,
        admin_hardening,
    )?;
    {
        let mut current = max_session().lock().map_err(|_| "max session state poisoned")?;
        *current = Some(snapshot.clone());
    }
    write_session_file(&session_file_path(&app), &snapshot)?;
    use tauri::Emitter;
    let _ = app.emit("max-focus://applied", &snapshot);
    Ok(serde_json::json!({
        "applied": true,
        "locked": lock_win::is_locked(&app),
        "sessionId": snapshot.session_id,
    }))
}

/// Live Max Focus status: window lock, guard states (Windows-only fields are
/// false elsewhere) and the active snapshot (null when unlocked).
#[tauri::command]
pub async fn focus_session_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    restore_persisted_max_session(&app);
    let current = max_session()
        .lock()
        .map_err(|_| "max session state poisoned")?
        .clone();
    Ok(serde_json::json!({
        "locked": lock_win::is_locked(&app),
        "keyboardHookActive": keyboard_hook_active(),
        "refocusGuardActive": refocus_guard_active(),
        "session": current,
    }))
}

/// Release the Max Focus lock with a REASON (validated against the M2-01
/// union — friction logs must never record an unknown reason). Emits
/// `max-focus://released` with the reason for the web session flow.
#[tauri::command]
pub async fn focus_session_release(
    app: tauri::AppHandle,
    reason: String,
) -> Result<serde_json::Value, String> {
    if !is_session_unlock_reason(&reason) {
        return Err(format!(
            "unknown unlock reason '{reason}' — expected timer|pin|battery|failure|tamper"
        ));
    }
    lock_win::release_lock_windows(&app)?;
    clear_session_file(&session_file_path(&app));
    let session = {
        let mut current = max_session().lock().map_err(|_| "max session state poisoned")?;
        current.take()
    };
    use tauri::Emitter;
    let _ = app.emit(
        "max-focus://released",
        serde_json::json!({ "reason": reason, "sessionId": session.as_ref().map(|s| s.session_id) }),
    );
    Ok(serde_json::json!({ "released": true, "reason": reason }))
}

#[cfg(windows)]
fn keyboard_hook_active() -> bool {
    lock_win::key_hooks::active()
}

#[cfg(not(windows))]
fn keyboard_hook_active() -> bool {
    false
}

#[cfg(windows)]
fn refocus_guard_active() -> bool {
    lock_win::refocus::active()
}

#[cfg(not(windows))]
fn refocus_guard_active() -> bool {
    false
}

#[cfg(test)]
mod max_session_tests {
    use super::*;

    #[test]
    fn unlock_reasons_match_the_core_machine_union() {
        for reason in ["timer", "pin", "battery", "failure", "tamper"] {
            assert!(is_session_unlock_reason(reason));
        }
        for junk in ["", "PIN", "escape", "boredom", "pin "] {
            assert!(!is_session_unlock_reason(junk));
        }
    }

    #[test]
    fn session_file_round_trips_and_fails_closed() {
        let dir = std::env::temp_dir().join(format!("max-focus-test-{}", std::process::id()));
        let path = dir.join("max-focus-session.json");
        let snapshot = MaxSessionSnapshot {
            session_id: "s-persist".into(),
            started_at_ms: 1,
            planned_end_ms: 2,
            hard_cap_at_ms: 3,
            mono_anchor_ms: 4,
            allowed_apps: vec!["com.android.dialer".into()],
            tier: None,
        };
        write_session_file(&path, &snapshot).expect("write failed");
        let back = read_session_file(&path).expect("restore failed");
        assert_eq!(back.session_id, "s-persist");
        assert_eq!(back.allowed_apps, snapshot.allowed_apps);
        // Corrupt file → None (fail closed), not a wrong lock.
        std::fs::write(&path, b"{ not json").unwrap();
        assert!(read_session_file(&path).is_none());
        // Missing file → None.
        clear_session_file(&path);
        assert!(read_session_file(&path).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn snapshot_round_trips_through_serde() {
        let snapshot = MaxSessionSnapshot {
            session_id: "s-1".into(),
            started_at_ms: 1_000,
            planned_end_ms: 2_000,
            hard_cap_at_ms: 3_000,
            mono_anchor_ms: 7,
            allowed_apps: vec!["com.android.dialer".into(), "code".into()],
            tier: None,
        };
        let json = serde_json::to_string(&snapshot).unwrap();
        let back: MaxSessionSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(back.session_id, "s-1");
        assert_eq!(back.allowed_apps.len(), 2);
        assert_eq!(back.hard_cap_at_ms, 3_000);
    }
}
