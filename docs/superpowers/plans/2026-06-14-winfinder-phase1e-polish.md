# WinFinder — Phase 1e: Polish & Complete · Implementation Plan

> **For agentic workers:** subagent-driven-development / executing-plans. Checkbox steps.

**Goal:** Close the high-value deferred items to make the clone feel complete: F11 fullscreen, Shift+F10 context menu, Details column resize, a Win11-style View/Sort command-bar flyout, and extra test coverage.

**Builds on:** Phase 0 + 1a/1b/1c/1d on `phase0-foundation`.

**Still deferred (noted, out of scope):** rubber-band selection, delete-to-trash undo (restore), copy/move conflict modal (auto-rename remains — safe), real shell "显示更多选项" menu.

---

## Task 1: F11 fullscreen + Shift+F10 context menu
- [ ] App keydown: `F11` → `getCurrentWindow().toggleMaximize()` is wrong for fullscreen — use `setFullscreen(!isFullscreen)`. Add `const [fs, setFs] = useState(false)` + effect syncing `getCurrentWindow().setFullscreen(fs)`. F11 toggles `fs`.
- [ ] `Shift+F10` in keydown (when selection) → open context menu at the selected row's position: dispatch `winfinder:open-menu` with the selected item's bounding rect; ContextMenu listens and positions there. (Simpler: dispatch with screen-center coords if rect unknown.) Implement a minimal version: Shift+F10 sets the context menu position to the last-focused row center, else viewport center.
- [ ] tsc/test/build; commit.

## Task 2: Details column resize
- [ ] viewStore gains `colWidths: { name: number; date: number; type: number; size: number }` + `setColWidth(key, w)`.
- [ ] DetailsView: header uses `gridTemplateColumns` from colWidths; each header has a right-edge drag handle (`<div className="col-resizer">`) with onMouseDown initiating a drag that updates colWidth on mousemove (window listener), stop on mouseup.
- [ ] CSS `.col-resizer { position:absolute; right:0; top:0; width:6px; height:100%; cursor:col-resize; }`. Rows use the same gridTemplateColumns.
- [ ] tsc/test/build; commit.

## Task 3: Win11 command-bar View/Sort flyouts
- [ ] CommandBar: replace the separate `<select>` view switcher with a "视图 ▾" button opening a flyout listing the 8 modes (radio check on current); add a "排序 ▾" flyout (Name/Date/Type/Size + 升序/降序). Click-outside closes.
- [ ] Keep the existing `<select>` removed from App (the CommandBar owns view/sort now) OR keep both — implement in CommandBar and remove App's select to avoid duplication.
- [ ] CSS: `.flyout { position:absolute; background:var(--main-bg); border:1px solid var(--border); border-radius:8px; padding:6px; min-width:180px; box-shadow:0 8px 24px rgba(0,0,0,.18); z-index:1500; } .flyout-item{padding:8px 12px;border-radius:4px;cursor:pointer;} .flyout-item:hover{background:var(--hover-bg);} .flyout-item.checked::before{content:'✓ '}`.
- [ ] tsc/test/build; commit.

## Task 4: Extra tests
- [ ] `searchStore` test (query/setResults/clear).
- [ ] `clipboardStore` already tested; add `historyStore` redo-after-undo-restores test if missing.
- [ ] A `paths.joinPath` test.
- [ ] tsc/test; commit.

## Task 5: Release exe + final report
- [ ] kill exe; `pnpm tauri build`; launch; verify fullscreen(F11), column resize, view/sort flyouts, Shift+F10 menu all work. Commit.

## Self-Review
- F11/Shift+F10 (T1), column resize (T2), command-bar flyouts (T3), tests (T4), exe (T5). Rubber-band/conflict- modal/delete-undo explicitly out of scope.
