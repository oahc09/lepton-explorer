# Lepton Explorer

A replica of the **Windows 11 File Explorer**, built with **Tauri v2** (Rust backend) + **React + TypeScript**. Runs on Windows 10 and Windows 11.

![status](https://img.shields.io/badge/status-feature--complete-brightgreen) ![tests](https://img.shields.io/badge/tests-224%20passing-brightgreen) ![build](https://img.shields.io/badge/exe-windows%20x64-blue)

## What it does

A fully usable file manager matching Win11 Explorer's layout and behavior:

- **8 view modes** — extra-large / large / medium / small icons, list, details, tiles, content
  (switch via the View ▾ flyout, the status-bar slider, `Ctrl+Shift+1–8`, or `Ctrl+scroll`)
- **Navigation** — breadcrumb (segment click + edit mode), This PC + Quick access nav pane,
  back/forward/up, refresh (`F5`), `Backspace`=back, `Alt+←/→/↑` (back/forward/up),
  address focus (`Ctrl+L`/`Alt+D`/`F4`, with **path autocomplete**), pane-focus cycling (`F6`/`Shift+F6`),
  **Home page** with special folders + recent files, **Gallery** / **Network** / **OneDrive** roots
- **Tabs** — `Ctrl+T`/`W`/`Tab`/`1–9`, middle-click folder=open-in-new-tab, middle-click tab=close,
  drag-to-reorder, context-menu "open in new tab"
- **Multi-window** — `Ctrl+N` new window, `Ctrl+W` close (last tab/window closes the app)
- **File operations** — new folder/file, rename (`F2`, inline), copy (with a **cancelable progress dialog**),
  cut/paste (recursive, cross-volume, **replace/skip/keep-both conflict dialog** on collision),
  delete-to-recycle (**undoable** via `Ctrl+Z`), permanent delete (`Shift+Del`), open-in-default-app,
  **undo/redo** (`Ctrl+Z`/`Y`)
- **ZIP compress / extract** — right-click "压缩为 ZIP" / "解压到文件夹", cancelable progress,
  **Zip-Slip protection** on extract, auto-named destination (collision-safe ` (n)` suffix)
- **Open With** — "打开方式" dialog enumerating registered apps (registry) + "look for another app"
  (native picker)
- **Per-folder view persistence** — each folder remembers its view mode, sort field/direction, and
  column widths (persisted to app-data)
- **Selection** — click / `Ctrl` / `Shift` / `Ctrl+A`, arrow-key navigation (`↑↓`+`Enter`),
  rubber-band marquee in icon views
- **Richness** — image thumbnails + system file-type icons (`SHGetFileInfo`), **live
  file-watching** (auto-refresh), **right-click context menu** (`Shift+F10`) + **"显示更多选项"**
  (the real Windows shell `IContextMenu` via COM), **search** (`Ctrl+E`/`F`), **properties**
  (`Alt+Enter`), **preview pane** (`Alt+P`) + **details pane** (`Alt+Shift+P`)
- **Quick access** — pin/unpin folders (persisted), cross-window synced
- **Chrome** — custom Mica title bar, light/dark theme (follows system), `F11` fullscreen,
  View→Show toggles (hidden items / file extensions), details column resize, sort arrows, + show/hide columns, group by

## Build & run

### Prerequisites

- **Windows 10 / 11**
- **Rust** toolchain, MSVC target — `rustup default stable-x86_64-pc-windows-msvc`
- **Node.js 20+** and **pnpm**
- **WebView2 Runtime** (preinstalled on Windows 11; Windows 10 may need a manual install)
- **Visual Studio Build Tools** with the *Desktop development with C++* workload (provides the
  linker/Windows SDK that `cargo` needs for the Tauri native binary)

### Install dependencies

```bash
pnpm install          # one-time
```

### Develop

```bash
pnpm tauri dev
```

Runs `beforeDevCommand` (`pnpm dev` → Vite on http://localhost:1420), compiles the Rust backend
in debug, waits for the dev server, then opens the app window. The first build compiles every
Rust dependency and can take several minutes; subsequent runs are incremental and fast.

### Release build

```bash
pnpm tauri build
```

Produces an optimized native binary plus installers:

- Standalone exe — `src-tauri/target/release/lepton-explorer.exe`
- MSI installer — `src-tauri/target/release/bundle/msi/*.msi`
- NSIS installer — `src-tauri/target/release/bundle/nsis/*-setup.exe`

## Test & type-check

```bash
cd src-tauri && cargo test --lib   # Rust unit tests (59 passed, 9 ignored)
pnpm test                          # frontend tests (165 passed)
pnpm exec tsc --noEmit             # TypeScript type-check (0 errors)
```

## Architecture

```
Rust backend (src-tauri/src/)            Frontend (src/)
  lib.rs          commands + run()         App.tsx          shell + shortcuts + wiring
  fs_ops.rs       list/search/folder_size  state/           locationStore(tabs), viewStore
  ops.rs          create/copy/move/delete                   (folder overrides), selectionStore,
                  + conflict strategy                       clipboardStore, historyStore,
                  + tracked progress                        searchStore, pinnedStore,
  zip.rs          ZIP compress/extract                      recentStore, tagStore,
                  (Zip-Slip guard, cancel)                  conflictStore, progressStore
  open_with.rs    Open With (registry)    hooks/           useDirectory, useFileOps
  folder_views.rs per-folder view persist components/      TitleBar, TabBar, Toolbar,
  special.rs      special folders/drives                    Breadcrumb, NavPane, CommandBar,
  network.rs      Network (WNet)                            FileList + 8 views, ContextMenu,
  gallery.rs      Gallery (Pics/Vids)                       OpenWithDialog, PropertiesDialog,
  shell_menu.rs   real shell IContextMenu                   PreviewPane, ProgressModal,
  watch.rs        live FS watching                          ConflictModal, …
  thumbnails.rs   image thumbnails + icons
  office.rs       typed file (docx/xlsx/pptx)
  error.rs        AppError (serde {kind,msg})
```

All filesystem access is behind typed Tauri commands; the frontend never touches the disk.
The wire contract is camelCase (locked by a regression test). Long-running ops (copy / move /
compress / extract) emit `fs-*-progress` events driving a shared cancelable progress dialog.

## Documentation

- Design spec: `docs/superpowers/specs/2026-06-13-lepton-design.md`
- Implementation plans: `docs/superpowers/plans/`
- Performance benchmarks: `docs/PERFORMANCE.md`
- Acceptance: `docs/acceptance/` (dataset, reference procedure, checklist, Win11 visual spec)

## Known limitations

- **Replace-mode** paste undo doesn't auto-restore the overwritten original — it's sent to the
  recycle bin, so it's recoverable there but not via `Ctrl+Z`. (Keep-both/skip undo fully;
  delete-to-trash undo fully.)
- Copy, cross-volume move, ZIP compress/extract, and redo all show a cancelable progress dialog
  (same-volume move is an instant rename). Cancel is honored between and within items.
- §11 visual acceptance: a screenshot comparison was performed — Lepton Explorer's self-captured render
  vs a real Win11 File Explorer screenshot — with **zero deviation on all measured style tokens**
  (accent `#0078D4`, command bar 40px, status bar 24px, button radius 4px, theme, font,
  backgrounds); see `docs/acceptance/section11-comparison.md`. (A pixel check on the user's own
  Win11 with identical content is the optional final confirmation.)
