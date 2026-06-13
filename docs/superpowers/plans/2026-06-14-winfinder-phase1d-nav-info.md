# WinFinder — Phase 1d: Navigation/Info Layer · Implementation Plan

> **For agentic workers:** subagent-driven-development / executing-plans. Checkbox steps.

**Goal:** Search (current folder + subfolders), Properties dialog, inline rename (F2), and a simplified Home page — completing the Phase 1 feature set on top of 0/1a/1b/1c.

**Architecture:** Rust `search(root, query)` walks recursively and returns matching `Entry[]`. React `SearchBox` + a search-state branch in App shows results. `PropertiesDialog` reads metadata (already in Entry) + a `get_properties` path size aggregation. Inline rename threads a `renamingPath` through FileList into views. `HomeView` shows special folders.

**Tech Stack:** Rust (std::fs walk), React + TS, Zustand. Tests: cargo test, Vitest + RTL.

**Spec ref:** §2.1 (search, properties, Home), §4 (search box, properties dialog), §7.2 (search/get_properties), §9.7 (search).

**Pragmatic scope:**
- Search: recursive name substring match (case-insensitive); results replace the main view until cleared.
- Properties: single-selection modal (type/location/size/occupied/dates); folders show aggregate size (recursive) via a backend command.
- Inline rename: F2 / context menu / CommandBar → inline `<input>` in DetailsView + IconsView (primary views); others fall back to DetailsView.
- Home: special-folders grid + a local "recent" log (files opened via the app). Pin/unpin + frequent-folder heuristics deferred.

**Builds on:** Phase 0 + 1a/1b/1c on `phase0-foundation`.

---

## File Structure
- Modify `src-tauri/src/fs_ops.rs` — extract `entry_from`, add `search`, `folder_size`.
- Modify `src-tauri/src/lib.rs` — `search`, `get_properties` commands.
- Create `src/state/searchStore.ts` — query + results.
- Create `src/components/SearchBox.tsx`.
- Create `src/components/PropertiesDialog.tsx`.
- Create `src/components/views/HomeView.tsx`.
- Modify `src/components/FileList.tsx` — renamingPath threading + Home/search routing.
- Modify view components — inline rename input.
- Modify `src/App.tsx` — search box, properties trigger (Alt+Enter / event), Home routing, recent log.
- Modify `src/styles/win11.css`.

---

## Task 1: Rust search + folder_size (TDD)

**Files:** Modify `src-tauri/src/fs_ops.rs`, `src-tauri/src/lib.rs`.

- [ ] **Step 1: Refactor + failing test** — in `fs_ops.rs`, the `list_directory` body builds an `Entry` inline. Extract a helper `fn entry_from(name, path, meta) -> Entry` and use it in both `list_directory` and the new `search`. Add tests to the `tests` module:
```rust
    #[test]
    fn search_finds_by_name_recursively() {
        let d = tempdir().unwrap();
        fs::create_dir_all(d.path().join("sub")).unwrap();
        fs::write(d.path().join("sub").join("report.txt"), "x").unwrap();
        fs::write(d.path().join("other.md"), "y").unwrap();
        let hits = search(d.path().to_str().unwrap(), "report").unwrap();
        let names: Vec<&str> = hits.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"report.txt"));
        assert!(!names.contains(&"other.md"));
    }

    #[test]
    fn search_is_case_insensitive() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("README.md"), "x").unwrap();
        let hits = search(d.path().to_str().unwrap(), "readme").unwrap();
        assert!(hits.iter().any(|e| e.name == "README.md"));
    }

    #[test]
    fn folder_size_sums_files() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("a.txt"), "12345").unwrap(); // 5
        fs::create_dir_all(d.path().join("sub")).unwrap();
        fs::write(d.path().join("sub").join("b.txt"), "ab").unwrap(); // 2
        assert_eq!(folder_size(d.path().to_str().unwrap()).unwrap(), 7);
    }
```
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — extract `entry_from` (move the Entry-struct literal from `list_directory` into it), then add:
```rust
pub fn search(root: &str, query: &str) -> std::io::Result<Vec<Entry>> {
    let q = query.to_lowercase();
    let mut out = Vec::new();
    let mut stack: Vec<std::path::PathBuf> = vec![std::path::PathBuf::from(root)];
    while let Some(dir) = stack.pop() {
        let rd = match fs::read_dir(&dir) { Ok(r) => r, Err(_) => continue };
        for de in rd.flatten() {
            let meta = match de.metadata() { Ok(m) => m, Err(_) => continue };
            let name = de.file_name().to_string_lossy().to_string();
            let path = de.path().to_string_lossy().to_string();
            if name.to_lowercase().contains(&q) {
                out.push(entry_from(&name, &path, &meta));
            }
            if meta.is_dir() { stack.push(de.path()); }
        }
    }
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

pub fn folder_size(path: &str) -> std::io::Result<u64> {
    let mut total = 0u64;
    let mut stack: Vec<std::path::PathBuf> = vec![std::path::PathBuf::from(path)];
    while let Some(dir) = stack.pop() {
        let rd = match fs::read_dir(&dir) { Ok(r) => r, Err(_) => continue };
        for de in rd.flatten() {
            let meta = match de.metadata() { Ok(m) => m, Err(_) => continue };
            if meta.is_dir() { stack.push(de.path()); } else { total += meta.len(); }
        }
    }
    Ok(total)
}
```
(`entry_from` must handle the hidden/system/readonly derivation like the original list_directory literal.)
- [ ] **Step 4: Commands** — in `lib.rs`:
```rust
#[tauri::command]
fn search(root: String, query: String) -> error::Result<Vec<fs_ops::Entry>> {
    fs_ops::search(&root, &query).map_err(AppError::from)
}
#[tauri::command]
fn get_properties(path: String) -> error::Result<u64> {
    fs_ops::folder_size(&path).map_err(AppError::from)
}
```
Register `search`, `get_properties`. `cargo test --lib fs_ops` → green (3 new + existing); `cargo build`.
- [ ] **Step 5: Commit** `feat(fs): recursive search + folder size`.

## Task 2: Frontend search (store + SearchBox + results routing) (TDD)

**Files:** Create `src/state/searchStore.ts`, `src/components/SearchBox.tsx`; Modify `src/App.tsx`.

- [ ] **Step 1: searchStore** — create `src/state/searchStore.ts`:
```ts
import { create } from 'zustand';
import type { Entry } from '../types';

interface SearchState {
  query: string;
  results: Entry[] | null; // null = not searching
  setQuery: (q: string) => void;
  setResults: (r: Entry[] | null) => void;
  clear: () => void;
}
export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  results: null,
  setQuery: (q) => set({ query: q }),
  setResults: (r) => set({ results: r }),
  clear: () => set({ query: '', results: null }),
}));
```
- [ ] **Step 2: SearchBox** — create `src/components/SearchBox.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSearchStore } from '../state/searchStore';
import { useLocationStore } from '../state/locationStore';
import type { Entry } from '../types';

export function SearchBox() {
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setResults = useSearchStore((s) => s.setResults);
  const path = useLocationStore((s) => s.path);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (t.current) clearTimeout(t.current);
    if (!query.trim()) { setResults(null); return; }
    t.current = setTimeout(() => {
      invoke<Entry[]>('search', { root: path, query }).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => { if (t.current) clearTimeout(t.current); };
  }, [query, path, setResults]);

  return (
    <input
      className="search-box"
      placeholder={`搜索 ${path ? path.replace(/^.*\\/, '') : ''}`}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  );
}
```
- [ ] **Step 3: App wiring** — in App.tsx: render `<SearchBox />` in the toolbar-row (after Breadcrumb). When `useSearchStore.results` is non-null, pass those entries to `<FileList>` instead of the directory entries:
```tsx
import { useSearchStore } from './state/searchStore';
// ...
const searchResults = useSearchStore((s) => s.results);
const shownEntries = searchResults ?? entries;
// pass shownEntries to <CommandBar entries={shownEntries} /> and <FileList entries={shownEntries} />
```
- [ ] **Step 4:** `npx tsc --noEmit`; `pnpm test`; `pnpm run build`.
- [ ] **Step 5: Commit** `feat(search): current-folder search box + results`.

## Task 3: Properties dialog

**Files:** Create `src/components/PropertiesDialog.tsx`; Modify `src/App.tsx`, `src/styles/win11.css`.

- [ ] **Step 1: PropertiesDialog** — create `src/components/PropertiesDialog.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Entry } from '../types';
import { formatDate, formatSize } from '../utils/format';

export function PropertiesDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const [size, setSize] = useState<number>(entry.size);
  useEffect(() => {
    if (entry.isDir) { invoke<number>('get_properties', { path: entry.path }).then(setSize).catch(() => {}); }
  }, [entry]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal properties" onClick={(e) => e.stopPropagation()}>
        <h3>{entry.name} 属性</h3>
        <dl className="props">
          <dt>类型</dt><dd>{entry.isDir ? '文件夹' : entry.typeLabel}</dd>
          <dt>位置</dt><dd>{entry.path.replace(/\\[^\\]*$/, '')}</dd>
          <dt>大小</dt><dd>{formatSize(size)}</dd>
          <dt>修改日期</dt><dd>{formatDate(entry.modified) || '—'}</dd>
          <dt>创建日期</dt><dd>{formatDate(entry.created) || '—'}</dd>
          <dt>属性</dt><dd>{[entry.isReadOnly && '只读', entry.isHidden && '隐藏'].filter(Boolean).join(' ') || '常规'}</dd>
        </dl>
        <div className="modal-actions"><button className="cmd" onClick={onClose}>确定</button></div>
      </div>
    </div>
  );
}
```
- [ ] **Step 2: App wiring** — App holds `const [propsEntry, setPropsEntry] = useState<Entry | null>(null);`. Listen for a `winfinder:properties` CustomEvent (detail = Entry) → setPropsEntry. Also bind Alt+Enter in the keydown handler (when exactly one selected) → dispatch the event with that entry. Render `{propsEntry && <PropertiesDialog entry={propsEntry} onClose={() => setPropsEntry(null)} />}`. Add `import { PropertiesDialog } from './components/PropertiesDialog';`. (You need the selected Entry object — resolve from `shownEntries` by the selected path.)
- [ ] **Step 3: Context menu** — add a Properties item to ContextMenu: `item('属性', () => { const en = selEntries[0]; if (en) window.dispatchEvent(new CustomEvent('winfinder:properties', { detail: en })); }, sel.length !== 1)`.
- [ ] **Step 4: CSS** — `.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; z-index: 2000; } .modal { background: var(--main-bg); border-radius: 8px; padding: 20px; min-width: 320px; box-shadow: 0 12px 32px rgba(0,0,0,0.25); } .modal h3 { margin-bottom: 16px; } .props { display: grid; grid-template-columns: 90px 1fr; gap: 8px 12px; font-size: 13px; } .props dt { color: var(--text-sub); } .modal-actions { margin-top: 16px; text-align: right; }`.
- [ ] **Step 5:** tsc; test; build. Commit `feat(ui): properties dialog (Alt+Enter / context menu)`.

## Task 4: Inline rename (F2)

**Files:** Modify `src/components/FileList.tsx`, `DetailsView.tsx`, `IconsView.tsx`, `src/App.tsx`.

- [ ] **Step 1: App holds renamingPath** — `const [renamingPath, setRenamingPath] = useState<string | null>(null);`. Listen for `winfinder:rename` (detail=path) → setRenamingPath. (If rename started on a path not in selection, select it.) Pass `renamingPath` + `onRenameCommit(newName)` to `<FileList>`.
- [ ] **Step 2: FileList threads props** — `FileList({ entries, renamingPath, onRenameCommit })` passes them to DetailsView + IconsView.
- [ ] **Step 3: DetailsView inline input** — when `renamingPath === item.path`, render an `<input className="rename-input" autoFocus defaultValue={item.name}>` instead of the name span; on Enter → `onRenameCommit(value)` + clear; Esc → clear. (onRenameCommit calls useFileOps.renameEntry — App passes a handler that does so and setRenamingPath(null).)
- [ ] **Step 4: IconsView inline input** — same pattern in the tile-name area.
- [ ] **Step 5:** tsc; test; build. Commit `feat(ui): inline rename (F2)`.

## Task 5: Home page

**Files:** Create `src/components/views/HomeView.tsx`; Modify `src/App.tsx`, `src/state/locationStore.ts` (treat empty/`home` path as Home).

- [ ] **Step 1: HomeView** — shows the special folders (Desktop/Documents/Downloads/Pictures/Music/Videos) as large clickable tiles (navigate on click). Fetch via `invoke('special_folders')`.
- [ ] **Step 2: Routing** — in App, when `path === ''` (boot, before navigation) or a sentinel `home`, render `<HomeView onOpen={navigate} />` instead of FileList. (The NavPane 主页 button already navigates to home path; wire it to clear path → '' so Home shows.)
- [ ] **Step 3:** tsc; test; build. Commit `feat(ui): Home page (special folders)`.

## Task 6: Release exe + §11 readiness

- [ ] **Step 1:** kill running exe; `pnpm tauri build` → exe + bundles (exit 0). Launch; verify search, properties, rename, Home all work; no crash.
- [ ] **Step 2:** Update `docs/acceptance/phase0-checklist.md` → rename/extend to a Phase-1 acceptance checklist covering the new features (search, properties, context menu, thumbnails, watching, undo, all 8 views).
- [ ] **Step 3:** Commit.

## Definition of Done (Phase 1d / Phase 1 complete)
- cargo test green, pnpm test green, tsc clean, build ok, release exe builds + runs.
- Search works; properties dialog (Alt+Enter) works; F2 inline rename works; Home page shows special folders. Combined with 0/1a/1b/1c, the explorer now covers the full Phase 1 scope (§2.1). §11 visual zero-deviation acceptance remains the documented user step.

## Self-Review
- search (T1/T2), properties (T3), rename (T4), Home (T5), exe+acceptance (T6). Deferred to polish: real command-bar flyout, pin/frequent/recent heuristics, full shortcut coverage audit. Types: search→Vec<Entry>, get_properties→u64 consistent.
