pub mod error;
pub mod fs_ops;
pub mod ops;
pub mod special;

use error::{AppError, Result};

#[tauri::command]
fn list_directory(dir: String) -> Result<Vec<fs_ops::Entry>> {
    fs_ops::list_directory(&dir).map_err(AppError::from)
}

#[tauri::command]
fn special_folders() -> Vec<special::SpecialFolder> {
    special::special_folders()
}

#[tauri::command]
fn list_drives() -> Vec<special::Drive> {
    special::list_drives()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_directory,
            special_folders,
            list_drives
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
