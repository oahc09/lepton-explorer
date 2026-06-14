# WinFinder

A replica of the **Windows 11 File Explorer**, built with **Tauri v2** (Rust backend) + **React + TypeScript**. Runs on Windows 10 and Windows 11.

![status](https://img.shields.io/badge/status-feature--complete-brightgreen) ![tests](https://img.shields.io/badge/tests-171%20passing-brightgreen) ![build](https://img.shields.io/badge/exe-windows%20x64-blue)

## What it does

A fully usable file manager matching Win11 Explorer's layout and behavior:

- **8 view modes** — extra-large / large / medium / small icons, list, details, tiles, content
  (switch via the View ▾ flyout, the status-bar slider, `Ctrl+Shift+1–8`, or `Ctrl+scroll`)
- **Navigation** — breadcrumb (segment click + edit mode), This PC + Quick access nav pane,
  back/forward/up, refresh (`F5`), `Backspace`=back, `Alt+←/→/↑` (back/forward/up),
  address focus (`Ctrl+L`/`Alt+D`/`F4`), pane-focus cycling (`F6`/`Shift+F6`),
  **Home page** with special folders + recent files
- **Tabs** — `Ctrl+T`/`W`/`Tab`/`1–9`, middle-click folder=open-in-new-tab, middle-click tab=close,
  drag-to-reorder, context-menu "open in new tab"
- **Multi-window** — `Ctrl+N` new window, `Ctrl+W` close (last tab/window closes the app)
- **File operations** — new folder/file, rename (`F2`, inline), copy (with a **cancelable progress dialog**),
  cut/paste (recursive, cross-volume, **replace/skip/keep-both conflict dialog** on collision),
  delete-to-recycle, permanent delete (`Shift+Del`), open-in-default-app, **undo/redo** (`Ctrl+Z`/`Y`)
- **Selection** — click / `Ctrl` / `Shift` / `Ctrl+A`, arrow-key navigation (`↑↓`+`Enter`),
  rubber-band marquee in icon views
- **Richness** — image thumbnails + system file-type icons (`SHGetFileInfo`), **live
  file-watching** (auto-refresh), **right-click context menu** (`Shift+F10`), **search**
  (`Ctrl+E`/`F`), **properties** (`Alt+Enter`), **preview pane** (`Alt+P`) + **details pane**
  (`Alt+Shift+P`)
- **Quick access** — pin/unpin folders (persisted), cross-window synced
- **Chrome** — custom Mica title bar, light/dark theme (follows system), `F11` fullscreen,
  View→Show toggles (hidden items / file extensions), details column resize, sort arrows, + show/hide columns

## Build & run

Requirements: Windows 10/11, Rust (MSVC), Node 20+, pnpm, WebView2.

```bash
pnpm install          # one-time
pnpm tauri dev        # run the dev app
pnpm tauri build      # release build → src-tauri/target/release/winfinder.exe + installers
```

Artifacts: `src-tauri/target/release/winfinder.exe` (standalone), plus `bundle/msi/*.msi`
and `bundle/nsis/*-setup.exe` installers.

## Test

```bash
cd src-tauri && cargo test   # Rust unit tests (42)
pnpm test                    # frontend tests (129)
npx tsc --noEmit             # type-check
```

## Architecture

```
Rust backend (src-tauri/src/)         Frontend (src/)
  lib.rs        commands + run()        App.tsx          shell + shortcuts + wiring
  fs_ops.rs     list/search/folder_size state/           locationStore(tabs), viewStore,
  ops.rs        create/copy/move/delete                  selectionStore, clipboardStore,
  special.rs    special folders/drives                    historyStore, searchStore,
  watch.rs      live FS watching                          pinnedStore, recentStore
  thumbnails.rs image thumbnails + icons hooks/           useDirectory, useFileOps
  error.rs      AppError (serde {kind,msg}) components/   TitleBar, TabBar, Toolbar,
                                                       Breadcrumb, NavPane, CommandBar,
                                                       FileList + 8 views, ContextMenu,
                                                       PropertiesDialog, PreviewPane, …
```

All filesystem access is behind typed Tauri commands; the frontend never touches the disk.
The wire contract is camelCase (locked by a regression test).

## Documentation

- Design spec: `docs/superpowers/specs/2026-06-13-winfinder-design.md`
- Implementation plans: `docs/superpowers/plans/`
- Acceptance: `docs/acceptance/` (dataset, reference procedure, checklist, Win11 visual spec)

## Known limitations

- Delete is not undoable (recycle-bin restore is unreliable across the `trash` crate).
- **Replace-mode** paste undo doesn't auto-restore the overwritten original — it's sent to the recycle
  bin, so it's recoverable there but not via Ctrl+Z. (Keep-both/skip undo fully.)
- Copy, cross-volume move, and redo all show a cancelable progress dialog (same-volume move is an instant rename).
- "Show more options" context-menu item is a placeholder (real shell menu not wired).
- §11 visual zero-deviation acceptance requires real Win11 baseline screenshots (user step).
