//! Per-folder view settings persistence (view mode / sort / column widths).
//!
//! Windows Explorer remembers how you looked at each folder individually. We mirror
//! that: a HashMap keyed by absolute path, persisted as JSON under the app-data dir
//! so settings survive restarts. The frontend calls `get_folder_view` when it
//! navigates to a folder and `set_folder_view` whenever the user changes a view.

use std::collections::HashMap;
use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ColWidths {
    pub name: u32,
    pub date: u32,
    #[serde(rename = "type")]
    pub type_: u32,
    pub size: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderView {
    pub view_mode: String,
    pub sort_field: String,
    pub sort_asc: bool,
    pub col_widths: ColWidths,
}

type Store = HashMap<String, FolderView>;

static STATE: Lazy<Mutex<Store>> = Lazy::new(|| Mutex::new(load()));

fn config_path() -> Option<std::path::PathBuf> {
    let base = dirs::data_dir()?;
    Some(base.join("WinFinder").join("folder_views.json"))
}

fn load() -> Store {
    if let Some(p) = config_path() {
        if let Ok(s) = std::fs::read_to_string(&p) {
            if let Ok(v) = serde_json::from_str::<Store>(&s) {
                return v;
            }
        }
    }
    Store::new()
}

fn save(store: &Store) {
    if let Some(p) = config_path() {
        if let Some(parent) = p.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(s) = serde_json::to_string_pretty(store) {
            let _ = std::fs::write(&p, s);
        }
    }
}

pub fn get_folder_view(path: &str) -> Option<FolderView> {
    STATE.lock().ok()?.get(path).cloned()
}

pub fn set_folder_view(
    path: &str,
    view_mode: &str,
    sort_field: &str,
    sort_asc: bool,
    col_widths: ColWidths,
) {
    let mut store = match STATE.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    store.insert(
        path.to_string(),
        FolderView {
            view_mode: view_mode.to_string(),
            sort_field: sort_field.to_string(),
            sort_asc,
            col_widths,
        },
    );
    let snapshot = store.clone();
    drop(store);
    save(&snapshot);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_then_get_roundtrips() {
        let path = "C:\\__winfinder_test_folder__";
        let cw = ColWidths { name: 320, date: 170, type_: 150, size: 120 };
        set_folder_view(path, "tiles", "modified", false, cw);
        let fv = get_folder_view(path).expect("should exist after set");
        assert_eq!(fv.view_mode, "tiles");
        assert_eq!(fv.sort_field, "modified");
        assert!(!fv.sort_asc);
        assert_eq!(fv.col_widths.type_, 150);
    }

    #[test]
    fn unknown_path_returns_none() {
        assert!(get_folder_view("C:\\__no_such_saved_folder__").is_none());
    }
}
