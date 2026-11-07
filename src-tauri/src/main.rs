#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::webview::{PermissionKind, PermissionResponse};
#[cfg(target_os = "macos")]
use tauri::Manager;

/// The Anthropic key: ANTHROPIC_API_KEY from the environment, else from a .env file
/// next to the project (dev) or the binary.
#[tauri::command]
fn api_key() -> Option<String> {
    if let Ok(k) = std::env::var("ANTHROPIC_API_KEY") {
        return Some(k);
    }
    let candidates = [
        concat!(env!("CARGO_MANIFEST_DIR"), "/../.env").to_string(),
        ".env".to_string(),
        std::env::current_exe()
            .ok()
            .and_then(|p| {
                p.parent()
                    .map(|d| d.join(".env").to_string_lossy().into_owned())
            })
            .unwrap_or_default(),
    ];
    for path in candidates {
        if let Ok(text) = std::fs::read_to_string(&path) {
            for line in text.lines() {
                if let Some(v) = line.trim().strip_prefix("ANTHROPIC_API_KEY=") {
                    return Some(v.trim().trim_matches('"').to_string());
                }
            }
        }
    }
    None
}

/// Game log lines from the page, so they show in the terminal too.
#[tauri::command]
fn log(line: String) {
    println!("{line}");
}

/// macOS 26+: give the window an (empty) unified toolbar so the traffic lights get
/// their proper glass capsule instead of a squashed one under the hidden title bar.
#[cfg(target_os = "macos")]
fn native_titlebar(window: &tauri::WebviewWindow) {
    use objc2::{MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{NSToolbar, NSWindow, NSWindowToolbarStyle};
    let Ok(ptr) = window.ns_window() else { return };
    let ptr = ptr as usize;
    let _ = window.run_on_main_thread(move || unsafe {
        let mtm = MainThreadMarker::new_unchecked();
        let ns: &NSWindow = &*(ptr as *const NSWindow);
        let toolbar = NSToolbar::init(NSToolbar::alloc(mtm));
        ns.setToolbar(Some(&toolbar));
        ns.setToolbarStyle(NSWindowToolbarStyle::UnifiedCompact);
    });
}

fn main() {
    tauri::Builder::default()
        .on_permission_request(|_, kind| match kind {
            PermissionKind::Camera => PermissionResponse::Allow,
            _ => PermissionResponse::Default,
        })
        .setup(|_app| {
            #[cfg(target_os = "macos")]
            if let Some(w) = _app.get_webview_window("main") {
                native_titlebar(&w);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![api_key, log])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
