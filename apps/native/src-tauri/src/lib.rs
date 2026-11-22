//! Learning HUB native shell.
//!
//! Deliberately thin: the entire app — UI *and* backend (handlers on
//! sqlite-wasm, persisted in OPFS) — lives in the shared web bundle built from
//! `apps/web`, so every change there ships to Windows and Android unchanged.
//! Rust only provides what a webview cannot: native dialogs, file writes,
//! notifications, haptics, logging and window management.

mod focus;
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
    let builder = builder.plugin(tauri_plugin_haptics::init());

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
