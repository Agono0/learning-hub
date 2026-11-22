//! Learning HUB native shell.
//!
//! Deliberately thin: the entire app — UI *and* backend (handlers on
//! sqlite-wasm, persisted in OPFS) — lives in the shared web bundle built from
//! `apps/web`, so every change there ships to Windows and Android unchanged.
//! Rust only provides what a webview cannot: native dialogs, file writes,
//! notifications, haptics, logging and window management.

mod focus;
// Max Focus lock windows (M2-05) — commands are wired in M2-23.
#[allow(dead_code)]
mod lock_win;
mod update;

/// Updates base dir under app data: `<app_data_dir>/updates` (A/B slots plus
/// the atomic pointer file — see `update.rs`).
fn slot_updates_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("updates"))
        .unwrap_or_else(|_| std::env::temp_dir().join("learning-hub-updates"))
}

/// Content-Type for slot-served files — conservative extension map covering
/// everything the `.next-tauri` export emits. Unknown extensions default to
/// `application/octet-stream` so nothing is ever sniffed.
fn mime_for(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" | "otf" => "font/ttf",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "wasm" => "application/wasm",
        "txt" => "text/plain; charset=utf-8",
        "webmanifest" => "application/manifest+json",
        "xml" => "application/xml",
        _ => "application/octet-stream",
    }
}

/// Serves the ACTIVE slot over the custom `lhslot` scheme (O1-04), falling
/// back to the bundled `.next-tauri` assets via the asset resolver when the
/// slot has no such file (first run — no pointer, empty slot, missing file).
///
/// Uri shapes from the webview: `https://lhslot.localhost/<path>` on Windows
/// and `lhslot://localhost/<path>` elsewhere — both expose the path through
/// `Uri::path()`, so one parser serves both.
///
/// Capabilities note: capabilities bind by window label (`"main"`), not by
/// origin, and Tauri 2 treats registered custom schemes as app origins — so
/// IPC permissions survive the slot switch with no capability rebind.
///
/// Origin note: the slot origin differs from the bundled origin, which moves
/// the webview's OPFS/localStorage scope; slot payloads are only promoted
/// after signature verification, and the storage path is tracked in
/// docs/updates.md §"Slots & the webview origin".
fn serve_slot_protocol(
    app: &tauri::AppHandle,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<std::borrow::Cow<'static, [u8]>> {
    use std::borrow::Cow;
    use tauri::Manager;

    let path = request.uri().path().trim_start_matches('/');
    let rel = if path.is_empty() { "index.html" } else { path };
    let base = slot_updates_dir(app);

    if let Some(bytes) = update::lookup_in_active_slot(&base, rel) {
        return tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", mime_for(rel))
            .body(Cow::Owned(bytes))
            .expect("valid slot response");
    }

    // Fallback: the payload the shell shipped with (bundled export).
    if let Some(asset) = app.asset_resolver().get(rel) {
        return tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", mime_for(rel))
            .body(Cow::Owned(asset.bytes().into_owned()))
            .expect("valid bundled response");
    }

    tauri::http::Response::builder()
        .status(404)
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(Cow::Borrowed(b"not found".as_slice()))
        .expect("valid 404 response")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            focus::focus_lock_apply,
            focus::focus_lock_release,
            focus::focus_lock_status,
            update_confirm_boot_ready,
            update_download_file,
            update_android_device_info,
            update_install_android_apk,
            focus_android_provision_status,
            focus_android_start_lock_task,
            focus_android_stop_lock_task,
            focus_android_set_watch_state,
            focus_android_open_accessibility_settings,
            focus_android_session_service,
            focus_android_session_elapsed,
            focus_android_set_anti_uninstall,
            focus_android_battery_status,
            focus_session_apply,
            focus_session_status,
            focus_session_release,
        ])
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // AI provider traffic from the hub worker (via the main thread) — native HTTP, no webview CORS.
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        // Delta-OTA A/B slots (O1-04): serve the active slot's payload over a
        // custom scheme, falling back to the bundled assets when no slot has
        // been promoted yet (first run). See update.rs + docs/updates.md.
        .register_uri_scheme_protocol("lhslot", |ctx, request| {
            serve_slot_protocol(ctx.app_handle(), request)
        })
        .setup(|app| {
            // Delta-OTA boot reconcile (O1-05): runs on every platform before
            // the webview loads — counts this boot against the active slot and
            // rolls the pointer back after MAX_BOOT_MISSES unconfirmed boots.
            // The webview invokes `update_confirm_boot_ready` when it is up.
            if let Err(e) = update::boot_reconcile(&slot_updates_dir(app.handle())) {
                log::warn!("update boot reconcile failed: {e}");
            }

            // Desktop-only shell extras: tray menu + close-to-tray.
            #[cfg(desktop)]
            setup_desktop_shell(app)?;

            Ok(())
        });

    #[cfg(mobile)]
    let builder = builder
        .plugin(tauri_plugin_haptics::init())
        // Android sideload installer (O1-13): registers the Kotlin
        // `MaxUpdatePlugin` (PackageInstaller + consent flow) and manages its
        // handle as `MaxUpdateAndroid` for the commands below.
        .plugin(max_update_plugin())
        // Device Owner status for Max Focus Tier 1 (M2-10): registers the
        // Kotlin `MaxFocusAndroidPlugin`; M2-11 (Lock Task) extends it.
        .plugin(focus_android_plugin());

    // Desktop: one running instance (focus it on relaunch) + remembered window geometry.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Windows native-shell updater (O1-10): the official plugin handles
        // NSIS/MSI shell updates from the signed latest.json; the WEB payload
        // updates through the A/B slots (update.rs). Needs
        // `tauri-plugin-updater = "2"` in Cargo.toml and the plugins.updater
        // block in tauri.conf.json — both LEAD-applied, see
        // docs/SHARED_CHANGES.md.
        .plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("error while running Learning HUB");
}

/// Desktop shell extras (tray menu + close-to-tray) — moved verbatim out of
/// the old inline setup closure so the O1-05 boot reconcile could join the
/// single platform-independent setup hook.
#[cfg(desktop)]
fn setup_desktop_shell(app: &mut tauri::App) -> Result<(), tauri::Error> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
        Manager,
    };

    let open_i = MenuItem::with_id(app, "open", "Open Learning HUB", true, None::<&str>)?;
    let hud_i = MenuItem::with_id(app, "hud", "Quick-HUD (Ctrl+Shift+Space)", true, None::<&str>)?;
    let reviews_i = MenuItem::with_id(app, "reviews", "Today's Reviews", true, None::<&str>)?;
    let focus_i = MenuItem::with_id(app, "focus", "Quick Focus", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_i, &hud_i, &reviews_i, &focus_i, &quit_i])?;

    let mut tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            "hud" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                    let _ = window.eval("window.dispatchEvent(new CustomEvent('toggle-quick-hud'));");
                }
            }
            "reviews" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                    let _ = window.eval("if (window.location.pathname !== '/review') window.location.href = '/review';");
                }
            }
            "focus" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                    let _ = window.eval("if (window.location.pathname !== '/focus') window.location.href = '/focus';");
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    let _ = tray_builder.build(app)?;

    // Close-to-tray on main window
    if let Some(window) = app.get_webview_window("main") {
        let win_clone = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = win_clone.hide();
            }
        });
    }

    Ok(())
}

/// The webview reports it is up and serving (O1-05) — invoked once after the
/// frontend mounts. Resets the boot-confirm counter of the active slot so a
/// healthy boot never accumulates toward rollback. The client service wires
/// this into its mount flow (apps/web/src/lib/updates.ts).
#[tauri::command]
pub fn update_confirm_boot_ready(app: tauri::AppHandle) -> Result<(), String> {
    update::confirm_boot_ready(&slot_updates_dir(&app)).map_err(|e| e.to_string())
}

// ── Android sideload bridge (O1-13) ────────────────────────────────────────

/// Managed handle to the Kotlin `MaxUpdatePlugin` registered at setup
/// (`max_update_plugin`). Android-only; the sideload commands below reach the
/// PackageInstaller flow through it.
#[cfg(target_os = "android")]
#[derive(Clone)]
struct MaxUpdateAndroid(tauri::plugin::PluginHandle<tauri::Wry>);

/// Registers the app-local Kotlin plugin (`gen/android/.../MaxUpdatePlugin.kt`,
/// package `dev.learninghub.app`) so its PackageInstaller commands are
/// reachable from Rust. Android-only — compiled out elsewhere.
#[cfg(target_os = "android")]
fn max_update_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::<tauri::Wry>::new("max-update")
        .setup(|app, api| {
            let handle =
                api.register_android_plugin("dev.learninghub.app", "MaxUpdatePlugin")?;
            app.manage(MaxUpdateAndroid(handle));
            Ok(())
        })
        .build()
}

/// Android device facts for the sideload flow (O1-13): the device's primary
/// ABI (per-ABI APK pick), SDK level and whether the user has already granted
/// the per-app "install unknown apps" consent. Other hosts answer with a
/// clean error — the client service only calls this on Android.
#[tauri::command]
pub async fn update_android_device_info(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let state = app.state::<MaxUpdateAndroid>();
        state
            .0
            .run_mobile_plugin::<serde_json::Value>("deviceInfo", ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("sideload updates are Android-only".to_string())
    }
}

/// Installs a downloaded, sha256-verified per-ABI APK (O1-13). `apk_path` must
/// be a file the Rust downloader produced (confined to the updates dir).
///
/// Never silent: when the per-app "install unknown apps" grant is missing, the
/// Kotlin side opens the system consent screen and resolves
/// `{ consentRequired: true }` (the UI explains and lets the user re-tap);
/// after consent, `{ committed: true }` once the PackageInstaller session is
/// committed — the SYSTEM installer dialog is the final consent stage.
#[tauri::command]
pub async fn update_install_android_apk(
    app: tauri::AppHandle,
    apk_path: String,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let state = app.state::<MaxUpdateAndroid>();
        state
            .0
            .run_mobile_plugin::<serde_json::Value>(
                "installApk",
                serde_json::json!({ "apkPath": apk_path }),
            )
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, apk_path);
        Err("sideload updates are Android-only".to_string())
    }
}

// ── Max Focus Android bridge (M2-10) ───────────────────────────────────────

/// Managed handle to the Kotlin `MaxFocusAndroidPlugin` (device-owner status;
/// M2-11's Lock Task commands will live in the same plugin).
#[cfg(target_os = "android")]
#[derive(Clone)]
struct MaxFocusAndroid(tauri::plugin::PluginHandle<tauri::Wry>);

/// Registers the app-local Kotlin plugin (gen/android/.../MaxFocusAndroidPlugin.kt).
#[cfg(target_os = "android")]
fn focus_android_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::<tauri::Wry>::new("max-focus-android")
        .setup(|app, api| {
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

/// Managed handle to the Kotlin `MaxFocusLockTask` class (M2-11).
#[cfg(target_os = "android")]
#[derive(Clone)]
struct MaxFocusLockTask(tauri::plugin::PluginHandle<tauri::Wry>);

/// Pins the foreground to the session's allowlisted packages (M2-11, Tier 1:
/// Device Owner only — the Kotlin side rejects otherwise). The emergency
/// dialer package MUST be part of `packages` (M2-15).
#[tauri::command]
pub async fn focus_android_start_lock_task(
    app: tauri::AppHandle,
    packages: Vec<String>,
) -> Result<serde_json::Value, String> {
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
/// battery broadcast; Windows: GetSystemPowerStatus behind the
/// Win32_System_Power feature request in docs/SHARED_CHANGES.md). The caller
/// runs the pure core gate `shouldAutoUnlockBattery` and, when it fires,
/// calls `forceUnlockSession(session, clock, 'battery')`.
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

/// Resumable ranged download of one update artifact (O1-16), run from the
/// webview's client service. Progress is emitted to ALL windows as
/// `update://download-progress` events (`{ downloaded, total }`) so the
/// update banner can show a live bar (O1-15/O1-27).
///
/// Defense in depth: `dest` must live inside `<app_data_dir>/updates` — the
/// webview cannot aim this command at arbitrary filesystem paths.
#[tauri::command]
pub fn update_download_file(
    app: tauri::AppHandle,
    url: String,
    dest: String,
    total: u64,
    expected_sha256: String,
) -> Result<(), String> {
    use tauri::Emitter;

    let base = slot_updates_dir(&app);
    let dest_path = std::path::PathBuf::from(&dest);
    if !dest_path.starts_with(&base) {
        return Err(format!(
            "update download destination must live under {:?}",
            base
        ));
    }
    let handle = app.clone();
    update::download_resumable_http(
        &dest_path,
        &url,
        total,
        &expected_sha256,
        move |downloaded, total| {
            let _ = handle.emit(
                "update://download-progress",
                serde_json::json!({ "downloaded": downloaded, "total": total }),
            );
        },
    )
    .map_err(|e| e.to_string())
}
