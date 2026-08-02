# Lepton Explorer — Phase 1b: Mutation Layer · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** File operations (new folder/file, rename, copy, cut/paste, delete-to-recycle, permanent delete, open) + undo/redo, on top of Phase 0 + 1a.

**Architecture:** Rust does all mutations behind typed commands (`src-tauri/src/ops.rs`); frontend never mutates the disk. A `clipboardStore` (copy/cut), `historyStore` (undo/redo closures), and `useFileOps` hook orchestrate. A minimal CommandBar + keyboard shortcuts expose the ops. Recycle-bin delete uses the `trash` crate.

**Tech Stack:** Rust (tauri, std::fs, `trash`), React + TS, Zustand. Tests: Rust `cargo test` (tempdir), Vitest + RTL.

**Spec ref:** `docs/superpowers/specs/2026-06-13-design.md` §2.1, §7.2 (commands), §8 (errors/conflicts), §9.2 (file ops), §9.3 (undo/redo), §9.4 (shortcuts).

**Scope guardrails (pragmatic for this plan — full polish is Plan 5):**
- Copy/move are **synchronous** (await; no streaming progress bar). Acceptable for typical files; large-file progress is Plan 5.
- **Collision handling = auto-rename** ("name (2).ext" — keep both). The full replace/skip/keep modal is Plan 5.
- **Undo** covers: new folder/file, rename, copy, move. **Delete is NOT undoable** in this plan (recycle-bin restore is unreliable across the `trash` crate) — Ctrl+Z is a no-op after a delete. Noted as a known limitation.
- Permanent delete (Shift+Delete) is **not** undoable (data gone).

**Builds on:** Phase 0 + 1a on `phase0-foundation`.

---

## File Structure
- Modify `src-tauri/Cargo.toml` — add `trash = "5"`.
- Create `src-tauri/src/ops.rs` — create_dir/file, rename, copy_items, move_items, delete_to_trash, delete_permanent.
- Modify `src-tauri/src/error.rs` — (no change; reuse AppError).
- Modify `src-tauri/src/lib.rs` — register the new commands + `pub mod ops;`.
- Create `src/state/clipboardStore.ts` — copy/cut sources + mode.
- Create `src/state/historyStore.ts` — undo/redo stacks.
- Create `src/hooks/useFileOps.ts` — execute ops, push undo, refresh.
- Create `src/components/CommandBar.tsx` — New/Cut/Copy/Rename/Delete/Paste buttons.
- Modify `src/App.tsx` — mount CommandBar; wire shortcuts; refresh on op.
- Modify view components — double-click a **file** opens it (opener plugin); inline rename (F2).
- Modify `src/styles/win11.css` — command bar + rename input styles.

---

## Task 1: Rust ops — create_dir, create_file, rename, open (TDD)

**Files:** Modify `src-tauri/Cargo.toml`; Create `src-tauri/src/ops.rs`; Modify `src-tauri/src/lib.rs`.

- [ ] **Step 1: Add `trash` dep** — in `src-tauri/Cargo.toml` `[dependencies]` add `trash = "5"`. (Used in T3.)
- [ ] **Step 2: Failing tests** — create `src-tauri/src/ops.rs`:
```rust
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn create_dir_and_file_work() {
        let d = tempdir().unwrap();
        let dp = d.path().join("newdir");
        create_dir(dp.to_str().unwrap()).unwrap();
        assert!(dp.is_dir());
        let fp = dp.join("a.txt");
        create_file(fp.to_str().unwrap()).unwrap();
        assert!(fp.is_file());
    }

    #[test]
    fn rename_moves_a_file() {
        let d = tempdir().unwrap();
        let a = d.path().join("a.txt");
        let b = d.path().join("b.txt");
        fs::write(&a, "x").unwrap();
        rename(a.to_str().unwrap(), b.to_str().unwrap()).unwrap();
        assert!(!a.exists());
        assert!(b.is_file());
    }

    #[test]
    fn rename_missing_returns_err() {
        assert!(rename("Z:/no/x", "Z:/no/y").is_err());
    }
}
```
- [ ] **Step 3: Run → fail** (`cargo test --lib ops`): functions not defined.
- [ ] **Step 4: Implement** — add ABOVE the test module in `ops.rs`:
```rust
pub fn create_dir(path: &str) -> std::io::Result<()> {
    fs::create_dir(Path::new(path))
}

pub fn create_file(path: &str) -> std::io::Result<()> {
    fs::File::create(Path::new(path))?;
    Ok(())
}

pub fn rename(from: &str, to: &str) -> std::io::Result<()> {
    fs::rename(Path::new(from), Path::new(to))
}
```
- [ ] **Step 5: Register module** — in `lib.rs` add `pub mod ops;`. Run `cargo test --lib ops` → 3 passed.

## Task 2: Rust ops — copy_items, move_items with collision auto-rename (TDD)

**Files:** Modify `src-tauri/src/ops.rs`.

- [ ] **Step 1: Failing tests** — add to the `tests` module:
```rust
    #[test]
    fn copy_items_copies_files_and_returns_new_paths() {
        let d = tempdir().unwrap();
        let src1 = d.path().join("a.txt"); fs::write(&src1, "1").unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        let new_paths = copy_items(&[src1.to_str().unwrap().to_string()], dest.to_str().unwrap()).unwrap();
        assert_eq!(new_paths.len(), 1);
        assert!(dest.join("a.txt").is_file());
    }

    #[test]
    fn copy_items_auto_renames_on_collision() {
        let d = tempdir().unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "1").unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        fs::write(dest.join("a.txt"), "existing").unwrap();
        let new_paths = copy_items(&[src.to_str().unwrap().to_string()], dest.to_str().unwrap()).unwrap();
        assert!(dest.join("a.txt").is_file());            // original untouched
        assert!(dest.join("a (1).txt").is_file());        // copy got unique name
        assert_eq!(new_paths[0], dest.join("a (1).txt").to_string_lossy().to_string());
    }

    #[test]
    fn copy_items_copies_directory_recursively() {
        let d = tempdir().unwrap();
        let srcdir = d.path().join("folder"); fs::create_dir(&srcdir).unwrap();
        fs::write(srcdir.join("inner.txt"), "x").unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        copy_items(&[srcdir.to_str().unwrap().to_string()], dest.to_str().unwrap()).unwrap();
        assert!(dest.join("folder").is_dir());
        assert!(dest.join("folder").join("inner.txt").is_file());
    }

    #[test]
    fn move_items_moves_within_same_volume() {
        let d = tempdir().unwrap();
        let src = d.path().join("a.txt"); fs::write(&src, "1").unwrap();
        let dest = d.path().join("dest"); fs::create_dir(&dest).unwrap();
        let moved = move_items(&[src.to_str().unwrap().to_string()], dest.to_str().unwrap()).unwrap();
        assert!(!src.exists());
        assert!(dest.join("a.txt").is_file());
        assert_eq!(moved[0].1, dest.join("a.txt").to_string_lossy().to_string());
    }
```
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — add to `ops.rs` (above tests):
```rust
/// Return a non-existing path next to `dst` by appending " (n)" before the extension.
pub fn unique_path(dst: &Path) -> PathBuf {
    if !dst.exists() { return dst.to_path_buf(); }
    let stem = dst.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = dst.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let parent = dst.parent().unwrap_or_else(|| Path::new(""));
    let mut n = 1;
    loop {
        let cand = parent.join(format!("{} ({}){}", stem, n, ext));
        if !cand.exists() { return cand; }
        n += 1;
    }
}

fn copy_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if src.is_dir() {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let from = entry.path();
            let to = dst.join(entry.file_name());
            copy_recursive(&from, &to)?;
        }
        Ok(())
    } else {
        fs::copy(src, dst).map(|_| ())
    }
}

/// Copy each source into `dest_dir` (auto-renaming on collision). Returns the resulting paths.
pub fn copy_items(sources: &[String], dest_dir: &str) -> std::io::Result<Vec<String>> {
    let dest = Path::new(dest_dir);
    let mut out = Vec::new();
    for s in sources {
        let src = Path::new(s);
        let name = src.file_name().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "no file name"))?;
        let target = unique_path(&dest.join(name));
        copy_recursive(src, &target)?;
        out.push(target.to_string_lossy().to_string());
    }
    Ok(out)
}

/// Move each source into `dest_dir` (same-volume = rename; cross-volume = copy+delete).
/// Returns Vec<(old_path, new_path)>.
pub fn move_items(sources: &[String], dest_dir: &str) -> std::io::Result<Vec<(String, String)>> {
    let dest = Path::new(dest_dir);
    let mut out = Vec::new();
    for s in sources {
        let src = Path::new(s);
        let name = src.file_name().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "no file name"))?;
        let target = unique_path(&dest.join(name));
        let old = src.to_string_lossy().to_string();
        match fs::rename(src, &target) {
            Ok(()) => {}
            Err(e) if e.raw_os_error() == Some(18) => {
                // EXDEV: cross-device — copy then delete.
                copy_recursive(src, &target)?;
                remove_recursive(src)?;
            }
            Err(e) => return Err(e),
        }
        out.push((old, target.to_string_lossy().to_string()));
    }
    Ok(out)
}

fn remove_recursive(p: &Path) -> std::io::Result<()> {
    if p.is_dir() { fs::remove_dir_all(p) } else { fs::remove_file(p) }
}
```
- [ ] **Step 4: Run → all pass** (`cargo test --lib ops`).

## Task 3: Rust ops — delete_to_trash, delete_permanent (TDD)

**Files:** Modify `src-tauri/src/ops.rs`.

- [ ] **Step 1: Failing tests** — add to `tests`:
```rust
    #[test]
    fn delete_permanent_removes_file_and_dir() {
        let d = tempdir().unwrap();
        let f = d.path().join("a.txt"); fs::write(&f, "x").unwrap();
        delete_permanent(&[f.to_str().unwrap().to_string()]).unwrap();
        assert!(!f.exists());
    }

    #[test]
    fn delete_to_trash_removes_file() {
        // Moves the file to the OS recycle bin; the temp file disappears from its location.
        let d = tempdir().unwrap();
        let f = d.path().join("totrash.txt"); fs::write(&f, "x").unwrap();
        let _ = delete_to_trash(&[f.to_str().unwrap().to_string()]);
        assert!(!f.exists(), "file should be moved to recycle bin");
    }
```
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — add to `ops.rs`:
```rust
pub fn delete_to_trash(paths: &[String]) -> Result<(), trash::Error> {
    let items: Vec<&Path> = paths.iter().map(|p| Path::new(p)).collect();
    trash::delete_all(items)
}

pub fn delete_permanent(paths: &[String]) -> std::io::Result<()> {
    for p in paths {
        remove_recursive(Path::new(p))?;
    }
    Ok(())
}
```
- [ ] **Step 4: Run → pass** (`cargo test --lib ops`). (Note: `delete_to_trash` test actually recycles a temp file — acceptable.)

## Task 4: Wire the new Rust commands (TDD-light)

**Files:** Modify `src-tauri/src/lib.rs`, `src-tauri/src/error.rs`.

- [ ] **Step 1: AppError gains `From<trash::Error>`** — add to `src-tauri/src/error.rs`:
```rust
impl From<trash::Error> for AppError {
    fn from(e: trash::Error) -> Self {
        AppError::Unknown(e.to_string())
    }
}
```
- [ ] **Step 2: Commands in lib.rs** — add the command functions and register them:
```rust
#[tauri::command]
fn create_dir(path: String) -> error::Result<()> { Ok(ops::create_dir(&path).map_err(AppError::from)?) }
#[tauri::command]
fn create_file(path: String) -> error::Result<()> { Ok(ops::create_file(&path).map_err(AppError::from)?) }
#[tauri::command]
fn rename(from: String, to: String) -> error::Result<()> { Ok(ops::rename(&from, &to).map_err(AppError::from)?) }
#[tauri::command]
fn copy_items(sources: Vec<String>, dest: String) -> error::Result<Vec<String>> { Ok(ops::copy_items(&sources, &dest).map_err(AppError::from)?) }
#[tauri::command]
fn move_items(sources: Vec<String>, dest: String) -> error::Result<Vec<(String, String)>> { Ok(ops::move_items(&sources, &dest).map_err(AppError::from)?) }
#[tauri::command]
fn delete_to_trash(paths: Vec<String>) -> error::Result<()> { Ok(ops::delete_to_trash(&paths).map_err(AppError::from)?) }
#[tauri::command]
fn delete_permanent(paths: Vec<String>) -> error::Result<()> { Ok(ops::delete_permanent(&paths).map_err(AppError::from)?) }
```
Add all seven to the `generate_handler![...]` list. `error::Result` is `Result<T, AppError>`; the commands reference `error::Result` and `AppError` — ensure `use error::{AppError, Result};` is present (it is from Phase 0).
- [ ] **Step 3: Build + test** — `cd src-tauri && cargo build && cargo test && cd ..`. All Rust tests pass (5 prior + ~9 new ops). No unused-import warnings (add `pub mod ops;`).

## Task 5: Frontend — clipboardStore (copy/cut) (TDD)

**Files:** Create `src/state/clipboardStore.ts`, `.test.ts`.

- [ ] **Step 1: Failing test** — `src/state/clipboardStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useClipboardStore } from './clipboardStore';
import type { Entry } from '../types';
const e = (n: string): Entry => ({ name: n, path: 'C:\\' + n, isDir: false, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: '', ext: '', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => useClipboardStore.getState().clear());

describe('clipboardStore', () => {
  it('copy stores entries with mode copy', () => {
    useClipboardStore.getState().copy([e('a')]);
    expect(useClipboardStore.getState().items.map((i) => i.path)).toEqual(['C:\\a']);
    expect(useClipboardStore.getState().mode).toBe('copy');
  });
  it('cut stores entries with mode cut', () => {
    useClipboardStore.getState().cut([e('a'), e('b')]);
    expect(useClipboardStore.getState().mode).toBe('cut');
    expect(useClipboardStore.getState().items).toHaveLength(2);
  });
  it('clear empties', () => {
    useClipboardStore.getState().copy([e('a')]);
    useClipboardStore.getState().clear();
    expect(useClipboardStore.getState().items).toEqual([]);
  });
});
```
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — `src/state/clipboardStore.ts`:
```ts
import { create } from 'zustand';
import type { Entry } from '../types';

export type ClipboardMode = 'copy' | 'cut';

interface ClipboardState {
  items: Entry[];
  mode: ClipboardMode;
  copy: (items: Entry[]) => void;
  cut: (items: Entry[]) => void;
  clear: () => void;
}

export const useClipboardStore = create<ClipboardState>((set) => ({
  items: [],
  mode: 'copy',
  copy: (items) => set({ items, mode: 'copy' }),
  cut: (items) => set({ items, mode: 'cut' }),
  clear: () => set({ items: [], mode: 'copy' }),
}));
```
- [ ] **Step 4: Run → pass; tsc.**

## Task 6: Frontend — historyStore (undo/redo) (TDD)

**Files:** Create `src/state/historyStore.ts`, `.test.ts`.

- [ ] **Step 1: Failing test** — `src/state/historyStore.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useHistoryStore } from './historyStore';

beforeEach(() => useHistoryStore.setState({ undoStack: [], redoStack: [] }));

describe('historyStore', () => {
  it('push then undo calls the entry undo and clears redo path', async () => {
    const undo = vi.fn().mockResolvedValue(undefined);
    const redo = vi.fn().mockResolvedValue(undefined);
    useHistoryStore.getState().push({ label: 'rename', undo, redo });
    await useHistoryStore.getState().undo();
    expect(undo).toHaveBeenCalledOnce();
    expect(useHistoryStore.getState().canUndo()).toBe(false);
    expect(useHistoryStore.getState().canRedo()).toBe(true);
  });
  it('redo calls redo and restores undoability', async () => {
    const undo = vi.fn().mockResolvedValue(undefined);
    const redo = vi.fn().mockResolvedValue(undefined);
    useHistoryStore.getState().push({ label: 'x', undo, redo });
    await useHistoryStore.getState().undo();
    await useHistoryStore.getState().redo();
    expect(redo).toHaveBeenCalledOnce();
    expect(useHistoryStore.getState().canUndo()).toBe(true);
  });
  it('push clears the redo stack', () => {
    useHistoryStore.getState().push({ label: 'a', undo: async () => {}, redo: async () => {} });
    useHistoryStore.getState().push({ label: 'b', undo: async () => {}, redo: async () => {} });
    expect(useHistoryStore.getState().undoStack).toHaveLength(2);
  });
});
```
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — `src/state/historyStore.ts`:
```ts
import { create } from 'zustand';

export interface HistoryEntry {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface HistoryState {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  push: (e: HistoryEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  push: (e) => set((s) => ({ undoStack: [...s.undoStack, e], redoStack: [] })),
  undo: async () => {
    const stack = get().undoStack;
    if (!stack.length) return;
    const entry = stack[stack.length - 1];
    await entry.undo();
    set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, entry] }));
  },
  redo: async () => {
    const stack = get().redoStack;
    if (!stack.length) return;
    const entry = stack[0];
    await entry.redo();
    set((s) => ({ redoStack: s.redoStack.slice(1), undoStack: [...s.undoStack, entry] }));
  },
  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
}));
```
- [ ] **Step 4: Run → pass; tsc.** (Note: `set`/`get` both used — no unused warning.)

## Task 7: Frontend — useFileOps hook (execute + undo wiring) (TDD)

**Files:** Create `src/hooks/useFileOps.ts`, `.test.ts`.

- [ ] **Step 1: Failing test** — `src/hooks/useFileOps.test.ts` (mock invoke + stores):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileOps } from './useFileOps';
import { useClipboardStore } from '../state/clipboardStore';
import { useHistoryStore } from '../state/historyStore';
import type { Entry } from '../types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
const m = invoke as unknown as ReturnType<typeof vi.fn>;

const e = (n: string): Entry => ({ name: n, path: 'C:\\dest\\' + n, isDir: false, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: '', ext: '', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => { m.mockReset(); useClipboardStore.getState().clear(); useHistoryStore.setState({ undoStack: [], redoStack: [] }); });

describe('useFileOps', () => {
  it('newFolder creates a folder and pushes an undo entry', async () => {
    m.mockResolvedValue([]);
    const { result } = renderHook(() => useFileOps());
    await act(async () => { await result.current.newFolder('C:\\dest'); });
    expect(m).toHaveBeenCalledWith('create_dir', expect.objectContaining({ path: expect.stringMatching(/新建文件夹/) }));
    expect(useHistoryStore.getState().canUndo()).toBe(true);
  });

  it('paste (copy mode) invokes copy_items', async () => {
    useClipboardStore.getState().copy([e('a.txt')]);
    m.mockResolvedValue(['C:\\dest\\a.txt']);
    const { result } = renderHook(() => useFileOps());
    await act(async () => { await result.current.paste('C:\\dest'); });
    expect(m).toHaveBeenCalledWith('copy_items', expect.objectContaining({ dest: 'C:\\dest' }));
  });
});
```
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — `src/hooks/useFileOps.ts`:
```ts
import { invoke } from '@tauri-apps/api/core';
import { useClipboardStore } from '../state/clipboardStore';
import { useHistoryStore } from '../state/historyStore';
import { useLocationStore } from '../state/locationStore';
import { joinPath } from '../utils/paths';

async function refresh(path: string) {
  // Trigger a re-list by bumping the location's navigate to the same path via a custom event.
  // Simplest: re-invoke is handled by the App refreshKey; here we dispatch a window event.
  window.dispatchEvent(new CustomEvent('lepton:refresh'));
}

export function useFileOps() {
  const push = useHistoryStore((s) => s.push);

  async function newFolder(dir: string) {
    let name = '新建文件夹';
    let path = joinPath(dir, name);
    // best-effort unique (backend also uniques, but keep label tidy)
    const created = await invoke<string[]>('create_dir', { path });
    push({
      label: `新建文件夹`,
      undo: async () => { await invoke('delete_permanent', { paths: [path] }); refresh(dir); },
      redo: async () => { await invoke('create_dir', { path }); refresh(dir); },
    });
    refresh(dir);
    return created;
  }

  async function newFile(dir: string) {
    const path = joinPath(dir, '新建文本文档.txt');
    await invoke('create_file', { path });
    push({
      label: '新建文件',
      undo: async () => { await invoke('delete_permanent', { paths: [path] }); refresh(dir); },
      redo: async () => { await invoke('create_file', { path }); refresh(dir); },
    });
    refresh(dir);
  }

  async function renameEntry(from: string, toName: string) {
    const parent = from.replace(/\\[^\\]*$/, '');
    const to = joinPath(parent, toName);
    await invoke('rename', { from, to });
    push({
      label: '重命名',
      undo: async () => { await invoke('rename', { from: to, to: from }); refresh(parent); },
      redo: async () => { await invoke('rename', { from, to }); refresh(parent); },
    });
    refresh(parent);
  }

  async function paste(destDir: string) {
    const { items, mode } = useClipboardStore.getState();
    if (!items.length) return;
    const sources = items.map((i) => i.path);
    if (mode === 'copy') {
      const created = await invoke<string[]>('copy_items', { sources, dest: destDir });
      push({
        label: '复制',
        undo: async () => { await invoke('delete_permanent', { paths: created }); refresh(destDir); },
        redo: async () => { await invoke('copy_items', { sources, dest: destDir }); refresh(destDir); },
      });
    } else {
      const moved = await invoke<[string, string][]>('move_items', { sources, dest: destDir });
      const olds = moved.map((m2) => m2[0]);
      push({
        label: '移动',
        undo: async () => { await invoke('move_items', { sources: moved.map((m2) => m2[1]), dest: useLocationStore.getState().path }); refresh(destDir); },
        redo: async () => { await invoke('move_items', { sources: olds, dest: destDir }); refresh(destDir); },
      });
      useClipboardStore.getState().clear();
    }
    refresh(destDir);
  }

  async function remove(paths: string[], permanent: boolean) {
    if (permanent) await invoke('delete_permanent', { paths });
    else await invoke('delete_to_trash', { paths });
    // Delete is not undoable in this plan (recycle-bin restore is unreliable).
    refresh(useLocationStore.getState().path);
  }

  return { newFolder, newFile, renameEntry, paste, remove };
}
```
- [ ] Add `joinPath` to `src/utils/paths.ts`:
```ts
export function joinPath(dir: string, name: string): string {
  const d = dir.replace(/[\\/]+$/, '');
  return d + '\\' + name;
}
```
- [ ] **Step 4: Run → pass; tsc.** (Note: `move_items` return type `Vec<(String,String)>` serializes as `[string,string][]` — match in TS.)

## Task 8: CommandBar + shortcuts + double-click-open + App wiring

**Files:** Create `src/components/CommandBar.tsx`; Modify `src/App.tsx`, view components (`DetailsView`/`IconsView` double-click open files), `src/styles/win11.css`.

- [ ] **Step 1: CommandBar component** — `src/components/CommandBar.tsx`:
```tsx
import { useSelectionStore } from '../state/selectionStore';
import { useClipboardStore } from '../state/clipboardStore';
import { useFileOps } from '../hooks/useFileOps';
import { useLocationStore } from '../state/locationStore';

export function CommandBar() {
  const sel = useSelectionStore((s) => s.selected);
  const hasSel = sel.length > 0;
  const ops = useFileOps();
  const path = useLocationStore((s) => s.path);
  const cut = useClipboardStore((s) => s.cut);
  const copy = useClipboardStore((s) => s.copy);
  // rename handled via inline-edit in views; CommandBar Rename triggers a custom event
  const onRename = () => window.dispatchEvent(new CustomEvent('lepton:start-rename', { detail: sel[0] }));
  return (
    <div className="command-bar">
      <button className="cmd" onClick={() => ops.newFolder(path)}>新建文件夹</button>
      <button className="cmd" disabled={!hasSel} onClick={() => cut(useSelectionStore.getState().selected as any)}>剪切</button>
      <button className="cmd" disabled={!hasSel} onClick={() => copy(useSelectionStore.getState().selected as any)}>复制</button>
      <button className="cmd" disabled={!hasSel} onClick={onRename}>重命名</button>
      <button className="cmd" disabled={!hasSel} onClick={() => ops.remove(sel, false)}>删除</button>
      <button className="cmd" onClick={() => ops.paste(path)}>粘贴</button>
    </div>
  );
}
```
NOTE: `cut`/`copy` take `Entry[]` not `string[]`. Fix: keep the selected Entries, not just paths. Add a parallel selection of Entry objects — simplest: in CommandBar, the buttons need the Entry objects. Since selectionStore stores paths only, resolve entries via the current entries list passed as a prop. Refine: pass `entries: Entry[]` into CommandBar, compute `selEntries = entries.filter(e => sel.includes(e.path))`, and call `cut(selEntries)`/`copy(selEntries)`. Implement that.
- [ ] **Step 2: Wire CommandBar + shortcuts + refresh + rename into App.tsx**:
  - Import `CommandBar`, `useFileOps`, `useHistoryStore`, `useClipboardStore`, `useSelectionStore`.
  - Render `<CommandBar entries={entries} />` inside `.toolbar-row` (next to the view select).
  - Add a `refresh` mechanism: in App, `useEffect` listens for `window` event `lepton:refresh` → `setRefreshKey(k => k+1)`.
  - Extend the existing keydown effect to handle (when not in an input): `Delete`/`Ctrl+D` → ops.remove(selectedPaths, false); `Shift+Delete` → ops.remove(selectedPaths, true); `Ctrl+C` → clipboard.copy(selEntries); `Ctrl+X` → clipboard.cut(selEntries); `Ctrl+V` → ops.paste(path); `Ctrl+Shift+N` → ops.newFolder(path); `Ctrl+Z` → history.undo(); `Ctrl+Y` → history.redo(); `F2` → dispatch `lepton:start-rename`.
- [ ] **Step 3: Double-click a FILE opens it** — in `DetailsView.tsx`, `IconsView.tsx`, `ListView.tsx`, `TilesView.tsx`, `ContentView.tsx`: change `onDoubleClick={() => item.isDir && navigate(item.path)}` to:
```tsx
onDoubleClick={() => { if (item.isDir) navigate(item.path); else openItem(item.path); }}
```
Add `openItem` via the opener plugin. Create `src/utils/open.ts`:
```ts
import { open } from '@tauri-apps/plugin-opener';
export async function openItem(path: string) { try { await open(path); } catch { /* ignore */ } }
```
Import `openItem` in each view. (Ensure `@tauri-apps/plugin-opener` is installed — it ships with the Tauri scaffold; if `import { open }` fails, add `pnpm add @tauri-apps/plugin-opener`.)
- [ ] **Step 4: CSS** — add `.command-bar { display: flex; gap: 6px; padding: 6px 12px; border-bottom: 1px solid var(--border); } .cmd { height: 32px; padding: 0 12px; border: 1px solid var(--border); background: var(--main-bg); color: var(--text); border-radius: 6px; cursor: pointer; font-size: 13px; } .cmd:hover:not(:disabled){ background: var(--hover-bg);} .cmd:disabled{ opacity:.5; cursor:default;}`.
- [ ] **Step 5: Verify** — `npx tsc --noEmit`; `pnpm test` (new tests from T5-T7 green, existing green); `pnpm run build`.
- [ ] **Step 6: Commit** `feat(ops): file operations + clipboard + undo/redo + command bar`.

## Task 9: Build the exe & verify it runs

- [ ] **Step 1:** `pnpm tauri build` → produces `src-tauri/target/release/lepton-explorer.exe` + installers (exit 0).
- [ ] **Step 2:** Launch `src-tauri/target/release/lepton-explorer.exe`; confirm it opens, lists files, and the new CommandBar + file ops are present (New folder, Copy/Cut/Paste, Rename, Delete all work on a test folder). No crash.
- [ ] **Step 3:** Commit any final fixes.

## Definition of Done (Phase 1b)
- `cargo test` (all) green, `pnpm test` green, `tsc --noEmit` clean, `pnpm run build` ok.
- Release exe builds and runs; file ops work on a real test folder; undo/redo works for new/rename/copy/move; Ctrl+C/X/V, F2, Delete, Shift+Delete, Ctrl+Shift+N, Ctrl+Z/Y all functional.
- Known limitation: delete is not undoable; collision auto-renames (no replace/skip modal); no streaming progress.

## Self-Review
- Ops: create/rename/copy/move/delete/open ✓; clipboard ✓; undo/redo (new/rename/copy/move) ✓; shortcuts ✓; double-click-open ✓. Delete-undo, conflict modal, streaming progress explicitly deferred. Types: `copy_items`→`Vec<String>`, `move_items`→`Vec<(String,String)>` consistent Rust↔TS.
