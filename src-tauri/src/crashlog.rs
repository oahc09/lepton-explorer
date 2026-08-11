//! Crash / exception logging for Lepton Explorer.
//!
//! Three layers:
//! 1. A Rust panic hook (`install_crash_logger`) that writes the panic location,
//!    message and a full backtrace to a timestamped file under the app's local
//!    data directory. This captures native crashes even in the release build
//!    where no console is attached.
//! 2. A **vectored exception handler** (VEH) that captures *native* faults such
//!    as access violations — including a crash inside a third-party shell
//!    extension triggered by the "显示更多选项" classic context menu. Rust's
//!    panic hook cannot catch these; the VEH can record them before the
//!    process is terminated.
//! 3. A Tauri command (`log_frontend_error`) that the webview calls from
//!    `window.onerror` / `unhandledrejection` handlers, so JS exceptions are
//!    persisted to the same logs folder.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

use tauri_plugin_opener::OpenerExt;
use windows::Win32::Foundation::EXCEPTION_ACCESS_VIOLATION;
use windows::Win32::System::Diagnostics::Debug::{AddVectoredExceptionHandler, EXCEPTION_POINTERS};

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

/// Vectored exception handler that captures *native* faults (access violations,
/// etc.) which Rust's panic hook can never see. A Shell classic-context-menu
/// crash inside a third-party extension is exactly such a fault: the OS
/// terminates the process directly. We write what we can to a log file before
/// letting the process terminate, so the failure is at least observable.
///
/// Returns `EXCEPTION_CONTINUE_SEARCH` (0) so the OS proceeds to terminate the
/// process as usual — we only want to record, not to "recover" from a corrupted
/// state.
extern "system" fn veh_handler(exception_info: *mut EXCEPTION_POINTERS) -> i32 {
    if exception_info.is_null() {
        return 0;
    }
    unsafe {
        let record = (*exception_info).ExceptionRecord;
        if record.is_null() {
            return 0;
        }
        let code = (*record).ExceptionCode.0;
        let address = (*record).ExceptionAddress;
        let faulting = if code == EXCEPTION_ACCESS_VIOLATION.0 {
            (*record).ExceptionInformation[1]
        } else {
            0
        };

        let stamp = stamp();
        let path = logs_dir().join(format!("crash-{stamp}.log"));
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(f, "=== Lepton Explorer NATIVE fault @ {stamp} ===");
            let _ = writeln!(f, "exception code: 0x{code:08X}");
            let _ = writeln!(f, "exception address: {address:p}");
            if code == EXCEPTION_ACCESS_VIOLATION.0 {
                let _ = writeln!(f, "faulting address: 0x{faulting:016X}");
            }
            let _ = writeln!(
                f,
                "note: native faults (e.g. a crashing shell extension) kill the process; check the log dir for details."
            );
            let _ = f.flush();
        }
        0
    }
}

/// Install the global panic hook. Safe to call once at startup, before
/// `tauri::Builder::run`. Tauri's default hook still runs (so the user still
/// gets the standard error dialog), and on top of that we persist a file.
pub fn install_crash_logger() {
    // Make sure backtraces are captured even if the env wasn't set.
    if std::env::var_os("RUST_BACKTRACE").is_none() {
        std::env::set_var("RUST_BACKTRACE", "1");
    }

    // Capture native (non-panic) faults such as access violations raised inside
    // third-party shell extensions used by the classic context menu.
    unsafe {
        AddVectoredExceptionHandler(1, Some(veh_handler));
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
