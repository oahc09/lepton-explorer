use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct WatcherState(pub Mutex<Option<RecommendedWatcher>>);

impl WatcherState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

/// Watch `path`. Replaces any previous watcher (dropping it stops its events).
/// Emits `fs-changed` with the watched path as payload on each change.
pub fn watch_directory(app: AppHandle, path: String, state: &WatcherState) {
    let app_handle = app.clone();
    let watched = path.clone();
    let mut watcher: RecommendedWatcher = match Watcher::new(
        move |_res: notify::Result<notify::Event>| {
            // notify invokes this on its own thread; emit directly. Rapid events
            // may emit multiple times; the frontend coalesces via refreshKey bumps.
            let _ = app_handle.emit("fs-changed", watched.clone());
        },
        Config::default(),
    ) {
        Ok(w) => w,
        Err(_) => return,
    };
    let _ = watcher.watch(Path::new(&path), RecursiveMode::NonRecursive);
    // Replace the previous watcher (dropped here → its callback thread stops).
    if let Ok(mut g) = state.0.lock() {
        *g = Some(watcher);
    }
}
