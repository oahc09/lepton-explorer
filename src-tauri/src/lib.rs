pub mod error;
pub mod folder_views;
pub mod fs_ops;
pub mod gallery;
pub mod network;
pub mod office;
pub mod open_with;
pub mod ops;
pub mod autostart;
pub mod shell_menu;
pub mod crashlog;
pub mod special;
pub mod thumbnails;
pub mod watch;
pub mod zip;

use error::{AppError, Result};
use tauri::Emitter;

/// Progress payload emitted during a tracked copy.
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CopyProgress {
    current: usize,
    total: usize,
    file: String,
}

/// Run blocking filesystem work on the async runtime's blocking thread pool,
/// keeping Tauri's main thread (and the UI) responsive. Maps join failures to
/// AppError::Unknown.
async fn blocking<T, F>(f: F) -> Result<T>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Unknown(format!("task join error: {e}")))?
}

#[tauri::command]
async fn list_directory(dir: String) -> Result<Vec<fs_ops::Entry>> {
    blocking(move || fs_ops::list_directory(&dir).map_err(AppError::from)).await
}

#[tauri::command]
async fn search(root: String, query: String) -> Result<Vec<fs_ops::Entry>> {
    blocking(move || fs_ops::search(&root, &query).map_err(AppError::from)).await
}

#[tauri::command]
fn suggest_paths(prefix: String) -> Vec<fs_ops::PathSuggestion> {
    fs_ops::suggest_paths(&prefix)
}

/// §11 self-capture helper: decode a `data:image/png;base64,...` URL (produced by
/// html2canvas in the frontend) and write the PNG bytes to `out_path`, so the
/// rendered app can be inspected visually (§11 verification).
///
/// Security: `out_path` is validated to be within the system temp directory or
/// the app's data directory, preventing path traversal to arbitrary locations.
/// Only available in debug builds — this is a development/acceptance helper
/// and is refused outright in release binaries.
#[tauri::command]
fn capture_dom_png(data_url: String, out_path: String) -> Result<()> {
    #[cfg(not(debug_assertions))]
    {
        let _ = (data_url, out_path);
        return Err(AppError::PermissionDenied(
            "capture_dom_png is a debug-only helper".into(),
        ));
    }
    #[cfg(debug_assertions)]
    {
        use base64::Engine;

        // Security: restrict output to temp or app-data directories only.
        let target = std::path::Path::new(&out_path);
        let canonical = target
            .parent()
            .and_then(|p| p.canonicalize().ok())
            .ok_or_else(|| AppError::InvalidName("invalid output directory".into()))?;

        let temp_dir = std::env::temp_dir();
        let temp_canonical = temp_dir.canonicalize().unwrap_or(temp_dir);
        let is_safe = canonical.starts_with(&temp_canonical)
            || dirs::data_dir()
                .and_then(|d| d.canonicalize().ok())
                .map(|d| canonical.starts_with(&d))
                .unwrap_or(false);

        if !is_safe {
            return Err(AppError::PermissionDenied(
                "output path must be within temp or app-data directory".into(),
            ));
        }

        let b64 = data_url.rsplit_once(',').map(|(_, b)| b).unwrap_or("");
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| AppError::Unknown(e.to_string()))?;
        std::fs::write(&out_path, bytes).map_err(AppError::from)
    }
}

#[tauri::command]
async fn get_properties(path: String) -> Result<u64> {
    blocking(move || fs_ops::folder_size(&path).map_err(AppError::from)).await
}

#[tauri::command]
fn create_dir(path: String) -> Result<()> {
    ops::create_dir(&path).map_err(AppError::from)
}

#[tauri::command]
fn create_file(path: String) -> Result<()> {
    ops::create_file(&path).map_err(AppError::from)
}

#[tauri::command]
fn create_typed_file(path: String) -> Result<()> {
    office::create_typed_file(&path).map_err(AppError::from)
}

#[tauri::command]
fn open_in_terminal(path: String) -> Result<()> {
    ops::open_in_terminal(&path).map_err(AppError::from)
}

/// Return a non-colliding path for `dir` + `name` (auto-suffixes " (n)"), so
/// "新建文件夹" can be created even when one already exists (Win11 auto-names).
#[tauri::command]
fn unique_target(dir: String, name: String) -> String {
    let target = std::path::Path::new(&dir).join(&name);
    ops::unique_path(&target).to_string_lossy().to_string()
}

#[tauri::command]
fn rename(from: String, to: String) -> Result<()> {
    ops::rename(&from, &to).map_err(AppError::from)
}

#[tauri::command]
async fn copy_items(sources: Vec<String>, dest: String) -> Result<Vec<String>> {
    blocking(move || ops::copy_items(&sources, &dest).map_err(AppError::from)).await
}

#[tauri::command]
async fn copy_items_with_strategy(
    sources: Vec<String>,
    dest: String,
    strategy: ops::ConflictStrategy,
) -> Result<Vec<String>> {
    blocking(move || ops::copy_items_with_strategy(&sources, &dest, strategy).map_err(AppError::from))
        .await
}

#[tauri::command]
async fn copy_with_progress(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest: String,
    strategy: ops::ConflictStrategy,
) -> Result<ops::TrackedCopyResult> {
    // Copy file-by-file, emitting "fs-copy-progress" {current,total,file} per file
    // so the frontend can render a progress dialog. Runs on a blocking thread so
    // the main thread stays free to deliver those very progress events.
    // `cancel_copy` sets a flag checked between top-level sources.
    // Returns paths created + original paths of items trashed during Replace.
    blocking(move || {
        ops::reset_copy_cancel();
        ops::copy_items_tracked(&sources, &dest, strategy, ops::is_copy_cancelled, |current, total, path| {
            let file = path
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_default();
            let _ = app.emit("fs-copy-progress", CopyProgress { current, total, file });
        })
        .map_err(AppError::from)
    })
    .await
}

#[tauri::command]
fn cancel_copy() {
    ops::request_copy_cancel();
}

#[tauri::command]
async fn move_with_progress(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest: String,
    strategy: ops::ConflictStrategy,
) -> Result<ops::TrackedMoveResult> {
    // Same-volume moves are instant renames; cross-volume moves copy+delete and
    // emit per-file progress. Reuses the copy progress event + cancel flag.
    // Returns (old,new) pairs + original paths of items trashed during Replace.
    blocking(move || {
        ops::reset_copy_cancel();
        ops::move_items_tracked(&sources, &dest, strategy, ops::is_copy_cancelled, |current, total, path| {
            let file = path
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_default();
            let _ = app.emit("fs-copy-progress", CopyProgress { current, total, file });
        })
        .map_err(AppError::from)
    })
    .await
}

#[tauri::command]
async fn move_items(sources: Vec<String>, dest: String) -> Result<Vec<(String, String)>> {
    blocking(move || ops::move_items(&sources, &dest).map_err(AppError::from)).await
}

#[tauri::command]
async fn move_items_with_strategy(
    sources: Vec<String>,
    dest: String,
    strategy: ops::ConflictStrategy,
) -> Result<Vec<(String, String)>> {
    blocking(move || ops::move_items_with_strategy(&sources, &dest, strategy).map_err(AppError::from))
        .await
}

#[tauri::command]
fn check_conflicts(sources: Vec<String>, dest: String) -> Vec<ops::ConflictInfo> {
    ops::check_conflicts(&sources, &dest)
}

#[tauri::command]
async fn delete_to_trash(paths: Vec<String>) -> Result<()> {
    blocking(move || ops::delete_to_trash(&paths).map_err(AppError::from)).await
}

#[tauri::command]
async fn delete_to_trash_undoable(paths: Vec<String>) -> Result<Vec<String>> {
    blocking(move || ops::delete_to_trash_undoable(&paths).map_err(AppError::from)).await
}

#[tauri::command]
async fn restore_from_trash(paths: Vec<String>) -> Result<()> {
    blocking(move || ops::restore_from_trash(&paths).map_err(AppError::from)).await
}

#[tauri::command]
async fn delete_permanent(paths: Vec<String>) -> Result<()> {
    blocking(move || ops::delete_permanent(&paths).map_err(AppError::from)).await
}

#[tauri::command]
fn special_folders() -> Vec<special::SpecialFolder> {
    special::special_folders()
}

#[tauri::command]
fn list_drives() -> Vec<special::Drive> {
    special::list_drives()
}

#[tauri::command]
fn get_special_folder(kind: String) -> Option<String> {
    special::get_special_folder(&kind)
}

#[tauri::command]
fn list_network() -> Vec<fs_ops::Entry> {
    network::list_network()
}

#[tauri::command]
fn list_gallery() -> Vec<fs_ops::Entry> {
    gallery::list_gallery()
}

#[tauri::command]
fn get_folder_view(path: String) -> Option<folder_views::FolderView> {
    folder_views::get_folder_view(&path)
}

#[tauri::command]
fn set_folder_view(
    path: String,
    view_mode: String,
    sort_field: String,
    sort_asc: bool,
    col_widths: folder_views::ColWidths,
) {
    folder_views::set_folder_view(&path, &view_mode, &sort_field, sort_asc, col_widths);
}

#[tauri::command]
fn watch_directory(
    app: tauri::AppHandle,
    window: tauri::Window,
    path: String,
    state: tauri::State<'_, watch::WatcherState>,
) {
    // Per-window watcher: keyed by the calling window's label so multi-window
    // navigation no longer replaces each other's watchers.
    watch::watch_directory(app, window.label(), path, &state);
}

#[tauri::command]
async fn get_thumbnail(path: String, size: u32) -> Option<String> {
    // Image decode is CPU+memory heavy; keep it off the main thread.
    tauri::async_runtime::spawn_blocking(move || thumbnails::get_thumbnail(&path, size))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
async fn get_icon(path: String, size: u32) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || thumbnails::get_icon(&path, size))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
fn show_classic_menu(paths: Vec<String>, x: i32, y: i32) -> Result<()> {
    shell_menu::show_classic_context_menu(&paths, x, y)
        .map_err(|e| AppError::Unknown(e))
}

#[tauri::command]
fn get_open_with(path: String) -> open_with::OpenWithInfo {
    open_with::get_open_with(&path)
}

#[tauri::command]
fn open_with_path(path: String, exe: String) -> Result<()> {
    open_with::open_with_path(&path, &exe)
}

#[tauri::command]
fn open_with_dialog(path: String) -> Result<()> {
    open_with::open_with_dialog(&path)
}

#[tauri::command]
fn open_file(path: String) -> Result<()> {
    open_with::open_file(&path)
}

#[tauri::command]
async fn create_archive(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest_zip: String,
) -> Result<()> {
    // Compress `sources` into `dest_zip`, emitting "fs-zip-progress"
    // {current,total,file} per file so the frontend can drive a progress
    // dialog. Runs on a blocking thread so progress events are delivered
    // promptly; `cancel_zip` sets a flag checked between top-level sources.
    blocking(move || {
        zip::reset_zip_cancel();
        zip::zip_items_tracked(
            &sources,
            &dest_zip,
            zip::is_zip_cancelled,
            |current, total, path| {
                let file = path
                    .file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_default();
                let _ = app.emit("fs-zip-progress", CopyProgress { current, total, file });
            },
        )
        .map_err(AppError::from)
    })
    .await
}

#[tauri::command]
async fn extract_archive(
    app: tauri::AppHandle,
    zip_path: String,
    dest_dir: String,
) -> Result<usize> {
    // Extract `zip_path` into `dest_dir`, emitting per-file progress. Returns
    // the number of files written. Skips Zip-Slip entries and enforces the
    // decompressed-size quota (handled in zip.rs).
    blocking(move || {
        zip::reset_zip_cancel();
        zip::unzip_items_tracked(
            &zip_path,
            &dest_dir,
            zip::is_zip_cancelled,
            |current, total, path| {
                let file = path
                    .file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_default();
                let _ = app.emit("fs-zip-progress", CopyProgress { current, total, file });
            },
        )
        .map_err(AppError::from)
    })
    .await
}

#[tauri::command]
fn cancel_zip() {
    zip::request_zip_cancel();
}

#[tauri::command]
fn get_autostart() -> bool {
    autostart::is_autostart_enabled()
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<()> {
    autostart::set_autostart(enabled)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    crashlog::install_crash_logger();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(watch::WatcherState::new())
        .invoke_handler(tauri::generate_handler![
            list_directory,
            search,
            suggest_paths,
            capture_dom_png,
            get_properties,
            special_folders,
            list_drives,
            get_special_folder,
            list_network,
            list_gallery,
            get_folder_view,
            set_folder_view,
            create_dir,
            create_file,
            create_typed_file,
            unique_target,
            open_in_terminal,
            rename,
            copy_items,
            copy_items_with_strategy,
            copy_with_progress,
            cancel_copy,
            move_items,
            move_items_with_strategy,
            move_with_progress,
            check_conflicts,
            delete_to_trash,
            delete_to_trash_undoable,
            restore_from_trash,
            delete_permanent,
            watch_directory,
            get_thumbnail,
            get_icon,
            show_classic_menu,
            get_open_with,
            open_with_path,
            open_with_dialog,
            open_file,
            create_archive,
            extract_archive,
            cancel_zip,
            get_autostart,
            set_autostart,
            crashlog::log_frontend_error,
            crashlog::open_logs_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod ops_perf;

#[cfg(test)]
mod thumbnails_perf;
