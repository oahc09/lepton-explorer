use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[allow(dead_code)]
pub struct WatcherState(pub Mutex<()>);

impl WatcherState {
    pub fn new() -> Self {
        Self(Mutex::new(()))
    }
}

/// Spawn a watcher thread for `path`. Emits `fs-changed` with the watched path as payload,
/// debounced (~300ms of quiet). Each call spawns a fresh watcher; the frontend filters events
/// whose payload path != the current path, so stale watchers are harmless.
pub fn watch_directory(app: AppHandle, path: String) {
    let app_handle = app.clone();
    let watched = path.clone();
    thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher: RecommendedWatcher = match Watcher::new(
            move |res: notify::Result<notify::Event>| {
                let _ = tx.send(res);
            },
            Config::default(),
        ) {
            Ok(w) => w,
            Err(_) => return,
        };
        if watcher
            .watch(std::path::Path::new(&watched), RecursiveMode::NonRecursive)
            .is_err()
        {
            return;
        }
        let mut last: Option<Instant> = None;
        loop {
            match rx.recv_timeout(Duration::from_millis(150)) {
                Ok(_) => last = Some(Instant::now()),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if let Some(t) = last {
                        if t.elapsed() >= Duration::from_millis(150) {
                            let _ = app_handle.emit("fs-changed", watched.clone());
                            last = None;
                        }
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        // `watcher` dropped here → stops watching for this path.
    });
}
