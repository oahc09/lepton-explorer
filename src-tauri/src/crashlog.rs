//! Crash / exception logging for Lepton Explorer.
//!
//! Two layers:
//! 1. A Rust panic hook (`install_crash_logger`) that writes the panic location,
//!    message and a full backtrace to a timestamped file under the app's local
//!    data directory. This captures native crashes even in the release build
//!    where no console is attached.
//! 2. A Tauri command (`log_frontend_error`) that the webview calls from
//!    `window.onerror` / `unhandledrejection` handlers, so JS exceptions are
//!    persisted to the same logs folder.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

use tauri_plugin_opener::OpenerExt;

/// %LOCALAPPDATA%/com.lepton.explorer/logs  (falls back to /tmp if unavailable).
fn logs_dir() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| std::env::temp_dir());
    let dir = base.join("com.lepton.explorer").join("logs");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn stamp() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S%.3f").to_string()
}

/// Install the global panic hook. Safe to call once at startup, before
/// `tauri::Builder::run`. Tauri's default hook still runs (so the user still
/// gets the standard error dialog), and on top of that we persist a file.
pub fn install_crash_logger() {
    // Make sure backtraces are captured even if the env wasn't set.
    if std::env::var_os("RUST_BACKTRACE").is_none() {
        std::env::set_var("RUST_BACKTRACE", "1");
    }

    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        // Preserve Tauri's default behavior (dialog / abort).
        previous(info);

        let stamp = stamp();
        let location = info.location();

        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "<non-string panic payload>".to_string()
        };

        let backtrace = std::backtrace::Backtrace::force_capture();

        let path = logs_dir().join(format!("crash-{stamp}.log"));
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(f, "=== Lepton Explorer native crash @ {stamp} ===");
            let _ = writeln!(f, "location: {location:?}");
            let _ = writeln!(f, "panic: {payload}");
            let _ = writeln!(f, "backtrace:\n{backtrace}");
            let _ = f.flush();
        }
    }));
}

/// Tauri command invoked from the frontend to record a JS exception.
#[tauri::command]
pub fn log_frontend_error(msg: String) {
    let stamp = stamp();
    let path = logs_dir().join(format!("frontend-{stamp}.log"));
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "[{stamp}] {msg}\n");
        let _ = f.flush();
    }
}

/// Open the crash-log directory in the system file manager. The directory is
/// created first (if absent) so the button always works, even before any
/// crash has occurred.
#[tauri::command]
pub fn open_logs_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = logs_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}
