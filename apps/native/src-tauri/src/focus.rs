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
