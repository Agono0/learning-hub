//! Learning HUB native shell.
//!
//! Deliberately thin: the entire app — UI *and* backend (handlers on
//! sqlite-wasm, persisted in OPFS) — lives in the shared web bundle built from
//! `apps/web`, so every change there ships to Windows and Android unchanged.
//! Rust only provides what a webview cannot: native dialogs, file writes,
//! notifications, haptics, logging and window management.

mod focus;
mod idle;
// Max Focus lock windows (M2-05, wired as commands in M2-23). WINDOWS DESKTOP
// ONLY: the fullscreen lock windows use desktop-only window APIs
// (`decorations`) and the keyboard hook / refocus guard use the `windows`
// crate — none of that exists on mobile, where the Max Focus session runs on
// the web-layer gates and the platform actuator commands below. The session
// commands in `focus.rs` fall back to no-op window handling on other targets.
#[cfg(windows)]
mod lock_win;

// M2-08 admin-tier hardening: DisableTaskMgr policy + watchdog (Windows).
#[cfg(windows)]
mod lock_watchdog;
mod update;

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

    let path = request.uri().path().trim_start_matches('/');
    let rel = if path.is_empty() { "index.html" } else { path };
    // NOTE: `asset_resolver()` is an inherent AppHandle method in tauri 2 —
    // `tauri::Manager` is NOT needed (and would warn as unused) here; the
    // Manager-backed `app.path()` call lives inside `update::slot_updates_dir`.
    let base = update::slot_updates_dir(app);

    if let Some(bytes) = update::lookup_in_active_slot(&base, rel) {
        return tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", mime_for(rel))
            .body(Cow::Owned(bytes))
            .expect("valid slot response");
    }

    // Fallback: the payload the shell shipped with (bundled export).
    // `AssetResolver::get` takes an owned `String` path in tauri 2, and
    // `Asset::bytes()` returns `&[u8]` — copy it into the response `Cow`.
    if let Some(asset) = app.asset_resolver().get(rel.to_string()) {
        return tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", mime_for(rel))
            .body(Cow::Owned(asset.bytes().to_owned()))
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
            idle::system_idle_ms,
            focus::focus_lock_release,
            focus::focus_lock_status,
            update::update_confirm_boot_ready,
            update::update_download_file,
            update::update_fetch_verified_manifest,
            update::update_download_android_apk,
            update::update_android_device_info,
            update::update_install_android_apk,
            focus::focus_android_provision_status,
            focus::focus_android_start_lock_task,
            focus::focus_android_stop_lock_task,
            focus::focus_android_set_watch_state,
            focus::focus_android_open_accessibility_settings,
            focus::focus_android_session_service,
            focus::focus_android_session_elapsed,
            focus::focus_android_set_anti_uninstall,
            focus::focus_android_battery_status,
            focus::focus_session_apply,
            focus::focus_session_status,
            focus::focus_session_release,
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
            if let Err(e) = update::boot_reconcile(&update::slot_updates_dir(app.handle())) {
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
        // handle as `MaxUpdateAndroid` for the update module's sideload
        // commands.
        .plugin(update::max_update_plugin())
        // Device Owner status for Max Focus Tier 1 (M2-10): registers the
        // Kotlin `MaxFocusAndroidPlugin`; M2-11 (Lock Task) extends it.
        .plugin(focus::focus_android_plugin());

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
        // NSIS shell updates from the signed latest.json; the WEB payload
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
