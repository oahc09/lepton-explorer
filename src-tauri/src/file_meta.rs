//! Per-file user metadata (color coding, status icon, star rating, text tags,
//! description). Keyed by absolute path and persisted as JSON under the app-data
//! dir, mirroring `folder_views.rs`. Path-keyed metadata is moved on rename/move
//! via `migrate_file_meta`.

use std::collections::HashMap;
use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileMeta {
    /// Color-coding key (e.g. "red", "green", …) — mirrors the old 7-color tag.
    pub color: Option<String>,
    /// Status icon key (e.g. "todo", "in-progress", "done", …).
    pub status: Option<String>,
    /// Star rating 0–5 (0 = unrated).
    pub rating: u8,
    /// Free-form text tags.
    pub tags: Vec<String>,
    /// Free-form description.
    pub description: String,
}

type Store = HashMap<String, FileMeta>;

static STATE: Lazy<Mutex<Store>> = Lazy::new(|| Mutex::new(load()));

fn config_path() -> Option<std::path::PathBuf> {
    let base = dirs::data_dir()?;
    Some(base.join("Lepton Explorer").join("metadata.json"))
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

pub fn get_file_meta(path: &str) -> Option<FileMeta> {
    STATE.lock().ok()?.get(path).cloned()
}

/// Bulk lookup for a set of paths (used by the frontend to warm its cache when
/// entering a folder).
pub fn list_file_meta(paths: &[String]) -> HashMap<String, FileMeta> {
    let store = match STATE.lock() {
        Ok(g) => g,
        Err(_) => return HashMap::new(),
    };
    paths
        .iter()
        .filter_map(|p| store.get(p).cloned().map(|m| (p.clone(), m)))
        .collect()
}

/// Insert or update metadata for `path`. Empty metadata is dropped entirely so
/// the store does not accumulate no-op entries.
pub fn set_file_meta(path: &str, meta: FileMeta) {
    let mut store = match STATE.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if is_empty(&meta) {
        store.remove(path);
    } else {
        store.insert(path.to_string(), meta);
    }
    let snapshot = store.clone();
    drop(store);
    save(&snapshot);
}

/// Move metadata from `from` to `to` (rename/move). No-op when they are equal.
pub fn migrate_file_meta(from: &str, to: &str) {
    if from == to {
        return;
    }
    let mut store = match STATE.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if let Some(meta) = store.remove(from) {
        store.insert(to.to_string(), meta);
    }
    let snapshot = store.clone();
    drop(store);
    save(&snapshot);
}

fn is_empty(meta: &FileMeta) -> bool {
    meta.color.is_none()
        && meta.status.is_none()
        && meta.rating == 0
        && meta.tags.is_empty()
        && meta.description.is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_then_get_roundtrips() {
        let path = "C:\\__lepton_meta_test__";
        set_file_meta(
            path,
            FileMeta {
                color: Some("red".into()),
                status: Some("done".into()),
                rating: 4,
                tags: vec!["工作".into()],
                description: "测试描述".into(),
            },
        );
        let m = get_file_meta(path).expect("should exist after set");
        assert_eq!(m.color.as_deref(), Some("red"));
        assert_eq!(m.rating, 4);
        assert_eq!(m.tags, vec!["工作"]);
    }

    #[test]
    fn migrate_moves_metadata() {
        let from = "C:\\__lepton_meta_from__";
        let to = "C:\\__lepton_meta_to__";
        set_file_meta(from, FileMeta { color: Some("blue".into()), ..Default::default() });
        migrate_file_meta(from, to);
        assert!(get_file_meta(from).is_none());
        assert_eq!(get_file_meta(to).unwrap().color.as_deref(), Some("blue"));
    }

    #[test]
    fn empty_meta_is_dropped() {
        let path = "C:\\__lepton_meta_empty__";
        set_file_meta(path, FileMeta::default());
        assert!(get_file_meta(path).is_none());
    }
}
