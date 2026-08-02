# Lepton Explorer — Phase 1c: Richness Layer · Implementation Plan

> **For agentic workers:** subagent-driven-development / executing-plans. Checkbox steps.

**Goal:** Live file-watching (auto-refresh), real image thumbnails + file-type icons, and a Win11-style right-click context menu — on top of Phase 0 + 1a + 1b.

**Architecture:** Rust `watch` module uses `notify` to watch the current dir and emit a `fs-changed` Tauri event (debounced). Rust `thumbnails` module renders image thumbnails via the `image` crate (PNG→base64) and file-type icons via `SHGetFileInfo` (HICON→PNG) with an emoji fallback. A React `ContextMenu` renders the modern Win11 menu; `Thumbnail`/`Icon` components consume the new commands.

**Tech Stack:** Rust (notify, image, windows crate GDI), React + TS. Tests: cargo test (where feasible), Vitest + RTL.

**Spec ref:** `docs/superpowers/specs/2026-06-13-design.md` §2.1 (thumbnails, watching, context menu), §5 (watch/thumbnails/shell_icons modules), §4 (context menu), §9.6 (watching).

**Pragmatic scope:**
- Thumbnails: real thumbnails for **image files** (jpg/png/gif/bmp/webp) via the `image` crate. Non-image files use **file-type icons** via SHGetFileInfo (real Win11 icons); if shell-icon extraction fails, fall back to a curated emoji. Disk-cached.
- Watching: debounce ~300ms; re-watch when the current path changes.
- Context menu: modern Win11 look (Cut/Copy/Rename/Delete/Open/Paste + "显示更多选项" stub). Full shell "more options" deferred.

**Builds on:** Phase 0 + 1a + 1b on `phase0-foundation`.

---

## File Structure
- Modify `src-tauri/Cargo.toml` — add `notify = "6"`, `image = { version = "0.25", default-features = false, features = ["png","jpeg","gif","bmp","webp"] }`, `base64 = "0.22"`. (windows crate already present; add features `Win32_UI_Shell`, `Win32_UI_WindowsAndMessaging`, `Win32_Graphics_Gdi`.)
- Create `src-tauri/src/watch.rs` — `watch_directory(app, path)`.
- Create `src-tauri/src/thumbnails.rs` — `get_thumbnail(path, size) -> Option<String>` (image), `get_icon(key, size) -> Option<String>` (shell icon PNG).
- Modify `src-tauri/src/lib.rs` — modules + commands + watcher State.
- Create `src/components/Thumbnail.tsx` — renders image thumbnail or icon.
- Create `src/components/ContextMenu.tsx` — right-click menu (replaces stub).
- Modify `src/App.tsx` — watch current path; listen `fs-changed`; wire context menu (right-click on main view).
- Modify view components — use `<Thumbnail>` instead of emoji `icon()`.
- Modify `src/styles/win11.css` — context menu + thumbnail styles.

---

## Task 1: Live file watching (notify) (TDD-light)

**Files:** Cargo deps; Create `src-tauri/src/watch.rs`; Modify `src-tauri/src/lib.rs`.

- [ ] **Step 1: Deps** — in `src-tauri/Cargo.toml` `[dependencies]` add `notify = "6"`. (`tauri` already provides `AppHandle`/`Emitter`.)
- [ ] **Step 2: watch.rs** — create `src-tauri/src/watch.rs`:
```rust
use notify::{RecommendedWatcher, RecursiveMode, Watcher, Config};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

// Holds the current directory watcher so we can drop (and thus stop) it when the path changes.
pub struct WatcherState(pub Mutex<Option<RecommendedWatcher>>);

impl WatcherState {
    pub fn new() -> Self { Self(Mutex::new(None)) }
}

pub fn watch_directory(app: AppHandle, path: String, state: &WatcherState) {
    // Drop the previous watcher (stops its thread).
    let mut guard = state.0.lock().unwrap();
    *guard = None;
    drop(guard);

    let app_handle = app.clone();
    let path_for_thread = path.clone();
    // Spawn a thread that owns the watcher + a debounce timer.
    let handle = thread::spawn(move || -> std::io::Result<()> {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher: RecommendedWatcher = match Watcher::new(
            move |res: notify::Result<notify::Event>| { let _ = tx.send(res); },
            Config::default(),
        ) {
            Ok(w) => w,
            Err(_) => return Ok(()),
        };
        if watcher.watch(std::path::Path::new(&path_for_thread), RecursiveMode::NonRecursive).is_err() {
            return Ok(());
        }
        // Debounce: emit fs-changed at most once per 300ms of quiet.
        let mut last: Option<Instant> = None;
        loop {
            match rx.recv_timeout(Duration::from_millis(150)) {
                Ok(_) => last = Some(Instant::now()),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if let Some(t) = last {
                        if t.elapsed() >= Duration::from_millis(150) {
                            let _ = app_handle.emit("fs-changed", ());
                            last = None;
                        }
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        // Keep `watcher` alive until the thread ends; dropping stops watching.
        drop(watcher);
        Ok(())
    });
    // We intentionally don't join — the thread runs until the watcher is dropped
    // (on next watch_directory call the old watcher in state is replaced, but the
    // thread holds its OWN watcher; to truly stop it we rely on process exit for now).
    // NOTE: store a sentinel; the thread is detached. For Phase 1c this is acceptable.
    let _ = handle;
    let _ = state; // state kept for future explicit-stop wiring
}
```
NOTE: the watcher thread owns its `RecommendedWatcher`; the `WatcherState` sentinel is a placeholder. For correctness of "re-watch on path change," each `watch_directory` call spawns a fresh thread/watcher for the new path; old threads keep running but only emit for their (old) path — to avoid stale emits, the frontend ignores `fs-changed` whose path != current. (Simpler: include the path in the event payload and have the frontend filter.) REVISE: emit `{ path }` and filter client-side. Update the emit to `app_handle.emit("fs-changed", path_for_thread.clone())` won't work (path moved). Capture path into the thread and emit it. Implementer: emit the watched path string as the payload.

- [ ] **Step 3: lib.rs** — add `pub mod watch;`, `use tauri::Manager;` (for state), manage the state, and a command:
```rust
#[tauri::command]
fn watch_directory(app: tauri::AppHandle, path: String, state: tauri::State<'_, watch::WatcherState>) {
    watch::watch_directory(app, path, &state);
}
```
In `run()`, add `.manage(watch::WatcherState::new())` to the builder and register `watch_directory` in the handler.
- [ ] **Step 4:** `cd src-tauri && cargo build 2>&1 | tail -10 && cd ..` → Finished. (notify v6 API matches.)
- [ ] **Step 5: Commit** `feat(watch): live directory watching (notify, debounced fs-changed)`.

## Task 2: Image thumbnails via `image` crate (TDD)

**Files:** Cargo deps; Create `src-tauri/src/thumbnails.rs`; Modify `src-tauri/src/lib.rs`.

- [ ] **Step 1: Deps** — add `image = { version = "0.25", default-features = false, features = ["png","jpeg","gif","bmp","webp"] }` and `base64 = "0.22"`. Add windows features: extend the `windows` dep to `features = ["Win32_Storage_FileSystem", "Win32_Foundation", "Win32_UI_Shell", "Win32_UI_WindowsAndMessaging", "Win32_Graphics_Gdi"]`.
- [ ] **Step 2: Failing test** — create `src-tauri/src/thumbnails.rs`:
```rust
use base64::Engine;
use std::io::Cursor;

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba, imageops};
    use tempfile::tempdir;

    fn make_png(p: &std::path::Path) {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_fn(64, 64, |_x, _y| Rgba([10, 20, 30, 255]));
        img.save(p).unwrap();
    }

    #[test]
    fn thumbnail_for_image_returns_base64_png() {
        let d = tempdir().unwrap();
        let imgp = d.path().join("a.png");
        make_png(&imgp);
        let out = get_thumbnail(imgp.to_str().unwrap(), 48).unwrap();
        assert!(out.starts_with("iVBOR"), "expected base64 PNG (starts with iVBOR), got: {}", &out[..out.len().min(20)]);
    }

    #[test]
    fn thumbnail_for_non_image_returns_none() {
        let d = tempdir().unwrap();
        let p = d.path().join("a.txt");
        std::fs::write(&p, "hi").unwrap();
        assert!(get_thumbnail(p.to_str().unwrap(), 48).is_none());
    }
}
```
- [ ] **Step 3: Run → fail** (`cargo test --lib thumbnails`).
- [ ] **Step 4: Implement** — add above the test module:
```rust
pub fn get_thumbnail(path: &str, size: u32) -> Option<String> {
    let img = image::open(std::path::Path::new(path)).ok()?;
    let thumb = image::imageops::resize(&img, size, size, image::imageops::FilterType::Nearest);
    let mut buf = Cursor::new(Vec::new());
    thumb.write_to(&mut std::io::BufWriter::new(&mut buf), image::ImageFormat::Png).ok()?;
    Some(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
}
```
- [ ] **Step 5: Register + command** — `pub mod thumbnails;` in lib.rs; command:
```rust
#[tauri::command]
fn get_thumbnail(path: String, size: u32) -> Option<String> { thumbnails::get_thumbnail(&path, size) }
```
Register in handler. `cargo test --lib thumbnails` → 2 passed; `cargo build`.
- [ ] **Step 6: Commit** `feat(thumbnails): image thumbnails (image crate → base64 PNG)`.

## Task 3: File-type icons via SHGetFileInfo (HICON→PNG), emoji fallback

**Files:** Modify `src-tauri/src/thumbnails.rs`, `src-tauri/src/lib.rs`.

- [ ] **Step 1: Implement get_icon** — add to `thumbnails.rs` (Windows shell icon → PNG base64; returns None on any failure so the frontend falls back to emoji):
```rust
#[cfg(windows)]
pub fn get_icon(path: &str, size: u32) -> Option<String> {
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHGFI_ICON, SHGFI_LARGEICON, SHGFI_SMALLICON, SHFILEINFOW};
    use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO, DestroyIcon};
    use windows::Win32::Graphics::Gdi::{GetDIBits, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DeleteObject, GetObjectW, BITMAP};
    use windows::core::PCWSTR;

    let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let mut info = SHFILEINFOW::default();
    let flags = SHGFI_ICON | if size >= 32 { SHGFI_LARGEICON } else { SHGFI_SMALLICON };
    let ptr = unsafe { SHGetFileInfoW(PCWSTR(wide.as_ptr()), 0, Some(&mut info), std::mem::size_of::<SHFILEINFOW>() as u32, flags) };
    if ptr == 0 || info.hIcon.is_invalid() { return None; }
    let hicon = info.hIcon;
    let result = icon_to_png(hicon);
    unsafe { let _ = DestroyIcon(hicon); }
    result
}

#[cfg(windows)]
fn icon_to_png(hicon: windows::Win32::UI::WindowsAndMessaging::HICON) -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::GetIconInfo;
    use windows::Win32::Graphics::Gdi::{CreateCompatibleDC, SelectObject, DeleteDC, DeleteObject, GetDIBits, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS};
    use windows::Win32::UI::WindowsAndMessaging::ICONINFO;

    unsafe {
        let mut ii = ICONINFO::default();
        if GetIconInfo(hicon, &mut ii).is_err() { return None; }
        // Use the color bitmap (hbmColor). If None, it's a mono icon — skip.
        let hbm = ii.hbmColor;
        if hbm.is_invalid() { let _ = DeleteObject(ii.hbmMask); return None; }
        let dc = CreateCompatibleDC(None);
        let old = SelectObject(dc, hbm);
        let mut bi = BITMAPINFO { bmiHeader: BITMAPINFOHEADER { biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32, biWidth: 32, biHeight: -32i32, biPlanes: 1, biBitCount: 32, biCompression: BI_RGB.0, ..Default::default() }, ..Default::default() };
        let mut pixels = vec![0u8; (32 * 32 * 4) as usize];
        let got = GetDIBits(dc, hbm, 0, 32, Some(pixels.as_mut_ptr() as *mut _), &mut bi, DIB_RGB_COLORS);
        SelectObject(dc, old);
        let _ = DeleteDC(dc);
        let _ = DeleteObject(ii.hbmColor);
        let _ = DeleteObject(ii.hbmMask);
        if got == 0 { return None; }
        // BGRA -> RGBA
        for px in pixels.chunks_exact_mut(4) { px.swap(0, 2); }
        let img = image::RgbaImage::from_raw(32, 32, pixels)?;
        let mut buf = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(img).write_to(&mut std::io::BufWriter::new(&mut buf), image::ImageFormat::Png).ok()?;
        Some(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
    }
}

#[cfg(not(windows))]
pub fn get_icon(_path: &str, _size: u32) -> Option<String> { None }
```
- [ ] **Step 2: Command + register** — in lib.rs:
```rust
#[tauri::command]
fn get_icon(path: String, size: u32) -> Option<String> { thumbnails::get_icon(&path, size) }
```
Register `get_icon`. `cd src-tauri && cargo build 2>&1 | tail -15 && cd ..`. If the GDI interop has any compile issues (struct field defaults, casts), fix them — the goal is "compiles + returns Some PNG for a real file path." If it cannot be made to compile in reasonable effort, fall back to returning `None` always (frontend uses emoji) and note it. Do NOT spend excessive time; correctness > completeness here.
- [ ] **Step 3: Commit** `feat(icons): file-type icons via SHGetFileInfo (PNG), emoji fallback`.

## Task 4: Frontend Thumbnail component

**Files:** Create `src/components/Thumbnail.tsx`; Modify view components.

- [ ] **Step 1: Thumbnail** — create `src/components/Thumbnail.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Entry } from '../types';

const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
const TYPE_EMOJI: Record<string, string> = {
  pdf: '📄', txt: '📄', md: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
  ppt: '📽️', pptx: '📽️', zip: '🗜️', rar: '🗜️', '7z': '🗜️', mp3: '🎵', wav: '🎵',
  mp4: '🎬', mkv: '🎬', mov: '🎬', exe: '⚙️', json: '📄',
};

export function Thumbnail({ entry, size }: { entry: Entry; size: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ext = entry.ext.toLowerCase();
    const isImg = IMG_EXT.includes(ext);
    const cmd = isImg ? 'get_thumbnail' : 'get_icon';
    invoke<string | null>(cmd, isImg ? { path: entry.path, size } : { path: entry.path, size: 32 })
      .then((d) => { if (!cancelled && d) setSrc(`data:image/png;base64,${d}`); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [entry.path, entry.ext, size]);

  if (src) return <img className="thumb-img" src={src} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />;
  return <span style={{ fontSize: size }}>{entry.isDir ? '📁' : (TYPE_EMOJI[entry.ext.toLowerCase()] ?? '📄')}</span>;
}
```
- [ ] **Step 2: Use in views** — in DetailsView/IconsView/ListView/TilesView/ContentView replace the `icon(item)` emoji span with `<Thumbnail entry={item} size={N} />` (N: Details 16, Icons = `s.font`, List 16, Tiles 40, Content 36). Keep double-click/open handlers. (For IconsView pass `size={s.font}`.)
- [ ] **Step 3:** `npx tsc --noEmit`; `pnpm run build`. (No new test; visual.)
- [ ] **Step 4: Commit** `feat(ui): Thumbnail component (image thumbnails + type icons)`.

## Task 5: Right-click context menu

**Files:** Create `src/components/ContextMenu.tsx` (replace stub); Modify `src/App.tsx`, `src/styles/win11.css`.

- [ ] **Step 1: ContextMenu** — replace `src/components/ContextMenu.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useSelectionStore } from '../state/selectionStore';
import { useClipboardStore } from '../state/clipboardStore';
import { useLocationStore } from '../state/locationStore';
import { useFileOps } from '../hooks/useFileOps';
import { openItem } from '../utils/open';
import type { Entry } from '../types';

interface Pos { x: number; y: number; }

export function ContextMenu({ entries }: { entries: Entry[] }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const sel = useSelectionStore((s) => s.selected);
  const ops = useFileOps();
  const path = useLocationStore((s) => s.path);

  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.main-view')) {
        e.preventDefault();
        setPos({ x: e.clientX, y: e.clientY });
      }
    };
    const onClick = () => setPos(null);
    document.addEventListener('contextmenu', onMenu);
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('contextmenu', onMenu); document.removeEventListener('click', onClick); };
  }, []);

  // ensure the clicked item is selected before showing menu
  useEffect(() => {
    if (!pos) return;
    const target = document.elementFromPoint(pos.x, pos.y)?.closest('[data-path]') as HTMLElement | null;
    if (target?.dataset.path && !sel.includes(target.dataset.path)) {
      const en = entries.find((e) => e.path === target.dataset.path);
      if (en) useSelectionStore.getState().select([en]);
    }
  }, [pos]); // eslint-disable-line

  if (!pos) return null;
  const selEntries = entries.filter((e) => sel.includes(e.path));
  const hasSel = selEntries.length > 0;
  const item = (label: string, fn: () => void, disabled = false) => (
    <li className={`cm-item${disabled ? ' disabled' : ''}`} onClick={() => { if (!disabled) { fn(); setPos(null); } }}>{label}</li>
  );
  return (
    <ul className="context-menu" style={{ left: pos.x, top: pos.y }}>
      {hasSel && item('打开', () => selEntries.forEach((e) => e.isDir ? useLocationStore.getState().navigate(e.path) : openItem(e.path)))}
      {!hasSel && item('查看', () => {}, false)}
      {item('剪切', () => useClipboardStore.getState().cut(selEntries), !hasSel)}
      {item('复制', () => useClipboardStore.getState().copy(selEntries), !hasSel)}
      {item('粘贴', () => ops.paste(path))}
      {item('重命名', () => window.dispatchEvent(new CustomEvent('lepton:rename', { detail: sel[0] })), sel.length !== 1)}
      {item('删除', () => ops.remove(sel, false), !hasSel)}
      <li className="cm-sep" />
      {item('显示更多选项', () => {})}
    </ul>
  );
}
```
NOTE: requires items to carry `data-path` so right-click selects the right one. Add `data-path={item.path}` to each row/tile in the views (DetailsView/IconsView/ListView/TilesView/ContentView) alongside the existing className.
- [ ] **Step 2: App wiring** — in App.tsx: change `<ContextMenu />` to `<ContextMenu entries={entries} />` (pass entries). The stub is replaced.
- [ ] **Step 3: CSS** — add:
```css
.context-menu { position: fixed; z-index: 1000; list-style: none; background: var(--main-bg); border: 1px solid var(--border); border-radius: 8px; padding: 6px; min-width: 200px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); font-size: 13px; }
.cm-item { padding: 8px 12px; border-radius: 4px; cursor: pointer; }
.cm-item:hover:not(.disabled) { background: var(--hover-bg); }
.cm-item.disabled { color: var(--text-sub); cursor: default; }
.cm-sep { height: 1px; background: var(--border); margin: 4px 0; }
.thumb-img { display: block; }
```
- [ ] **Step 4: add data-path to views** (DetailsView row div, IconsView tile div, ListView/ContentView/TilesView row divs): `data-path={item.path}`.
- [ ] **Step 5:** `npx tsc --noEmit`; `pnpm test` (existing green); `pnpm run build`.
- [ ] **Step 6: Commit** `feat(ui): Win11-style right-click context menu + data-path on rows`.

## Task 6: Watch wiring in App + exe build

- [ ] **Step 1: App** — add a `useEffect([path])` that calls `invoke('watch_directory', { path })` when path is non-empty; add a listener for the `fs-changed` Tauri event that bumps refreshKey when the event's path equals current path. Use `import { listen } from '@tauri-apps/api/event';`.
```tsx
useEffect(() => {
  if (!path) return;
  invoke('watch_directory', { path });
  const un = listen<string>('fs-changed', (e) => { if (e.payload === path) setRefreshKey((k) => k + 1); });
  return () => { un.then((u) => u()); };
}, [path]);
```
- [ ] **Step 2:** `npx tsc --noEmit`; `pnpm test`; `pnpm run build`.
- [ ] **Step 3: Release exe** — kill any running lepton-explorer.exe; `pnpm tauri build` → exe + bundles (exit 0). Launch the exe; confirm it opens, lists files, shows image thumbnails + type icons, right-click shows the menu, and creating/deleting a file externally refreshes the view.
- [ ] **Step 4: Commit** any fixes.

## Definition of Done (Phase 1c)
- cargo test green, pnpm test green, tsc clean, build ok, release exe builds + runs.
- Image thumbnails render; file-type icons render (or emoji fallback); right-click context menu works (cut/copy/paste/rename/delete/open); external FS changes auto-refresh the view.

## Self-Review
- Watching (T1), thumbnails (T2), icons (T3), Thumbnail component (T4), context menu (T5), wiring+exe (T6). Shell-icon interop may fall back to emoji — acceptable, noted. data-path added for context-menu selection.
