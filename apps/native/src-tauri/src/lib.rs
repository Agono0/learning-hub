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
    if !path.contains('.') || path.ends_with('/') {
        return "text/html; charset=utf-8";
    }
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

/// Decodes standard URL percent-encoding (e.g. `%20` -> ` `) without external dependencies.
fn percent_decode(input: &str) -> String {
    let mut bytes = Vec::new();
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let h1 = chars.next();
            let h2 = chars.next();
            if let (Some(h1), Some(h2)) = (h1, h2) {
                if let (Some(d1), Some(d2)) = (
                    char::from(h1).to_digit(16),
                    char::from(h2).to_digit(16),
                ) {
                    bytes.push(((d1 << 4) | d2) as u8);
                    continue;
                }
                bytes.push(b'%');
                bytes.push(h1);
                bytes.push(h2);
                continue;
            } else {
                bytes.push(b'%');
                if let Some(h1) = h1 {
                    bytes.push(h1);
                }
                continue;
            }
        }
        bytes.push(b);
    }
    String::from_utf8(bytes).unwrap_or_else(|_| input.to_string())
}

/// Serves assets for the webview: checks the ACTIVE slot first (for delta-OTA
/// hot updates), falling back to the bundled `.next-tauri` assets via
/// `app.asset_resolver()` when the slot does not have the file (first run,
/// empty slot, or untouched asset).
///
/// Origin-safe: By registering this protocol handler for the standard `"tauri"`
/// scheme, the webview origin stays strictly at `tauri://localhost` (or
/// `http://tauri.localhost` on Windows/Android with useHttpsScheme=false).
/// This prevents OPFS and localStorage storage scope from ever moving,
/// safeguarding the sqlite-wasm database while enabling delta updates.
fn serve_slot_protocol(
    app: &tauri::AppHandle,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<std::borrow::Cow<'static, [u8]>> {
    use std::borrow::Cow;

    let path = request.uri().path().trim_start_matches('/');
    let decoded = percent_decode(path);
    let rel = if decoded.is_empty() { "index.html" } else { &decoded };
    // NOTE: `asset_resolver()` is an inherent AppHandle method in tauri 2 —
    // `tauri::Manager` is NOT needed (and would warn as unused) here; the
    // Manager-backed `app.path()` call lives inside `update::slot_updates_dir`.
    let base = update::slot_updates_dir(app);

    if let Some(bytes) = update::lookup_in_active_slot(&base, rel) {
        return tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", mime_for(rel))
            .header("Access-Control-Allow-Origin", "*")
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
            .header("Access-Control-Allow-Origin", "*")
            .body(Cow::Owned(asset.bytes().to_owned()))
            .expect("valid bundled response");
    }

    tauri::http::Response::builder()
        .status(404)
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Access-Control-Allow-Origin", "*")
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
            update::update_fetch_channel_pointer,
            update::update_fetch_verified_manifest,
            update::update_download_android_apk,
            update::update_android_device_info,
            update::update_install_android_apk,
            update::update_apply_delta_patch,
            update::update_get_slot_status,
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
        // Delta-OTA A/B slots (origin-safe): serve the active slot's payload first,
        // falling back to the bundled assets via asset_resolver() when no
        // slot has been promoted yet (first run) or the file is not in the slot.
        // We register "tauri" so the webview origin stays strictly at
        // tauri://localhost / http://tauri.localhost (preserving OPFS & storage scope).
        // We also keep "lhslot" for backward-compatibility.
        .register_uri_scheme_protocol("tauri", |ctx, request| {
            serve_slot_protocol(ctx.app_handle(), request)
        })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_decode_decodes_standard_sequences() {
        assert_eq!(percent_decode("index.html"), "index.html");
        assert_eq!(percent_decode("hello%20world.js"), "hello world.js");
        assert_eq!(percent_decode("nested/path%2Ffile.txt"), "nested/path/file.txt");
        assert_eq!(percent_decode(""), "");
        assert_eq!(percent_decode("%ZZ%2"), "%ZZ%2");
    }

    #[test]
    fn mime_for_maps_extensions_and_extensionless_html() {
        assert_eq!(mime_for("index.html"), "text/html; charset=utf-8");
        assert_eq!(mime_for("review"), "text/html; charset=utf-8");
        assert_eq!(mime_for("courses/new"), "text/html; charset=utf-8");
        assert_eq!(mime_for("courses/"), "text/html; charset=utf-8");
        assert_eq!(mime_for("app.js"), "text/javascript; charset=utf-8");
        assert_eq!(mime_for("style.css"), "text/css; charset=utf-8");
        assert_eq!(mime_for("icon.svg"), "image/svg+xml");
        assert_eq!(mime_for("data.wasm"), "application/wasm");
        assert_eq!(mime_for("unknown.xyz"), "application/octet-stream");
    }
}
