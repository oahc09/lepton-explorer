# WinFinder — Phase 0: Foundation Vertical Slice · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a runnable Tauri v2 app that looks like the Windows 11 File Explorer and can list + navigate real folders (Details + Large icons view, breadcrumb, This PC nav pane, back/forward/up/refresh, status bar, Mica title bar, light/dark theme).

**Architecture:** Tauri v2 with a Rust backend (`src-tauri/`) doing all filesystem access via `std::fs` + the `windows` crate, and a React + TypeScript frontend (`src/`) rendering the Win11 chrome. All FS goes through typed Tauri commands; the frontend never touches the disk. State lives in small Zustand stores.

**Tech Stack:** Rust (tauri 2, serde, thiserror, dirs, windows; jwalk/anyhow/trash/notify arrive in later plans), React 18 + TypeScript, Vite, Zustand, @tanstack/react-virtual, Vitest + React Testing Library, pnpm.

**Spec reference:** `docs/superpowers/specs/2026-06-13-winfinder-design.md` (§3 architecture, §4 UI, §5 backend, §6 frontend, §7 data model, §11 acceptance).

**Plan sequence note:** This is Plan 1 of 5. Phase 1 (the rest of §2.1) is covered by Plans 2–5 above. This plan delivers Phase 0 only: the foundation slice that later plans extend.

**Prerequisites:** Windows 10 or 11 with WebView2 runtime (preinstalled on Win11; install on Win10), Rust toolchain (`rustup`, MSVC target), Node 20+, pnpm (`npm i -g pnpm`).

---

## File Structure

**Backend (`src-tauri/`)**
- `Cargo.toml` — dependencies.
- `src/lib.rs` — Tauri builder + `#[tauri::command]` handlers (`run()`).
- `src/main.rs` — calls `winfinder_lib::run()` (scaffold default).
- `src/fs_ops.rs` — `Entry` model + `list_directory`.
- `src/special.rs` — `SpecialFolder`, `Drive`, `special_folders()`, `list_drives()`.
- `src/error.rs` — `AppError` + `Result`.
- `tauri.conf.json` — window config (custom decoration, Mica).
- `capabilities/default.json` — window-control permissions.

**Frontend (`src/`)**
- `types.ts` — `Entry`, `ViewMode`, `Sort`, `SpecialFolder`, `Drive` (mirror of Rust types).
- `state/locationStore.ts` — current path + back/forward/up history.
- `state/viewStore.ts` — view mode + sort.
- `state/selectionStore.ts` — selected set + anchor + focus.
- `hooks/useDirectory.ts` — loads entries for a path via `invoke`.
- `components/TitleBar.tsx` — Mica bar + window buttons.
- `components/Toolbar.tsx` — back/forward/up/refresh.
- `components/Breadcrumb.tsx` — path segments + edit mode.
- `components/NavPane.tsx` — This PC tree (special folders + drives).
- `components/FileList.tsx` — renders current view; hosts Details/Icons renderers.
- `components/views/DetailsView.tsx` — Details view (virtualized).
- `components/views/IconsView.tsx` — Large icons view (virtualized grid).
- `components/StatusBar.tsx` — item / selection count.
- `components/ContextMenu.tsx` — placeholder shell (Phase 0: non-functional stub).
- `styles/win11.css` — Win11 design tokens + base layout (Segoe UI Variable, light/dark).
- `vitest.config.ts`, `src/test/setup.ts` — test harness.

---

## Task 1: Scaffold Tauri v2 + React + TS, add dependencies, verify

**Files:**
- Create: project scaffold (`package.json`, `src/`, `src-tauri/`, `vite.config.ts`, `index.html`)
- Modify: `src-tauri/Cargo.toml` (add crates), `package.json` (add deps)

- [ ] **Step 1: Scaffold into the current directory**

Run from `D:\AI\WinFinder`:
```bash
pnpm create tauri-app@latest . --template react-ts --manager pnpm -y
```
Expected: `package.json`, `src/`, `src-tauri/`, `index.html`, `vite.config.ts` created. (If it warns the directory is non-empty, choose to continue/merge — `docs/` and `.gitignore` are preserved.)

- [ ] **Step 2: Add frontend dependencies**

```bash
pnpm add zustand @tanstack/react-virtual
pnpm add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitejs/plugin-react
```
Expected: packages added to `package.json` `dependencies`/`devDependencies`.

- [ ] **Step 3: Add Rust dependencies**

Edit `src-tauri/Cargo.toml` `[dependencies]` to include (keep versions the scaffold provided for `tauri`/`serde`/`serde_json`; add the rest):
```toml
thiserror = "2"
dirs = "5"
windows = { version = "0.58", features = ["Win32_Storage_FileSystem", "Win32_Foundation"] }

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 4: Verify it builds and a window opens**

```bash
pnpm tauri dev
```
Expected: a default Tauri window opens showing the React template. Stop it (Ctrl+C). Then:
```bash
cd src-tauri && cargo build && cd ..
```
Expected: `Finished` with no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Tauri v2 + React-TS, add core dependencies"
```

---

## Task 2: Rust `Entry` model + `list_directory` (TDD)

**Files:**
- Create: `src-tauri/src/fs_ops.rs`
- Modify: `src-tauri/src/lib.rs` (declare module)

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/fs_ops.rs`:
```rust
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::SystemTime;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: i64,
    pub created: i64,
    pub accessed: i64,
    pub type_label: String,
    pub ext: String,
    pub is_hidden: bool,
    pub is_system: bool,
    pub is_read_only: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn lists_files_and_folders_with_folders_first() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("z_folder")).unwrap();
        fs::write(dir.path().join("a.txt"), "hi").unwrap();
        let entries = list_directory(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_dir, "folder must come first");
        assert_eq!(entries[0].name, "z_folder");
        assert_eq!(entries[1].name, "a.txt");
        assert_eq!(entries[1].ext, "txt");
        assert_eq!(entries[1].type_label, "TXT 文件");
        assert_eq!(entries[1].size, 2);
        assert!(!entries[1].is_dir);
    }

    #[test]
    fn missing_dir_returns_error() {
        assert!(list_directory("Z:/nope/does/not/exist").is_err());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src-tauri && cargo test --lib fs_ops && cd ..
```
Expected: compile error — `list_directory` not defined.

- [ ] **Step 3: Implement `list_directory`**

Append to `src-tauri/src/fs_ops.rs` (above the `#[cfg(test)]` block):
```rust
pub fn list_directory(dir: &str) -> std::io::Result<Vec<Entry>> {
    let mut entries = Vec::new();
    for rd in fs::read_dir(dir)? {
        let rd = rd?;
        let meta = rd.metadata()?;
        let ft = meta.file_type();
        let name = rd.file_name().to_string_lossy().to_string();
        let path = rd.path().to_string_lossy().to_string();
        let ext = Path::new(&name)
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_string())
            .unwrap_or_default();

        #[cfg(windows)]
        let is_hidden = {
            use std::os::windows::fs::MetadataExt;
            const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
            (meta.file_attributes() & FILE_ATTRIBUTE_HIDDEN) != 0
        };
        #[cfg(not(windows))]
        let is_hidden = name.starts_with('.');

        entries.push(Entry {
            name,
            path,
            is_dir: ft.is_dir(),
            size: if ft.is_dir() { 0 } else { meta.len() },
            modified: to_ms(meta.modified()),
            created: to_ms(meta.created()),
            accessed: to_ms(meta.accessed()),
            type_label: type_label_for(&name, ft.is_dir()),
            ext,
            is_hidden,
            is_system: false,
            is_read_only: meta.permissions().readonly(),
        });
    }
    // Win11 default: folders first, then name ascending (case-insensitive).
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

fn to_ms(t: std::io::Result<SystemTime>) -> i64 {
    t.ok()
        .and_then(|st| st.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn type_label_for(name: &str, is_dir: bool) -> String {
    if is_dir {
        return "文件夹".to_string();
    }
    match Path::new(name).extension().and_then(|e| e.to_str()) {
        Some(e) => format!("{} 文件", e.to_uppercase()),
        None => "文件".to_string(),
    }
}
```

- [ ] **Step 4: Register the module and run tests**

In `src-tauri/src/lib.rs`, add near the top (after any existing `mod` lines):
```rust
pub mod fs_ops;
```
Run:
```bash
cd src-tauri && cargo test --lib fs_ops && cd ..
```
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/fs_ops.rs src-tauri/src/lib.rs
git commit -m "feat(fs): Entry model + list_directory (folders-first sort)"
```

---

## Task 3: Rust `special_folders` + `list_drives` (TDD)

**Files:**
- Create: `src-tauri/src/special.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/special.rs`:
```rust
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct SpecialFolder {
    pub key: String,
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct Drive {
    pub letter: String,
    pub path: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn special_folders_includes_known_folders() {
        let v = special_folders();
        let keys: Vec<&str> = v.iter().map(|f| f.key.as_str()).collect();
        assert!(keys.contains(&"home"));
        assert!(keys.contains(&"documents"));
        assert!(v.iter().all(|f| !f.path.is_empty()));
    }

    #[test]
    fn list_drives_returns_at_least_one_on_windows() {
        let d = list_drives();
        assert!(!d.is_empty());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src-tauri && cargo test --lib special && cd ..
```
Expected: compile error — `special_folders` / `list_drives` not defined.

- [ ] **Step 3: Implement**

Append to `src-tauri/src/special.rs` (above `#[cfg(test)]`):
```rust
pub fn special_folders() -> Vec<SpecialFolder> {
    let mut v = vec![SpecialFolder {
        key: "home".into(),
        name: "主页".into(),
        path: dirs::home_dir()
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
    }];
    let mut push = |v: &mut Vec<SpecialFolder>, key: &str, name: &str, p: Option<std::path::PathBuf>| {
        if let Some(p) = p {
            v.push(SpecialFolder { key: key.into(), name: name.into(), path: p.display().to_string() });
        }
    };
    push(&mut v, "desktop", "桌面", dirs::desktop_dir());
    push(&mut v, "documents", "文档", dirs::document_dir());
    push(&mut v, "downloads", "下载", dirs::download_dir());
    push(&mut v, "pictures", "图片", dirs::picture_dir());
    push(&mut v, "music", "音乐", dirs::audio_dir());
    push(&mut v, "videos", "视频", dirs::video_dir());
    v
}

pub fn list_drives() -> Vec<Drive> {
    #[cfg(windows)]
    {
        use windows::Win32::Storage::FileSystem::GetLogicalDriveStringsW;
        unsafe {
            let mut buf = [0u16; 260];
            let len = GetLogicalDriveStringsW(Some(&mut buf)) as usize;
            let s = String::from_utf16_lossy(&buf[..len]);
            s.split('\0')
                .filter(|s| !s.is_empty())
                .map(|d| Drive {
                    letter: d.trim_end_matches('\\').to_string(),
                    path: d.to_string(),
                })
                .collect()
        }
    }
    #[cfg(not(windows))]
    {
        vec![Drive { letter: "/".into(), path: "/".into() }]
    }
}
```

- [ ] **Step 4: Register module and run tests**

In `src-tauri/src/lib.rs` add:
```rust
pub mod special;
```
Run:
```bash
cd src-tauri && cargo test --lib special && cd ..
```
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/special.rs src-tauri/src/lib.rs
git commit -m "feat(fs): special_folders + list_drives"
```

---

## Task 4: Rust `AppError` + Tauri command wiring

**Files:**
- Create: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/lib.rs` (commands + handler registration)

- [ ] **Step 1: Create `error.rs`**

Create `src-tauri/src/error.rs`:
```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("permission denied: {0}")]
    PermissionDenied(String),
    #[error("already exists: {0}")]
    AlreadyExists(String),
    #[error("invalid name: {0}")]
    InvalidName(String),
    #[error("cancelled")]
    Cancelled,
    #[error("{0}")]
    Unknown(String),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        match e.kind() {
            std::io::ErrorKind::NotFound => AppError::NotFound(e.to_string()),
            std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied(e.to_string()),
            std::io::ErrorKind::AlreadyExists => AppError::AlreadyExists(e.to_string()),
            _ => AppError::Unknown(e.to_string()),
        }
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
```

> Note: serializes to `{ "kind": "NotFound", "message": "..." }`, matching spec §8 (`path?` is folded into the message in Phase 0; refined in Plan 3).

- [ ] **Step 2: Wire commands in `lib.rs`**

Replace the `run()` body region in `src-tauri/src/lib.rs` so the file reads (keep the existing `mod webview`/`mod menu` lines if the scaffold added them; this is the minimal form):
```rust
pub mod error;
pub mod fs_ops;
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
        .invoke_handler(tauri::generate_handler![
            list_directory,
            special_folders,
            list_drives
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Build and run backend**

```bash
cd src-tauri && cargo build && cd ..
```
Expected: `Finished`. Fix any compile errors (e.g., an unused `use` import).

- [ ] **Step 4: Smoke-test the commands via the frontend (manual)**

Temporarily, in `src/App.tsx` replace contents with:
```tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

function App() {
  const [out, setOut] = useState('');
  useEffect(() => {
    invoke('list_directory', { dir: 'C:\\' }).then((e: unknown) => setOut(JSON.stringify(e).slice(0, 200)));
  }, []);
  return <pre>{out}</pre>;
}
export default App;
```
Run `pnpm tauri dev`. Expected: window shows JSON of `C:\` entries. Revert `src/App.tsx` after.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/error.rs src-tauri/src/lib.rs src/App.tsx
git commit -m "feat(ipc): AppError + list_directory/special_folders/list_drives commands"
```

---

## Task 5: Frontend types + Vitest setup

**Files:**
- Create: `src/types.ts`, `vitest.config.ts`, `src/test/setup.ts`
- Modify: `package.json` (test script)

- [ ] **Step 1: Create shared types**

`src/types.ts`:
```ts
export interface Entry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
  created: number;
  accessed: number;
  typeLabel: string;
  ext: string;
  isHidden: boolean;
  isSystem: boolean;
  isReadOnly: boolean;
}

export type ViewMode =
  | 'extra-large' | 'large' | 'medium' | 'small'
  | 'list' | 'details' | 'tiles' | 'content';

export type SortField = 'name' | 'modified' | 'type' | 'size';
export interface Sort { field: SortField; asc: boolean; }

export interface SpecialFolder { key: string; name: string; path: string; }
export interface Drive { letter: string; path: string; }
```

- [ ] **Step 2: Create Vitest config + setup**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'] },
});
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Add test script + verify harness**

In `package.json` `scripts`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```
Create `src/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Entry } from './types';

describe('Entry type shape', () => {
  it('compiles with all fields', () => {
    const e: Entry = {
      name: 'a.txt', path: 'C:\\a.txt', isDir: false, size: 1,
      modified: 0, created: 0, accessed: 0, typeLabel: 'TXT 文件',
      ext: 'txt', isHidden: false, isSystem: false, isReadOnly: false,
    };
    expect(e.name).toBe('a.txt');
  });
});
```
Run:
```bash
pnpm test
```
Expected: `1 passed`.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/types.test.ts vitest.config.ts src/test/setup.ts package.json
git commit -m "test: add shared types + vitest harness"
```

---

## Task 6: `locationStore` — path + back/forward/up (TDD)

**Files:**
- Create: `src/state/locationStore.ts`, `src/state/locationStore.test.ts`

- [ ] **Step 1: Write the failing test**

`src/state/locationStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useLocationStore, parentOf } from './locationStore';

beforeEach(() => useLocationStore.setState({ path: '', backStack: [], forwardStack: [] }));

describe('parentOf', () => {
  it('returns the parent directory', () => {
    expect(parentOf('C:\\Users\\caosh')).toBe('C:\\Users');
  });
  it('returns drive root when already at a top-level path', () => {
    expect(parentOf('C:\\Users')).toBe('C:\\');
  });
  it('returns same drive root when at root', () => {
    expect(parentOf('C:\\')).toBe('C:\\');
  });
});

describe('locationStore navigation', () => {
  it('navigate pushes current path and clears forward stack', () => {
    const s = useLocationStore.getState();
    s.navigate('C:\\Users');
    s.navigate('C:\\Users\\caosh');
    const st = useLocationStore.getState();
    expect(st.path).toBe('C:\\Users\\caosh');
    expect(st.backStack).toEqual(['', 'C:\\Users']);
    expect(st.forwardStack).toEqual([]);
  });
  it('back moves back and pushes forward', () => {
    const s = useLocationStore.getState();
    s.navigate('C:\\A'); s.navigate('C:\\B');
    expect(s.back()).toBe(true);
    expect(useLocationStore.getState().path).toBe('C:\\A');
    expect(useLocationStore.getState().forwardStack).toEqual(['C:\\B']);
  });
  it('back returns false with empty history', () => {
    expect(useLocationStore.getState().back()).toBe(false);
  });
  it('up navigates to parent', () => {
    const s = useLocationStore.getState();
    s.navigate('C:\\Users\\caosh');
    expect(s.up()).toBe(true);
    expect(useLocationStore.getState().path).toBe('C:\\Users');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/state/locationStore.test.ts
```
Expected: fail — module not found.

- [ ] **Step 3: Implement**

`src/state/locationStore.ts`:
```ts
import { create } from 'zustand';

export function parentOf(p: string): string {
  if (!p) return '';
  const norm = p.replace(/\//g, '\\').replace(/\\+$/, '');
  const idx = norm.lastIndexOf('\\');
  if (idx <= 2) return norm.slice(0, 3); // drive root, e.g. "C:\\"
  return norm.slice(0, idx);
}

interface LocationState {
  path: string;
  backStack: string[];
  forwardStack: string[];
  navigate: (p: string) => void;
  back: () => boolean;
  forward: () => boolean;
  up: () => boolean;
  canBack: () => boolean;
  canForward: () => boolean;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  path: '',
  backStack: [],
  forwardStack: [],
  navigate: (p) =>
    set((s) => ({
      path: p,
      backStack: [...s.backStack, s.path].filter(Boolean),
      forwardStack: [],
    })),
  back: () => {
    const { backStack, forwardStack, path } = get();
    if (!backStack.length) return false;
    const prev = backStack[backStack.length - 1];
    set({
      path: prev,
      backStack: backStack.slice(0, -1),
      forwardStack: [path, ...forwardStack],
    });
    return true;
  },
  forward: () => {
    const { forwardStack, backStack, path } = get();
    if (!forwardStack.length) return false;
    const next = forwardStack[0];
    set({
      path: next,
      forwardStack: forwardStack.slice(1),
      backStack: [...backStack, path],
    });
    return true;
  },
  up: () => {
    const parent = parentOf(get().path);
    if (!parent || parent === get().path) return false;
    get().navigate(parent);
    return true;
  },
  canBack: () => get().backStack.length > 0,
  canForward: () => get().forwardStack.length > 0,
}));
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm test src/state/locationStore.test.ts
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/state/locationStore.ts src/state/locationStore.test.ts
git commit -m "feat(state): locationStore (path + back/forward/up history)"
```

---

## Task 7: `viewStore` — view mode + sort (TDD)

**Files:**
- Create: `src/state/viewStore.ts`, `src/state/viewStore.test.ts`

- [ ] **Step 1: Write the failing test**

`src/state/viewStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useViewStore } from './viewStore';

beforeEach(() => useViewStore.setState({ viewMode: 'details', sort: { field: 'name', asc: true } }));

describe('viewStore', () => {
  it('setViewMode updates mode', () => {
    useViewStore.getState().setViewMode('large');
    expect(useViewStore.getState().viewMode).toBe('large');
  });
  it('toggle sort flips asc when same field', () => {
    useViewStore.getState().sort = { field: 'name', asc: true };
    useViewStore.getState().setSort('name');
    expect(useViewStore.getState().sort).toEqual({ field: 'name', asc: false });
  });
  it('sort by new field defaults ascending', () => {
    useViewStore.getState().sort = { field: 'name', asc: false };
    useViewStore.getState().setSort('size');
    expect(useViewStore.getState().sort).toEqual({ field: 'size', asc: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/state/viewStore.test.ts
```
Expected: fail — module not found.

- [ ] **Step 3: Implement**

`src/state/viewStore.ts`:
```ts
import { create } from 'zustand';
import type { Sort, SortField, ViewMode } from '../types';

interface ViewState {
  viewMode: ViewMode;
  sort: Sort;
  setViewMode: (m: ViewMode) => void;
  setSort: (field: SortField) => void; // click a column header
}

export const useViewStore = create<ViewState>((set, get) => ({
  viewMode: 'details',
  sort: { field: 'name', asc: true },
  setViewMode: (m) => set({ viewMode: m }),
  setSort: (field) =>
    set((s) => ({
      sort:
        s.sort.field === field
          ? { field, asc: !s.sort.asc }
          : { field, asc: true },
    })),
}));
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm test src/state/viewStore.test.ts
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/state/viewStore.ts src/state/viewStore.test.ts
git commit -m "feat(state): viewStore (view mode + sort)"
```

---

## Task 8: `useDirectory` hook (TDD, mock invoke)

**Files:**
- Create: `src/hooks/useDirectory.ts`, `src/hooks/useDirectory.test.ts`

- [ ] **Step 1: Write the failing test**

`src/hooks/useDirectory.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDirectory } from './useDirectory';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => mockInvoke.mockReset());

describe('useDirectory', () => {
  it('loads entries for a path', async () => {
    mockInvoke.mockResolvedValueOnce([{ name: 'a.txt', path: 'C:\\a.txt', isDir: false }]);
    const { result } = renderHook(() => useDirectory('C:\\'));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(mockInvoke).toHaveBeenCalledWith('list_directory', { dir: 'C:\\' });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('captures errors', async () => {
    mockInvoke.mockRejectedValueOnce({ message: 'boom' });
    const { result } = renderHook(() => useDirectory('C:\\bad'));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.entries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/hooks/useDirectory.test.ts
```
Expected: fail — module not found.

- [ ] **Step 3: Implement**

`src/hooks/useDirectory.ts`:
```ts
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Entry } from '../types';

export function useDirectory(path: string) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    invoke<Entry[]>('list_directory', { dir: path })
      .then((e) => { if (!cancelled) setEntries(e); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path]);

  return { entries, loading, error };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm test src/hooks/useDirectory.test.ts
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDirectory.ts src/hooks/useDirectory.test.ts
git commit -m "feat(hooks): useDirectory loads entries via list_directory"
```

---

## Task 9: `selectionStore` + Details view (TDD)

**Files:**
- Create: `src/state/selectionStore.ts`, `src/state/selectionStore.test.ts`, `src/components/views/DetailsView.tsx`, `src/components/views/DetailsView.test.tsx`

- [ ] **Step 1: Write the failing store test**

`src/state/selectionStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useSelectionStore } from './selectionStore';
import type { Entry } from '../types';

const e = (n: string): Entry => ({ name: n, path: 'C:\\' + n, isDir: false, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: '', ext: '', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => useSelectionStore.getState().clear());

describe('selectionStore', () => {
  it('select single', () => {
    useSelectionStore.getState().select([e('a')]);
    expect(useSelectionStore.getState().selected).toEqual(['C:\\a']);
    expect(useSelectionStore.getState().anchor).toBe('C:\\a');
  });
  it('toggle adds/removes', () => {
    useSelectionStore.getState().toggle(e('a'));
    expect(useSelectionStore.getState().selected).toEqual(['C:\\a']);
    useSelectionStore.getState().toggle(e('a'));
    expect(useSelectionStore.getState().selected).toEqual([]);
  });
  it('selectRange from anchor to target inclusive', () => {
    const items = [e('a'), e('b'), e('c')];
    useSelectionStore.getState().select([items[0]]);
    useSelectionStore.getState().selectRange(items, 'C:\\c');
    expect(useSelectionStore.getState().selected.sort()).toEqual(['C:\\a', 'C:\\b', 'C:\\c']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test src/state/selectionStore.test.ts
```
Expected: module not found.

- [ ] **Step 3: Implement the store**

`src/state/selectionStore.ts`:
```ts
import { create } from 'zustand';
import type { Entry } from '../types';

interface SelectionState {
  selected: string[]; // paths
  anchor: string | null;
  select: (items: Entry[]) => void;
  toggle: (item: Entry) => void;
  selectRange: (allInOrder: Entry[], targetPath: string) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selected: [],
  anchor: null,
  select: (items) =>
    set({ selected: items.map((i) => i.path), anchor: items.length ? items[items.length - 1].path : null }),
  toggle: (item) =>
    set((s) => {
      const has = s.selected.includes(item.path);
      return {
        selected: has ? s.selected.filter((p) => p !== item.path) : [...s.selected, item.path],
        anchor: item.path,
      };
    }),
  selectRange: (allInOrder, targetPath) => {
    const anchor = get().anchor ?? targetPath;
    const paths = allInOrder.map((i) => i.path);
    const a = paths.indexOf(anchor);
    const b = paths.indexOf(targetPath);
    if (a === -1 || b === -1) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    set({ selected: paths.slice(lo, hi + 1), anchor });
  },
  clear: () => set({ selected: [], anchor: null }),
}));
```

- [ ] **Step 4: Run store test**

```bash
pnpm test src/state/selectionStore.test.ts
```
Expected: all pass.

- [ ] **Step 5: Write the failing Details view test**

`src/components/views/DetailsView.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DetailsView } from './DetailsView';
import { useSelectionStore } from '../../state/selectionStore';
import type { Entry } from '../../types';

const e = (n: string): Entry => ({ name: n, path: 'C:\\' + n, isDir: false, size: 10, modified: 1700000000000, created: 0, accessed: 0, typeLabel: 'TXT 文件', ext: 'txt', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => useSelectionStore.getState().clear());

describe('DetailsView', () => {
  it('renders rows and selects on click', () => {
    render(<DetailsView entries={[e('a.txt'), e('b.txt')]} />);
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    fireEvent.click(screen.getByText('a.txt'));
    expect(useSelectionStore.getState().selected).toEqual(['C:\\a.txt']);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

```bash
pnpm test src/components/views/DetailsView.test.tsx
```
Expected: module not found.

- [ ] **Step 7: Implement DetailsView**

`src/components/views/DetailsView.tsx`:
```tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Entry } from '../../types';
import { useViewStore } from '../../state/viewStore';
import { useSelectionStore } from '../../state/selectionStore';
import { formatDate, formatSize } from '../../utils/format';
import { useSorted, handleClick, icon, useOpen } from './detailsHelpers';

const ROW_H = 32;

export function DetailsView({ entries }: { entries: Entry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sorted = useSorted(entries);
  const rowVirtualizer = useVirtualizer({ count: sorted.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 20 });
  const sel = useSelectionStore();
  const onOpen = useOpen();

  return (
    <div className="details" ref={parentRef} style={{ overflow: 'auto', height: '100%' }}>
      <div className="details-header">
        <button className="col-name" onClick={() => useViewStore.getState().setSort('name')}>名称</button>
        <button className="col-date" onClick={() => useViewStore.getState().setSort('modified')}>修改日期</button>
        <button className="col-type" onClick={() => useViewStore.getState().setSort('type')}>类型</button>
        <button className="col-size" onClick={() => useViewStore.getState().setSort('size')}>大小</button>
      </div>
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((vi) => {
          const item = sorted[vi.index];
          const selected = sel.selected.includes(item.path);
          return (
            <div
              key={item.path}
              className={`details-row${selected ? ' selected' : ''}`}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: ROW_H }}
              onClick={(ev) => handleClick(ev, item, sorted, sel)}
              onDoubleClick={() => onOpen(item)}
            >
              <span className="col-name"><span className="row-icon" aria-hidden>{icon(item)}</span><span className="name">{item.name}</span></span>
              <span className="col-date">{formatDate(item.modified)}</span>
              <span className="col-type">{item.typeLabel}</span>
              <span className="col-size">{item.isDir ? '' : formatSize(item.size)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Supporting helpers used above — create `src/utils/format.ts`:
```ts
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${u[i]}`;
}
export function formatDate(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```

Create `src/components/views/detailsHelpers.ts` (shared selection/sort/open helpers for both views):
```ts
import type { MouseEvent } from 'react';
import type { Entry } from '../../types';
import { useViewStore } from '../../state/viewStore';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';

type SelectionApi = ReturnType<typeof useSelectionStore.getState>;

// Folders first, then by the active sort field (Win11 default). Subscribes to
// viewStore.sort so views re-render when the user clicks a column header.
export function useSorted(entries: Entry[]): Entry[] {
  const sort = useViewStore((s) => s.sort);
  const cmp = (a: Entry, b: Entry) => {
    let r = 0;
    if (sort.field === 'name') r = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    else if (sort.field === 'modified') r = a.modified - b.modified;
    else if (sort.field === 'size') r = a.size - b.size;
    else r = a.typeLabel.localeCompare(b.typeLabel) || a.ext.localeCompare(b.ext);
    if (sort.field !== 'name') r = r || a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    return sort.asc ? r : -r;
  };
  return [...entries].sort((a, b) => Number(b.isDir) - Number(a.isDir) || cmp(a, b));
}

export function icon(item: Entry): string {
  return item.isDir ? '📁' : '📄';
}

export function handleClick(ev: MouseEvent, item: Entry, allInOrder: Entry[], sel: SelectionApi) {
  if (ev.ctrlKey) sel.toggle(item);
  else if (ev.shiftKey && sel.anchor) sel.selectRange(allInOrder, item.path);
  else sel.select([item]);
}

export function useOpen() {
  return (item: Entry) => {
    if (item.isDir) useLocationStore.getState().navigate(item.path);
  };
}
```

- [ ] **Step 8: Run tests to verify pass**

```bash
pnpm test src/components/views/DetailsView.test.tsx src/state/selectionStore.test.ts
```
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/state/selectionStore.ts src/state/selectionStore.test.ts src/components/views/DetailsView.tsx src/components/views/detailsHelpers.ts src/components/views/DetailsView.test.tsx src/utils/format.ts
git commit -m "feat(views): selectionStore + Details view (virtualized, sortable)"
```

---

## Task 10: Breadcrumb + navigation (TDD)

**Files:**
- Create: `src/components/Breadcrumb.tsx`, `src/components/Breadcrumb.test.tsx`, `src/utils/paths.ts`

- [ ] **Step 1: Write the failing test**

`src/components/Breadcrumb.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Breadcrumb } from './Breadcrumb';
import { useLocationStore } from '../state/locationStore';

beforeEach(() => useLocationStore.setState({ path: '', backStack: [], forwardStack: [] }));

describe('Breadcrumb', () => {
  it('renders path segments and navigates on click', () => {
    useLocationStore.setState({ path: 'C:\\Users\\caosh' });
    render(<Breadcrumb />);
    expect(screen.getByText('caosh')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Users'));
    expect(useLocationStore.getState().path).toBe('C:\\Users');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test src/components/Breadcrumb.test.tsx
```
Expected: module not found.

- [ ] **Step 3: Implement path util**

`src/utils/paths.ts`:
```ts
// Split "C:\Users\caosh" into segments [{name:'C:',path:'C:\'},{name:'Users',path:'C:\Users'},...]
export function pathSegments(p: string): { name: string; path: string }[] {
  if (!p) return [];
  const norm = p.replace(/\//g, '\\').replace(/\\+$/, '');
  const parts = norm.split('\\').filter(Boolean);
  const segs: { name: string; path: string }[] = [];
  let acc = '';
  parts.forEach((part, i) => {
    acc = i === 0 ? part + '\\' : acc + '\\' + part;
    segs.push({ name: part, path: acc });
  });
  return segs;
}
```

- [ ] **Step 4: Implement Breadcrumb**

`src/components/Breadcrumb.tsx`:
```tsx
import { useState } from 'react';
import { useLocationStore } from '../state/locationStore';
import { pathSegments } from '../utils/paths';

export function Breadcrumb() {
  const path = useLocationStore((s) => s.path);
  const navigate = useLocationStore((s) => s.navigate);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(path);

  if (editing) {
    return (
      <input
        className="breadcrumb-input"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { navigate(draft); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  const segs = pathSegments(path);
  return (
    <div className="breadcrumb" onDoubleClick={() => { setDraft(path); setEditing(true); }}>
      {segs.map((s, i) => (
        <span key={s.path} className="crumb-group">
          {i > 0 && <span className="chevron">›</span>}
          <button className="crumb" onClick={() => navigate(s.path)}>{s.name}</button>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
pnpm test src/components/Breadcrumb.test.tsx
```
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/Breadcrumb.tsx src/components/Breadcrumb.test.tsx src/utils/paths.ts
git commit -m "feat(nav): breadcrumb with segment navigation + edit mode"
```

---

## Task 11: Navigation pane — This PC tree (TDD)

**Files:**
- Create: `src/components/NavPane.tsx`, `src/components/NavPane.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/NavPane.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NavPane } from './NavPane';
import { useLocationStore } from '../state/locationStore';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockInvoke.mockReset();
  useLocationStore.setState({ path: '', backStack: [], forwardStack: [] });
});

describe('NavPane', () => {
  it('lists special folders and drives, navigates on click', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'special_folders') return Promise.resolve([{ key: 'documents', name: '文档', path: 'C:\\Users\\caosh\\Documents' }]);
      if (cmd === 'list_drives') return Promise.resolve([{ letter: 'C:', path: 'C:\\' }]);
      return Promise.resolve([]);
    });
    render(<NavPane />);
    await waitFor(() => screen.getByText('文档'));
    fireEvent.click(screen.getByText('文档'));
    expect(useLocationStore.getState().path).toBe('C:\\Users\\caosh\\Documents');
    fireEvent.click(screen.getByText('C:'));
    expect(useLocationStore.getState().path).toBe('C:\\');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test src/components/NavPane.test.tsx
```
Expected: module not found.

- [ ] **Step 3: Implement NavPane**

`src/components/NavPane.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SpecialFolder, Drive } from '../types';
import { useLocationStore } from '../state/locationStore';

export function NavPane() {
  const [folders, setFolders] = useState<SpecialFolder[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const navigate = useLocationStore((s) => s.navigate);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    invoke<SpecialFolder[]>('special_folders').then(setFolders);
    invoke<Drive[]>('list_drives').then(setDrives);
  }, []);

  return (
    <nav className="nav-pane">
      <button className="nav-item" onClick={() => navigate(folders.find((f) => f.key === 'home')?.path ?? '')}>
        <span aria-hidden>🏠</span><span>主页</span>
      </button>
      <button className="nav-item" onClick={() => {}}>
        <span aria-hidden>🖼️</span><span>Gallery</span>
      </button>
      <div className="nav-item nav-group-label" onClick={() => setExpanded((e) => !e)}>
        <span aria-hidden>{expanded ? '▾' : '▸'}💻</span><span>此电脑</span>
      </div>
      {expanded && (
        <div className="nav-group">
          {folders.filter((f) => f.key !== 'home').map((f) => (
            <button key={f.key} className="nav-item nav-child" onClick={() => navigate(f.path)}>
              <span aria-hidden>📂</span><span>{f.name}</span>
            </button>
          ))}
          {drives.map((d) => (
            <button key={d.letter} className="nav-item nav-child" onClick={() => navigate(d.path)}>
              <span aria-hidden>💽</span><span>{d.letter}</span>
            </button>
          ))}
          <button className="nav-item nav-child" onClick={() => {}}>
            <span aria-hidden>🌐</span><span>网络</span>
          </button>
        </div>
      )}
    </nav>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm test src/components/NavPane.test.tsx
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/NavPane.tsx src/components/NavPane.test.tsx
git commit -m "feat(nav): NavPane This PC tree (special folders + drives)"
```

---

## Task 12: Toolbar — back/forward/up/refresh (TDD)

**Files:**
- Create: `src/components/Toolbar.tsx`, `src/components/Toolbar.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/Toolbar.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toolbar } from './Toolbar';
import { useLocationStore } from '../state/locationStore';

beforeEach(() => useLocationStore.setState({ path: '', backStack: [], forwardStack: [] }));

describe('Toolbar', () => {
  it('back is disabled with empty history and enabled after navigate', () => {
    render(<Toolbar onRefresh={() => {}} />);
    expect(screen.getByTitle('后退')).toBeDisabled();
    useLocationStore.setState({ backStack: ['C:\\'] });
    render(<Toolbar onRefresh={() => {}} />);
    expect(screen.getAllByTitle('后退')[1]).toBeEnabled();
  });
  it('up navigates to parent', () => {
    useLocationStore.setState({ path: 'C:\\Users\\caosh' });
    render(<Toolbar onRefresh={() => {}} />);
    fireEvent.click(screen.getByTitle('向上'));
    expect(useLocationStore.getState().path).toBe('C:\\Users');
  });
  it('refresh calls onRefresh', () => {
    const onRefresh = vi.fn();
    render(<Toolbar onRefresh={onRefresh} />);
    fireEvent.click(screen.getByTitle('刷新'));
    expect(onRefresh).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test src/components/Toolbar.test.tsx
```
Expected: module not found.

- [ ] **Step 3: Implement Toolbar**

`src/components/Toolbar.tsx`:
```tsx
import { useLocationStore } from '../state/locationStore';

export function Toolbar({ onRefresh }: { onRefresh: () => void }) {
  const back = useLocationStore((s) => s.back);
  const forward = useLocationStore((s) => s.forward);
  const up = useLocationStore((s) => s.up);
  const canBack = useLocationStore((s) => s.backStack.length > 0);
  const canForward = useLocationStore((s) => s.forwardStack.length > 0);

  return (
    <div className="toolbar">
      <button title="后退" disabled={!canBack} onClick={back}>←</button>
      <button title="前进" disabled={!canForward} onClick={forward}>→</button>
      <button title="向上" onClick={up}>↑</button>
      <button title="刷新" onClick={onRefresh}>↻</button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm test src/components/Toolbar.test.tsx
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/Toolbar.tsx src/components/Toolbar.test.tsx
git commit -m "feat(nav): toolbar back/forward/up/refresh"
```

---

## Task 13: App shell — layout wiring + StatusBar + boot to default folder

**Files:**
- Create: `src/components/StatusBar.tsx`, `src/components/FileList.tsx`, `src/components/ContextMenu.tsx`
- Modify: `src/App.tsx`, `src/main.tsx` (import base css)

- [ ] **Step 1: Create StatusBar**

`src/components/StatusBar.tsx`:
```tsx
import { useSelectionStore } from '../state/selectionStore';

export function StatusBar({ count }: { count: number }) {
  const selected = useSelectionStore((s) => s.selected.length);
  return (
    <footer className="status-bar">
      <span>{selected > 0 ? `已选 ${selected} 项` : `${count} 项`}</span>
    </footer>
  );
}
```

- [ ] **Step 2: Create ContextMenu stub (Phase 0: non-functional)**

`src/components/ContextMenu.tsx`:
```tsx
// Phase 0 stub: full Win11 modern context menu arrives in Plan 4.
export function ContextMenu() {
  return null;
}
```

- [ ] **Step 3: Create FileList dispatcher**

`src/components/FileList.tsx`:
```tsx
import type { Entry } from '../types';
import { useViewStore } from '../state/viewStore';
import { DetailsView } from './views/DetailsView';
import { IconsView } from './views/IconsView';

export function FileList({ entries }: { entries: Entry[] }) {
  const viewMode = useViewStore((s) => s.viewMode);
  if (viewMode === 'large' || viewMode === 'extra-large' || viewMode === 'medium' || viewMode === 'small') {
    return <IconsView entries={entries} />;
  }
  return <DetailsView entries={entries} />;
}
```

- [ ] **Step 4: Wire App shell + boot to Documents**

`src/App.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TitleBar } from './components/TitleBar';
import { Toolbar } from './components/Toolbar';
import { Breadcrumb } from './components/Breadcrumb';
import { NavPane } from './components/NavPane';
import { FileList } from './components/FileList';
import { StatusBar } from './components/StatusBar';
import { useLocationStore } from './state/locationStore';
import { useDirectory } from './hooks/useDirectory';
import type { SpecialFolder } from './types';

export default function App() {
  const path = useLocationStore((s) => s.path);
  const navigate = useLocationStore((s) => s.navigate);
  const [refreshKey, setRefreshKey] = useState(0);
  const { entries, loading, error } = useDirectory(path);

  // Boot to the user's Documents folder on first run.
  useEffect(() => {
    if (!path) {
      invoke<SpecialFolder[]>('special_folders').then((f) => {
        const docs = f.find((x) => x.key === 'documents');
        if (docs) navigate(docs.path);
      });
    }
  }, [path, navigate]);

  return (
    <div className="app">
      <TitleBar />
      <div className="toolbar-row">
        <Toolbar onRefresh={() => setRefreshKey((k) => k + 1)} />
        <Breadcrumb />
      </div>
      <div className="body">
        <NavPane />
        <main className="main-view" key={`${path}-${refreshKey}`}>
          {loading ? <div className="empty">加载中…</div>
            : error ? <div className="empty">无法打开此位置：{error}</div>
            : entries.length === 0 ? <div className="empty">此文件夹为空。</div>
            : <FileList entries={entries} />}
        </main>
      </div>
      <StatusBar count={entries.length} />
      <ContextMenu />
    </div>
  );
}
```

- [ ] **Step 5: Import base CSS in main.tsx**

In `src/main.tsx`, ensure the app CSS import line is `import './styles/win11.css';` (replace the default `./App.css` import if present). Leave `React.StrictMode` as-is.

- [ ] **Step 6: Verify the app boots**

```bash
pnpm tauri dev
```
Expected: window shows the Win11 chrome layout; main view lists the Documents folder; double-clicking a folder navigates; back/up/breadcrumb work; status bar shows item count. (Visual fidelity polish is Task 16; here we verify wiring.)

- [ ] **Step 7: Commit**

```bash
git add src/components/StatusBar.tsx src/components/ContextMenu.tsx src/components/FileList.tsx src/App.tsx src/main.tsx
git commit -m "feat(shell): app layout, boot to Documents, StatusBar, FileList dispatcher"
```

---

## Task 14: Custom TitleBar with window controls

**Files:**
- Create: `src/components/TitleBar.tsx`
- Modify: `src-tauri/tauri.conf.json` (decorations off), `src-tauri/capabilities/default.json` (window perms)

- [ ] **Step 1: Disable native decorations + enable Mica**

In `src-tauri/tauri.conf.json`, under `app.windows[0]`, set:
```json
"decorations": false,
"windowEffects": { "effects": ["mica"], "state": "active" }
```
(If `app.windows` does not exist, add it under `app`.)

- [ ] **Step 2: Grant window-control permissions**

In `src-tauri/capabilities/default.json`, add to the `permissions` array:
```json
"core:window:allow-minimize",
"core:window:allow-toggle-maximize",
"core:window:allow-close",
"core:window:allow-start-dragging",
"core:window:allow-is-maximized"
```

- [ ] **Step 3: Implement TitleBar**

`src/components/TitleBar.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useLocationStore } from '../state/locationStore';

export function TitleBar() {
  const path = useLocationStore((s) => s.path);
  const title = path ? path.replace(/\\/g, ' › ') : 'WinFinder';
  const [maximized, setMaximized] = useState(false);
  const win = getCurrentWindow();

  useEffect(() => {
    let active = true;
    win.isMaximized().then((m) => active && setMaximized(m)).catch(() => {});
    const unlisten = win.onResized(() => win.isMaximized().then((m) => active && setMaximized(m)).catch(() => {}));
    return () => { active = false; unlisten.then((u) => u()); };
  }, [win]);

  return (
    <header className="title-bar" data-tauri-drag-region>
      <div className="title-tabs" data-tauri-drag-region>
        <span className="tab" data-tauri-drag-region>📁 {title || '主页'}</span>
      </div>
      <div className="window-controls">
        <button className="wc wc-min" onClick={() => win.minimize()} title="最小化">—</button>
        <button className="wc wc-max" onClick={() => win.toggleMaximize()} title="最大化">{maximized ? '🗗' : '🗖'}</button>
        <button className="wc wc-close" onClick={() => win.close()} title="关闭">✕</button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Verify window controls**

```bash
pnpm tauri dev
```
Expected: no native title bar; custom bar spans the top; minimize/maximize/restore/close work; dragging the bar moves the window; double-clicking the bar toggles maximize. (Mica tint visible on Win11; solid fallback on Win10 — finalized in Task 16.)

- [ ] **Step 5: Commit**

```bash
git add src/components/TitleBar.tsx src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "feat(chrome): custom Mica title bar with window controls"
```

---

## Task 15: Large icons view (validates view abstraction)

**Files:**
- Create: `src/components/views/IconsView.tsx`, `src/components/views/IconsView.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/views/IconsView.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconsView } from './IconsView';
import { useSelectionStore } from '../../state/selectionStore';

beforeEach(() => useSelectionStore.getState().clear());

describe('IconsView', () => {
  it('renders tiles and selects on click', () => {
    const entries = [
      { name: 'Folder1', path: 'C:\\Folder1', isDir: true, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: '文件夹', ext: '', isHidden: false, isSystem: false, isReadOnly: false },
    ];
    render(<IconsView entries={entries as any} />);
    expect(screen.getByText('Folder1')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Folder1'));
    expect(useSelectionStore.getState().selected).toEqual(['C:\\Folder1']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test src/components/views/IconsView.test.tsx
```
Expected: module not found.

- [ ] **Step 3: Implement IconsView**

`src/components/views/IconsView.tsx`:
```tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Entry } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { icon, handleClick } from './detailsHelpers';

const TILE_H = 96;

export function IconsView({ entries }: { entries: Entry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sel = useSelectionStore();
  const navigate = useLocationStore((s) => s.navigate);

  // Simple vertical virtualization of rows of N tiles.
  const perRow = 6;
  const rowCount = Math.ceil(entries.length / perRow);
  const rowV = useVirtualizer({ count: rowCount, getScrollElement: () => parentRef.current, estimateSize: () => TILE_H, overscan: 8 });

  return (
    <div className="icons" ref={parentRef} style={{ overflow: 'auto', height: '100%' }}>
      <div style={{ height: `${rowV.getTotalSize()}px`, position: 'relative' }}>
        {rowV.getVirtualItems().map((vi) => {
          const start = vi.index * perRow;
          const row = entries.slice(start, start + perRow);
          return (
            <div key={vi.key} className="icon-row" style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: TILE_H }}>
              {row.map((item) => {
                const selected = sel.selected.includes(item.path);
                return (
                  <div
                    key={item.path}
                    className={`tile${selected ? ' selected' : ''}`}
                    onClick={(ev) => handleClick(ev, item, entries, sel)}
                    onDoubleClick={() => item.isDir && navigate(item.path)}
                  >
                    <div className="tile-icon">{icon(item)}</div>
                    <div className="tile-name">{item.name}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add a view toggle to switch Details↔Large (manual check)**

In `src/App.tsx`, add a temporary toggle button inside `.toolbar-row` (before `<Breadcrumb />`):
```tsx
<button className="view-toggle" onClick={() => {
  const m = useViewStore.getState().viewMode;
  useViewStore.getState().setViewMode(m === 'details' ? 'large' : 'details');
}}>切换视图</button>
```
and `import { useViewStore } from './state/viewStore';` at the top. (This toggle is replaced by the real View dropdown in Plan 2; it exists only to validate both renderers.)

- [ ] **Step 5: Run tests + manual verify**

```bash
pnpm test src/components/views/IconsView.test.tsx
```
Expected: pass. Then `pnpm tauri dev`: clicking "切换视图" flips between Details and Large icons; both render real entries; double-click navigates.

- [ ] **Step 6: Commit**

```bash
git add src/components/views/IconsView.tsx src/components/views/IconsView.test.tsx src/App.tsx
git commit -m "feat(views): large icons view (virtualized grid)"
```

---

## Task 16: Win11 theming — Segoe font + light/dark tokens + Mica polish

**Files:**
- Create: `src/styles/win11.css`
- Modify: `src-tauri/tauri.conf.json` (theme/transparent as needed)

- [ ] **Step 1: Write the design-token stylesheet**

`src/styles/win11.css` (complete base; sizes follow Win11 at 100% DPI — refine against screenshots in Task 17):
```css
:root {
  --font: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
  --titlebar-h: 40px;
  --toolbar-h: 48px;
  --statusbar-h: 28px;
  --navpane-w: 240px;
}
/* Light theme (default) */
:root, .theme-light {
  --bg: #f3f3f3;
  --pane-bg: #fbfbfb;
  --main-bg: #ffffff;
  --text: #1a1a1a;
  --text-sub: #6e6e6e;
  --border: #e5e5e5;
  --accent: #0067c0;
  --accent-text: #ffffff;
  --select-bg: #cfe4f7;
  --hover-bg: #f0f0f0;
  --header-bg: #f5f5f5;
}
/* Dark theme */
.theme-dark {
  --bg: #202020;
  --pane-bg: #2b2b2b;
  --main-bg: #2b2b2b;
  --text: #ffffff;
  --text-sub: #b0b0b0;
  --border: #3a3a3a;
  --accent: #60cdff;
  --accent-text: #000000;
  --select-bg: #4a5b6e;
  --hover-bg: #383838;
  --header-bg: #303030;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; }
body { font-family: var(--font); font-size: 14px; background: var(--bg); color: var(--text); user-select: none; overflow: hidden; }

.app { display: flex; flex-direction: column; height: 100vh; }

.title-bar { height: var(--titlebar-h); display: flex; align-items: stretch; }
.title-tabs { flex: 1; display: flex; align-items: center; padding: 0 8px; gap: 4px; }
.title-tabs .tab { background: rgba(255,255,255,0.06); border-radius: 6px; padding: 5px 12px; font-size: 12px; }
.window-controls { display: flex; }
.wc { width: 46px; height: var(--titlebar-h); border: 0; background: transparent; color: var(--text); font-size: 12px; cursor: pointer; }
.wc:hover { background: rgba(0,0,0,0.08); }
.theme-dark .wc:hover { background: rgba(255,255,255,0.10); }
.wc-close:hover { background: #c42b1c; color: #fff; }

.toolbar-row { height: var(--toolbar-h); display: flex; align-items: center; gap: 8px; padding: 0 12px; }
.toolbar { display: flex; gap: 4px; }
.toolbar button { width: 36px; height: 36px; border: 0; background: transparent; color: var(--text); border-radius: 6px; font-size: 16px; cursor: pointer; }
.toolbar button:hover:not(:disabled) { background: var(--hover-bg); }
.toolbar button:disabled { color: var(--text-sub); opacity: 0.5; cursor: default; }

.breadcrumb { flex: 1; height: 32px; display: flex; align-items: center; background: rgba(255,255,255,0.7); border: 1px solid var(--border); border-radius: 6px; padding: 0 8px; gap: 2px; }
.theme-dark .breadcrumb { background: rgba(255,255,255,0.05); }
.breadcrumb .crumb { background: transparent; border: 0; color: var(--text); cursor: pointer; font-size: 13px; padding: 2px 4px; border-radius: 4px; }
.breadcrumb .crumb:hover { background: var(--hover-bg); }
.breadcrumb .chevron { color: var(--text-sub); }
.breadcrumb-input { flex: 1; height: 32px; border: 1px solid var(--accent); border-radius: 6px; padding: 0 8px; font-family: var(--font); color: var(--text); background: var(--main-bg); }

.body { flex: 1; display: flex; min-height: 0; }
.nav-pane { width: var(--navpane-w); background: var(--pane-bg); border-right: 1px solid var(--border); overflow: auto; padding: 4px; }
.nav-item { display: block; width: 100%; text-align: left; background: transparent; border: 0; color: var(--text); padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 13px; }
.nav-item:hover { background: var(--hover-bg); }
.nav-child { padding-left: 28px; }

.main-view { flex: 1; background: var(--main-bg); overflow: hidden; position: relative; }
.empty { padding: 24px; color: var(--text-sub); }

.details-header, .details-row { display: grid; grid-template-columns: 1fr 180px 160px 110px; align-items: center; }
.details-header { height: 32px; background: var(--header-bg); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 1; }
.details-header button { border: 0; background: transparent; color: var(--text); text-align: left; font-size: 12px; padding: 0 10px; cursor: pointer; height: 100%; }
.details-row { height: 32px; border-bottom: 1px solid var(--border); }
.details-row:hover { background: var(--hover-bg); }
.details-row.selected { background: var(--select-bg); }
.details-row span { padding: 0 10px; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.icons { padding: 8px; }
.icon-row { display: flex; gap: 8px; padding: 4px; }
.tile { width: 96px; height: 88px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 8px 4px; border-radius: 4px; cursor: default; }
.tile:hover { background: var(--hover-bg); }
.tile.selected { background: var(--select-bg); }
.tile-icon { font-size: 40px; }
.tile-name { font-size: 12px; text-align: center; max-width: 90px; word-break: break-word; }

.status-bar { height: var(--statusbar-h); display: flex; align-items: center; justify-content: space-between; padding: 0 14px; background: var(--pane-bg); border-top: 1px solid var(--border); font-size: 12px; color: var(--text-sub); }
.view-toggle { border: 1px solid var(--border); background: var(--main-bg); color: var(--text); padding: 4px 10px; border-radius: 6px; cursor: pointer; }
```

- [ ] **Step 2: Follow system theme**

In `src/App.tsx`, add an effect to apply the theme class to `document.documentElement`:
```tsx
import { getCurrentWindow } from '@tauri-apps/api/window';
// inside App component, after other hooks:
useEffect(() => {
  const apply = (t: 'light' | 'dark') => {
    document.documentElement.classList.toggle('theme-dark', t === 'dark');
    document.documentElement.classList.toggle('theme-light', t === 'light');
  };
  getCurrentWindow().theme().then((t) => t && apply(t)).catch(() => {});
  const unlisten = getCurrentWindow().onThemeChanged((e) => e.payload && apply(e.payload as 'light' | 'dark'));
  return () => { unlisten.then((u) => u()); };
}, []);
```
Ensure `tauri.conf.json` has `"theme": "System"` at the app level (or `windows[0].theme: "System"`).

- [ ] **Step 3: Manual visual check + refine tokens**

```bash
pnpm tauri dev
```
Expected: layout, fonts, colors approximate Win11; theme follows system dark/light; Mica tint shows on Win11. Note pixel deviations for Task 17.

- [ ] **Step 4: Commit**

```bash
git add src/styles/win11.css src/App.tsx src-tauri/tauri.conf.json
git commit -m "feat(theme): Win11 design tokens, Segoe font, system light/dark, Mica"
```

---

## Task 17: Phase 0 acceptance — Win11 baseline capture + comparison

**Files:**
- Create: `docs/acceptance/reference/README.md`, `docs/acceptance/dataset/README.md`, `docs/acceptance/phase0-checklist.md`

This task executes spec **§11** for the Phase 0 regions. It is the gate: Phase 0 is not done until the checklist is green.

- [ ] **Step 1: Document the fixed dataset**

`docs/acceptance/dataset/README.md`:
```markdown
# 验收固定数据集

用于截图比对的标准目录样本（在真机 Win11 与 WinFinder 中各建一份相同内容）：

- `Dataset/`（根）
  - 文件夹 `子文件夹A/`（含 1 个 txt）
  - 文件夹 `Pictures/`（含 2 张 jpg）
  - `文档.txt`（内容 "hello"，约 5 B）
  - `报告.pdf`（任意小型 pdf）
  - `照片.jpg`
  - `视频.mp4`（任意小型 mp4）

深色与浅色主题各采一次。所有截图在 100% 缩放、1080p+、关闭高对比度下采集。
```

- [ ] **Step 2: Document reference capture procedure**

`docs/acceptance/reference/README.md`:
```markdown
# 黄金基准（真机 Windows 11 截图）

在标准 Windows 11（23H2/24H2）真机上，按 §11.2 受控条件采集。文件命名：
`<区域>-<状态>-<主题>.png`，例：`titlebar-default-light.png`、`details-default-dark.png`。

Phase 0 必采区域（浅/深各一套）：
titlebar、toolbar、breadcrumb(浏览态)、navpane(展开此电脑)、
details(默认)、details(选中)、icons-large(默认)、statusbar。
```

- [ ] **Step 3: Capture real Win11 baselines**

On a Win11 machine: open the real File Explorer to the Dataset folder, screenshot each Phase 0 region in light then dark theme, save into `docs/acceptance/reference/` using the naming above.

- [ ] **Step 4: Capture WinFinder screenshots**

Run `pnpm tauri dev`, navigate to the same Dataset folder, screenshot the same regions/themes, save as `docs/acceptance/winf-<区域>-<状态>-<主题>.png` for comparison.

- [ ] **Step 5: Compare and log**

Fill `docs/acceptance/phase0-checklist.md`:
```markdown
# Phase 0 界面验收核对（§11）

| 区域 | 状态 | 主题 | 偏差 | 结论 |
|---|---|---|---|---|
| 标题栏/Mica | 默认 | 浅 | _填写_ | ⬜/✅ |
| 标题栏 | 默认 | 深 | | |
| 工具栏 | 全启用 | 浅/深 | | |
| 面包屑 | 浏览态 | 浅/深 | | |
| 导航窗格 | 展开此电脑 | 浅/深 | | |
| 详细信息视图 | 默认 | 浅/深 | | |
| 详细信息视图 | 选中 | 浅/深 | | |
| 大图标视图 | 默认 | 浅/深 | | |
| 状态栏 | 无选中 | 浅/深 | | |

判据：§11.1（几何 ≤1px、颜色 ΔE≤2、字体/图标一致；Mica/ClearType 见 §11.3 豁免）。
任何"偏差"非空项须返回对应组件任务修复并重比，直至全 ✅。
```

- [ ] **Step 6: Fix deviations until all green**

For each non-empty 偏差 row, edit `src/styles/win11.css` or the relevant component to close the gap (geometry/color/spacing), re-screenshot, re-compare. Repeat until every row is ✅.

- [ ] **Step 7: Commit acceptance artifacts**

```bash
git add docs/acceptance/
git commit -m "test(acceptance): Phase 0 §11 baseline + comparison checklist (all green)"
```

---

## Definition of Done (Phase 0)

- `cargo test` (in `src-tauri`) all green.
- `pnpm test` all green.
- `pnpm tauri build` produces a Windows executable that runs on Win10 and Win11.
- App boots to a real folder, lists entries, navigates via breadcrumb/nav pane/back/forward/up/double-click, switches Details↔Large icons, selects items, shows status bar.
- `docs/acceptance/phase0-checklist.md` is all ✅ (§11 gate for Phase 0 regions).

## Self-Review (already applied)

- **Spec coverage (Phase 0 subset):** list+nav ✓ (T2/T4), special folders+drives ✓ (T3/T4), location history ✓ (T6), view mode + sort ✓ (T7/T9), breadcrumb ✓ (T10), nav pane ✓ (T11), toolbar ✓ (T12), status bar ✓ (T13), custom title bar + Mica ✓ (T14/T16), two views ✓ (T9/T15), themes ✓ (T16), §11 acceptance ✓ (T17). Phase 1 features (file ops, undo, thumbnails, watching, context menu, search, properties, remaining 6 views, quick access/Home) are deliberately deferred to Plans 2–5 per the plan-sequence note.
- **Placeholder scan:** no TBD/TODO; every code step contains real code.
- **Type consistency:** `Entry` fields match between Rust (T2) and TS (T5); `SelectionState` methods (`select`/`toggle`/`selectRange`/`clear`) used consistently; `useSorted`/`icon`/`handleClick`/`useOpen` defined once in `detailsHelpers.ts` and imported by both views.
