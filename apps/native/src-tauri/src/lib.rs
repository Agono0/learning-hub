//! Learning HUB native shell.
//!
//! Deliberately thin: the entire app — UI *and* backend (handlers on
//! sqlite-wasm, persisted in OPFS) — lives in the shared web bundle built from
//! `apps/web`, so every change there ships to Windows and Android unchanged.
//! Rust only provides what a webview cannot: native dialogs, file writes,
//! notifications, haptics, logging and window management.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // AI provider traffic from the hub worker (via the main thread) — native HTTP, no webview CORS.
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init());

    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_haptics::init());

    // Desktop: one running instance (focus it on relaunch) + remembered window geometry.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build());

    builder
        .run(tauri::generate_context!())
        .expect("error while running Learning HUB");
}
