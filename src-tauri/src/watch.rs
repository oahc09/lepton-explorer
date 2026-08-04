use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// Per-window directory watchers, keyed by window label. Multi-window: each
/// WebviewWindow gets its own watcher so navigating in one window no longer
/// stops change events for another.
pub struct WatcherState(pub Mutex<HashMap<String, RecommendedWatcher>>);

impl WatcherState {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

/// Coalesce bursts of raw notify events into a single `fs-changed` emit after
/// this quiet window (extracting a 200-file zip then yields ~1 refresh, not 200).
const DEBOUNCE_MS: u64 = 250;

/// Watch `path` on behalf of window `label`, replacing that window's previous
/// watcher (dropping it stops its events and ends its debounce thread).
/// Emits `fs-changed` with the watched path as payload, debounced.
pub fn watch_directory(app: AppHandle, label: &str, path: String, state: &WatcherState) {
    // Raw events go into a channel; a debounce thread coalesces bursts and
    // emits once the stream goes quiet for DEBOUNCE_MS.
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    let mut watcher: RecommendedWatcher = match Watcher::new(
        move |_res: notify::Result<notify::Event>| {
            let _ = tx.send(());
        },
        Config::default(),
    ) {
        Ok(w) => w,
        Err(_) => return,
    };
    let _ = watcher.watch(Path::new(&path), RecursiveMode::NonRecursive);

    let watched = path.clone();
    let app_handle = app.clone();
    std::thread::spawn(move || {
        // When the watcher (and thus `tx`) is dropped, `recv` errors and the
        // thread exits — no leak on re-navigation or window close.
        while rx.recv().is_ok() {
            // Drain until the burst goes quiet for DEBOUNCE_MS.
            loop {
                match rx.recv_timeout(std::time::Duration::from_millis(DEBOUNCE_MS)) {
                    Ok(()) => continue,
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => break,
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }
            let _ = app_handle.emit("fs-changed", watched.clone());
        }
    });

    // Replace only THIS window's previous watcher.
    if let Ok(mut g) = state.0.lock() {
        g.insert(label.to_string(), watcher);
    }
}
