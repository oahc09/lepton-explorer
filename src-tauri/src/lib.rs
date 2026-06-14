pub mod error;
pub mod fs_ops;
pub mod ops;
pub mod special;
pub mod thumbnails;
pub mod watch;

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

#[tauri::command]
fn list_directory(dir: String) -> Result<Vec<fs_ops::Entry>> {
    fs_ops::list_directory(&dir).map_err(AppError::from)
}

#[tauri::command]
fn search(root: String, query: String) -> Result<Vec<fs_ops::Entry>> {
    fs_ops::search(&root, &query).map_err(AppError::from)
}

#[tauri::command]
fn suggest_paths(prefix: String) -> Vec<fs_ops::PathSuggestion> {
    fs_ops::suggest_paths(&prefix)
}

#[tauri::command]
fn get_properties(path: String) -> Result<u64> {
    fs_ops::folder_size(&path).map_err(AppError::from)
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
fn rename(from: String, to: String) -> Result<()> {
    ops::rename(&from, &to).map_err(AppError::from)
}

#[tauri::command]
fn copy_items(sources: Vec<String>, dest: String) -> Result<Vec<String>> {
    ops::copy_items(&sources, &dest).map_err(AppError::from)
}

#[tauri::command]
fn copy_items_with_strategy(
    sources: Vec<String>,
    dest: String,
    strategy: ops::ConflictStrategy,
) -> Result<Vec<String>> {
    ops::copy_items_with_strategy(&sources, &dest, strategy).map_err(AppError::from)
}

#[tauri::command]
fn copy_with_progress(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest: String,
    strategy: ops::ConflictStrategy,
) -> Result<Vec<String>> {
    // Copy file-by-file, emitting "fs-copy-progress" {current,total,file} per file
    // so the frontend can render a progress dialog. Runs on a background thread.
    // `cancel_copy` sets a flag checked between top-level sources.
    ops::reset_copy_cancel();
    ops::copy_items_tracked(&sources, &dest, strategy, ops::is_copy_cancelled, |current, total, path| {
        let file = path
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_default();
        let _ = app.emit("fs-copy-progress", CopyProgress { current, total, file });
    })
    .map_err(AppError::from)
}

#[tauri::command]
fn cancel_copy() {
    ops::request_copy_cancel();
}

#[tauri::command]
fn move_with_progress(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest: String,
    strategy: ops::ConflictStrategy,
) -> Result<Vec<(String, String)>> {
    // Same-volume moves are instant renames; cross-volume moves copy+delete and
    // emit per-file progress. Reuses the copy progress event + cancel flag.
    ops::reset_copy_cancel();
    ops::move_items_tracked(&sources, &dest, strategy, ops::is_copy_cancelled, |current, total, path| {
        let file = path
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_default();
        let _ = app.emit("fs-copy-progress", CopyProgress { current, total, file });
    })
    .map_err(AppError::from)
}

#[tauri::command]
fn move_items(sources: Vec<String>, dest: String) -> Result<Vec<(String, String)>> {
    ops::move_items(&sources, &dest).map_err(AppError::from)
}

#[tauri::command]
fn move_items_with_strategy(
    sources: Vec<String>,
    dest: String,
    strategy: ops::ConflictStrategy,
) -> Result<Vec<(String, String)>> {
    ops::move_items_with_strategy(&sources, &dest, strategy).map_err(AppError::from)
}

#[tauri::command]
fn check_conflicts(sources: Vec<String>, dest: String) -> Vec<ops::ConflictInfo> {
    ops::check_conflicts(&sources, &dest)
}

#[tauri::command]
fn delete_to_trash(paths: Vec<String>) -> Result<()> {
    ops::delete_to_trash(&paths).map_err(AppError::from)
}

#[tauri::command]
fn delete_permanent(paths: Vec<String>) -> Result<()> {
    ops::delete_permanent(&paths).map_err(AppError::from)
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
fn watch_directory(app: tauri::AppHandle, path: String, state: tauri::State<'_, watch::WatcherState>) {
    watch::watch_directory(app, path, &state);
}

#[tauri::command]
fn get_thumbnail(path: String, size: u32) -> Option<String> {
    thumbnails::get_thumbnail(&path, size)
}

#[tauri::command]
fn get_icon(path: String, size: u32) -> Option<String> {
    thumbnails::get_icon(&path, size)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(watch::WatcherState::new())
        .invoke_handler(tauri::generate_handler![
            list_directory,
            search,
            suggest_paths,
            get_properties,
            special_folders,
            list_drives,
            create_dir,
            create_file,
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
            delete_permanent,
            watch_directory,
            get_thumbnail,
            get_icon
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
