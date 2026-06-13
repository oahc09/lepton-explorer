pub mod error;
pub mod fs_ops;
pub mod ops;
pub mod special;
pub mod thumbnails;
pub mod watch;

use error::{AppError, Result};

#[tauri::command]
fn list_directory(dir: String) -> Result<Vec<fs_ops::Entry>> {
    fs_ops::list_directory(&dir).map_err(AppError::from)
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
fn move_items(sources: Vec<String>, dest: String) -> Result<Vec<(String, String)>> {
    ops::move_items(&sources, &dest).map_err(AppError::from)
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
fn watch_directory(app: tauri::AppHandle, path: String) {
    watch::watch_directory(app, path);
}

#[tauri::command]
fn get_thumbnail(path: String, size: u32) -> Option<String> {
    thumbnails::get_thumbnail(&path, size)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(watch::WatcherState::new())
        .invoke_handler(tauri::generate_handler![
            list_directory,
            special_folders,
            list_drives,
            create_dir,
            create_file,
            rename,
            copy_items,
            move_items,
            delete_to_trash,
            delete_permanent,
            watch_directory,
            get_thumbnail
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
