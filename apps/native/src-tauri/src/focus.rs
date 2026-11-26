//! Learning HUB — Max Focus Mode watchdog and loopback pairing server.
//!
//! Provides two-layer enforcement on Windows:
//! 1. A local HTTP loopback server (127.0.0.1:47615) paired with the Chrome MV3 extension.
//! 2. A foreground window watchdog minimizing unpermitted desktop applications.

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;

use crate::loopback_http::{
    classify, read_request_head, write_busy, ConnGuard, Route, READ_DEADLINE,
};
// Duration feeds only the Windows watchdog cadence + heartbeat windows.
#[cfg(windows)]
use std::time::Duration;
use std::time::Instant;

// Windows-desktop lock-window machinery (fullscreen windows, keyboard hook,
// refocus guard, M2-05..M2-09). The module is compiled ONLY on Windows — the
// session commands below fall back to status-only implementations elsewhere
// (mobile / non-Windows desktop), where Max Focus runs on the web-layer gates.
#[cfg(windows)]
use crate::lock_win;

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
                // Cap concurrent connections: extra ones get a 503 and are closed.
                let Some(guard) = ConnGuard::acquire() else {
                    write_busy(&mut stream);
                    continue;
                };
                let state_clone = state.clone();
                thread::spawn(move || {
                    let _guard = guard;
                    handle_connection(&mut stream, state_clone);
                });
            }
        }
    });
}

fn handle_connection(stream: &mut TcpStream, state: Arc<Mutex<FocusState>>) {
    // Bounded read (deadline + byte cap): an idle or slow client frees its thread.
    let head = match read_request_head(stream, READ_DEADLINE) {
        Ok(h) => h,
        Err(_) => return,
    };

    // Token check in constant time; an empty expected token (no active lock) never authorizes.
    let expected_token = {
        let current = state.lock().unwrap();
        current
            .lock
            .as_ref()
            .map(|l| l.token.clone())
            .unwrap_or_default()
    };
    let route = classify(&head, &expected_token);

    match route {
        Route::Malformed => return,
        Route::Options => {
            let response = "HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
Access-Control-Allow-Headers: Authorization, Content-Type\r\n\
Access-Control-Max-Age: 86400\r\n\r\n";
            let _ = stream.write_all(response.as_bytes());
            return;
        }
        Route::Unauthorized => {
            let response = "HTTP/1.1 401 Unauthorized\r\n\
Access-Control-Allow-Origin: *\r\n\
Content-Type: application/json\r\n\r\n{\"error\":\"Unauthorized\"}";
            let _ = stream.write_all(response.as_bytes());
            return;
        }
        Route::Lock | Route::Heartbeat | Route::NotFound => {}
    }

    if route == Route::Lock {
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
    } else if route == Route::Heartbeat {
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
    if max_session().lock().map(|c| c.is_some()).unwrap_or(true) {
        return; // memory already holds a session, or state poisoned
    }
    if let Some(snapshot) = read_session_file(&session_file_path(app)) {
        if let Ok(mut current) = max_session().lock() {
            *current = Some(snapshot);
        }
    }
}

// Platform seam for the lock WINDOWS (M2-05): Windows desktop applies real
// fullscreen lock windows via `lock_win`; every other target (mobile,
// non-Windows desktop) no-ops the window part and reports unlocked=false —
// enforcement there comes from the web-layer gates + the Android actuator
// commands below.

/// Apply the lock windows for a session snapshot (Windows desktop; no-op
/// elsewhere).
#[cfg(windows)]
fn apply_lock_windows_for_session(
    app: &tauri::AppHandle,
    allowed_apps: &[String],
    admin_hardening: bool,
) -> Result<(), String> {
    lock_win::apply_lock_windows_with_allowlist_and_tier(app, allowed_apps, admin_hardening)
}

#[cfg(not(windows))]
fn apply_lock_windows_for_session(
    _app: &tauri::AppHandle,
    _allowed_apps: &[String],
    _admin_hardening: bool,
) -> Result<(), String> {
    Ok(())
}

/// True while at least one lock window is alive (Windows desktop; false
/// elsewhere).
#[cfg(windows)]
fn lock_windows_active(app: &tauri::AppHandle) -> bool {
    lock_win::is_locked(app)
}

#[cfg(not(windows))]
fn lock_windows_active(_app: &tauri::AppHandle) -> bool {
    false
}

/// Release the lock windows (Windows desktop; no-op elsewhere).
#[cfg(windows)]
fn release_lock_windows_for_session(app: &tauri::AppHandle) -> Result<(), String> {
    lock_win::release_lock_windows(app)
}

#[cfg(not(windows))]
fn release_lock_windows_for_session(_app: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
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
    apply_lock_windows_for_session(&app, &snapshot.allowed_apps, admin_hardening)?;
    {
        let mut current = max_session().lock().map_err(|_| "max session state poisoned")?;
        *current = Some(snapshot.clone());
    }
    write_session_file(&session_file_path(&app), &snapshot)?;
    use tauri::Emitter;
    let _ = app.emit("max-focus://applied", &snapshot);
    Ok(serde_json::json!({
        "applied": true,
        "locked": lock_windows_active(&app),
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
        "locked": lock_windows_active(&app),
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
    release_lock_windows_for_session(&app)?;
    clear_session_file(&session_file_path(&app));
    let session = {
        let mut current = max_session().lock().map_err(|_| "max session state poisoned")?;
        current.take()
    };
    use tauri::Emitter;
    let _ = app.emit(
        "max-focus://released",
        serde_json::json!({ "reason": reason, "sessionId": session.as_ref().map(|s| s.session_id.clone()) }),
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

// ─── Max Focus Android bridge (M2-10/M2-11/M2-12/M2-14/M2-19/M2-20) ─────────
//
// The platform ACTUATORS behind the web session machine (M2-01): Device Owner
// status, Lock Task pinning, the accessibility watcher, the session
// foreground service + clock, the anti-uninstall gate and battery reading —
// all through the Kotlin `MaxFocusAndroidPlugin` / `MaxFocusLockTask`
// classes. Android-only; other hosts answer with a clean error so the UI can
// explain the platform gap instead of hanging.

/// Managed handle to the Kotlin `MaxFocusAndroidPlugin` (device-owner status,
/// watcher, session service; M2-11's Lock Task lives in the same plugin
/// family).
#[cfg(target_os = "android")]
#[derive(Clone)]
struct MaxFocusAndroid(tauri::plugin::PluginHandle<tauri::Wry>);

/// Registers the app-local Kotlin plugin (gen/android/.../MaxFocusAndroidPlugin.kt).
#[cfg(target_os = "android")]
pub fn focus_android_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::<tauri::Wry>::new("max-focus-android")
        .setup(|app, api| {
            use tauri::Manager;
            let handle =
                api.register_android_plugin("dev.learninghub.app", "MaxFocusAndroidPlugin")?;
            app.manage(MaxFocusAndroid(handle));
            // Lock Task Mode (M2-11) — separate class, same plugin family.
            let lock_task =
                api.register_android_plugin("dev.learninghub.app", "MaxFocusLockTask")?;
            app.manage(MaxFocusLockTask(lock_task));
            Ok(())
        })
        .build()
}

/// Managed handle to the Kotlin `MaxFocusLockTask` class (M2-11).
#[cfg(target_os = "android")]
#[derive(Clone)]
struct MaxFocusLockTask(tauri::plugin::PluginHandle<tauri::Wry>);

/// Device Owner provisioning status (M2-10): whether Learning HUB is Device
/// Owner on this device (Tier 1) and whether Lock Task is permitted (M2-11).
/// The SETUP WIZARD (focus page) shows the exact ADB provisioning command —
/// provisioning itself must run from a computer (`dpm set-device-owner`).
#[tauri::command]
pub async fn focus_android_provision_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let state = app.state::<MaxFocusAndroid>();
        state
            .0
            .run_mobile_plugin::<serde_json::Value>("deviceOwnerStatus", ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("device owner status is Android-only".to_string())
    }
}

/// Most packages one Max Focus session may allowlist.
const MAX_ALLOWLIST_PACKAGES: usize = 64;

/// Validates the package allowlist the webview hands to the Android bridge
/// (Lock Task packages and the accessibility watcher set): bounded count,
/// bounded length, and the `segment.segment` Android package-name shape. Blank
/// entries are dropped (the Kotlin side ignores them too) and duplicates removed.
pub fn sanitize_packages(packages: Vec<String>) -> Result<Vec<String>, String> {
    let mut out: Vec<String> = Vec::new();
    for raw in packages {
        let p = raw.trim();
        if p.is_empty() {
            continue;
        }
        let valid = p.len() <= 255
            && p.contains('.')
            && p.split('.').all(|seg| {
                let mut chars = seg.chars();
                matches!(chars.next(), Some(c) if c.is_ascii_alphabetic())
                    && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
            });
        if !valid {
            return Err("invalid Android package name in allowlist".to_string());
        }
        if !out.iter().any(|e| e == p) {
            out.push(p.to_string());
        }
        if out.len() > MAX_ALLOWLIST_PACKAGES {
            return Err(format!("allowlist is limited to {MAX_ALLOWLIST_PACKAGES} packages"));
        }
    }
    Ok(out)
}

/// Pins the foreground to the session's allowlisted packages (M2-11, Tier 1:
/// Device Owner only — the Kotlin side rejects otherwise). The emergency
/// dialer package MUST be part of `packages` (M2-15).
#[tauri::command]
pub async fn focus_android_start_lock_task(
    app: tauri::AppHandle,
    packages: Vec<String>,
) -> Result<serde_json::Value, String> {
    let packages = sanitize_packages(packages)?;
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let state = app.state::<MaxFocusLockTask>();
        state
            .0
            .run_mobile_plugin::<serde_json::Value>(
                "startLockTask",
                serde_json::json!({ "packages": packages }),
            )
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, packages);
        Err("Lock Task Mode is Android-only".to_string())
    }
}

/// Unpins the foreground (session end / emergency exit). Idempotent.
#[tauri::command]
pub async fn focus_android_stop_lock_task(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let state = app.state::<MaxFocusLockTask>();
        state
            .0
            .run_mobile_plugin::<serde_json::Value>("stopLockTask", ())
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("Lock Task Mode is Android-only".to_string())
    }
}

/// Arm/disarm the Tier 2 AccessibilityService watcher (M2-12) for the CURRENT
/// session: `active` + the allowlisted packages. The web layer calls this on
/// Max Focus start/end; the service stays inert whenever active=false.
#[tauri::command]
pub async fn focus_android_set_watch_state(
    app: tauri::AppHandle,
    active: bool,
    packages: Vec<String>,
) -> Result<serde_json::Value, String> {
    let packages = sanitize_packages(packages)?;
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let state = app.state::<MaxFocusAndroid>();
        state
            .0
            .run_mobile_plugin::<serde_json::Value>(
                "setWatchState",
                serde_json::json!({ "active": active, "packages": packages }),
            )
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, active, packages);
        Err("the accessibility watcher is Android-only".to_string())
    }
}

/// Deep-link to the system accessibility settings (Tier 2 grant screen).
/// The DISCLOSURE component (MaxFocusDisclosures.tsx) must be shown BEFORE
/// this is invoked — store policy requires informed consent.
#[tauri::command]
pub async fn focus_android_open_accessibility_settings(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let state = app.state::<MaxFocusAndroid>();
        state
            .0
            .run_mobile_plugin::<serde_json::Value>("openAccessibilitySettings", ())
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("accessibility settings are Android-only".to_string())
    }
}

/// Start/stop the Max Focus session foreground service (M2-14): the persistent
/// "session running" notification + boot-resume expectation. `active=true`
/// starts (with KEY_RESUME_EXPECTED), `false` stops and clears it.
#[tauri::command]
pub async fn focus_android_session_service(app: tauri::AppHandle, active: bool) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let state = app.state::<MaxFocusAndroid>();
        state
            .0
            .run_mobile_plugin::<serde_json::Value>(
                if active { "sessionServiceStart" } else { "sessionServiceStop" },
                (),
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, active);
        Err("the session service is Android-only".to_string())
    }
}

/// Monotonic elapsed ms since the running session's anchor (M2-14/M2-20):
/// elapsedRealtime is sleep-inclusive and wall-clock-tamper-proof.
#[tauri::command]
pub async fn focus_android_session_elapsed(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let state = app.state::<MaxFocusAndroid>();
        state
            .0
            .run_mobile_plugin::<serde_json::Value>("sessionElapsed", ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("the session clock is Android-only".to_string())
    }
}

/// Anti-uninstall hard gate (M2-14, Device Owner only): blocks uninstalling
/// Learning HUB during a protected session. The release path ALWAYS pairs
/// this with `active=false`; M2-24's boot reconcile re-asserts the state.
#[tauri::command]
pub async fn focus_android_set_anti_uninstall(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let state = app.state::<MaxFocusAndroid>();
        state
            .0
            .run_mobile_plugin::<serde_json::Value>(
                "setAntiUninstall",
                serde_json::json!({ "enabled": enabled }),
            )
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, enabled);
        Err("anti-uninstall is Android-only".to_string())
    }
}

/// Battery reading for the M2-19 auto-unlock gate (Android: the sticky
/// battery broadcast; Windows lands with the Win32 power feature — see
/// docs/SHARED_CHANGES.md). The caller runs the pure core gate
/// `shouldAutoUnlockBattery` and, when it fires, calls
/// `forceUnlockSession(session, clock, 'battery')`.
#[tauri::command]
pub async fn focus_android_battery_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let state = app.state::<MaxFocusAndroid>();
        state
            .0
            .run_mobile_plugin::<serde_json::Value>("batteryStatus", ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("the battery monitor is Android-only (Windows lands with the power feature)".to_string())
    }
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

#[cfg(test)]
mod loopback_tests {
    use super::*;
    use std::io::Read;
    use std::time::Duration;

    fn state(token: Option<&str>) -> Arc<Mutex<FocusState>> {
        Arc::new(Mutex::new(FocusState {
            lock: token.map(|t| FocusLockPayload {
                ends_at: "2030-01-01T00:00:00Z".into(),
                apps: vec![],
                domains: vec![],
                token: t.into(),
                strict: true,
            }),
            last_heartbeat: None,
            server_running: false,
            watchdog_running: false,
        }))
    }

    fn roundtrip(st: Arc<Mutex<FocusState>>, req: &[u8]) -> (String, Arc<Mutex<FocusState>>) {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap();
        let st2 = st.clone();
        let h = thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            handle_connection(&mut s, st2);
        });
        let mut c = TcpStream::connect(addr).unwrap();
        c.write_all(req).unwrap();
        let mut out = String::new();
        c.read_to_string(&mut out).unwrap();
        h.join().unwrap();
        (out, st)
    }

    #[test]
    fn authorized_heartbeat_is_recorded_and_lock_is_readable() {
        let (r, st) = roundtrip(
            state(Some("secret")),
            b"POST /v1/heartbeat HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer secret\r\n\r\n",
        );
        assert!(r.starts_with("HTTP/1.1 200"), "{r}");
        assert!(st.lock().unwrap().last_heartbeat.is_some());
        let (r, _) = roundtrip(
            state(Some("secret")),
            b"GET /v1/lock HTTP/1.1\r\nauthorization: Bearer secret\r\n\r\n",
        );
        assert!(r.starts_with("HTTP/1.1 200") && r.contains("\"active\":true"), "{r}");
    }

    #[test]
    fn wrong_missing_or_no_lock_token_is_401_and_records_nothing() {
        let cases = [
            (Some("secret"), "GET /v1/lock HTTP/1.1\r\nAuthorization: Bearer nope\r\n\r\n"),
            (Some("secret"), "POST /v1/heartbeat HTTP/1.1\r\n\r\n"),
            (None, "GET /v1/lock HTTP/1.1\r\nAuthorization: Bearer \r\n\r\n"),
        ];
        for (tok, req) in cases {
            let (r, st) = roundtrip(state(tok), req.as_bytes());
            assert!(r.starts_with("HTTP/1.1 401"), "{r}");
            assert!(st.lock().unwrap().last_heartbeat.is_none());
        }
    }

    #[test]
    fn idle_client_is_dropped_after_the_read_deadline() {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap();
        let st = state(Some("s"));
        let h = thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let t = Instant::now();
            handle_connection(&mut s, st);
            t.elapsed()
        });
        let _idle = TcpStream::connect(addr).unwrap();
        let took = h.join().unwrap();
        assert!(took >= Duration::from_secs(4) && took < Duration::from_secs(8), "{took:?}");
    }
}

#[cfg(test)]
mod package_allowlist_tests {
    use super::*;

    fn v(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn accepts_real_package_names_and_dedupes() {
        let got = sanitize_packages(v(&["com.android.dialer", " ", "com.android.dialer", "dev.learninghub.app"]))
            .unwrap();
        assert_eq!(got, v(&["com.android.dialer", "dev.learninghub.app"]));
    }

    #[test]
    fn rejects_malformed_names() {
        for bad in ["nodots", "a..b", "com.1abc.x", "com.a b.c", "com/evil.x", "com.x;rm"] {
            assert!(sanitize_packages(v(&[bad])).is_err(), "{bad}");
        }
        assert!(sanitize_packages(v(&[&format!("a.{}", "b".repeat(300))])).is_err());
    }

    #[test]
    fn caps_the_list_length() {
        let many: Vec<String> = (0..100).map(|i| format!("com.example.app{i}")).collect();
        assert!(sanitize_packages(many).is_err());
        let ok: Vec<String> = (0..64).map(|i| format!("com.example.app{i}")).collect();
        assert_eq!(sanitize_packages(ok).unwrap().len(), 64);
    }
}
