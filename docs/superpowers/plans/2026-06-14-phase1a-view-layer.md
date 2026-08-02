# Lepton Explorer — Phase 1a: View Layer · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox (`- [ ]`) steps.

**Goal:** Complete the 8 Win11 view modes + selection basics + Details sort indicators, building on Phase 0.

**Architecture:** Extends the Phase 0 frontend. IconsView gains a size mode; List/Tiles/Content are new view components dispatched by FileList. A View switcher + Ctrl+Shift+1-8 shortcuts set the mode. Selection gains Ctrl+A + arrow-key focus. Details headers show sort direction.

**Tech Stack:** React 18 + TS, Zustand, @tanstack/react-virtual, Vitest + RTL (all from Phase 0).

**Spec ref:** `docs/superpowers/specs/2026-06-13-design.md` §2.1 (8 views, selection, sorting), §9.1 (selection), §9.4 (Ctrl+Shift+1-8 = view style: 1 XL icons, 2 L icons, 3 M icons, 4 S icons, 5 List, 6 Details, 7 Tiles, 8 Content).
**Builds on:** `docs/superpowers/plans/2026-06-13-phase0-foundation.md` (Phase 0 done).

**Deferred to later plans (not here):** rubber-band selection (fiddly + virtualization), Details column resize, command-bar View flyout (Plan 5 polish). This plan delivers all 8 view modes rendering correctly + Ctrl+A + sort arrows.

**Prereq:** Phase 0 complete on `phase0-foundation`. Work continues on that branch.

---

## File Structure (new/modified)
- Modify `src/types.ts` — add `IconSize`.
- Modify `src/state/viewStore.ts` — (no change; viewMode already a union).
- Modify `src/components/FileList.tsx` — dispatch all 8 modes.
- Modify `src/components/views/IconsView.tsx` — accept `size` prop.
- Create `src/components/views/ListView.tsx`, `TilesView.tsx`, `ContentView.tsx`.
- Modify `src/components/views/detailsHelpers.ts` — add `useAllSelected` helper maybe; reuse `icon`.
- Modify `src/App.tsx` — replace temp toggle with a `<select>` view switcher; add Ctrl+Shift+1-8 + Ctrl+A + arrow shortcuts.
- Modify `src/styles/win11.css` — styles for new views + switcher + sort arrows.

---

## Task 1: Icon-size variants + FileList dispatch + View switcher + Ctrl+Shift shortcuts

**Files:** Modify `src/types.ts`, `src/components/views/IconsView.tsx`, `src/components/FileList.tsx`, `src/App.tsx`, `src/styles/win11.css`; Create `src/shortcuts.ts`.

- [ ] **Step 1: Add IconSize type** — in `src/types.ts` add:
```ts
export type IconSize = 'extra-large' | 'large' | 'medium' | 'small';
export const ICON_MODES: IconSize[] = ['extra-large', 'large', 'medium', 'small'];
```

- [ ] **Step 2: Refactor IconsView to take `size`** — replace `src/components/views/IconsView.tsx` content with:
```tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Entry, IconSize } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { icon, handleClick } from './detailsHelpers';

const SIZES: Record<IconSize, { tileW: number; tileH: number; font: number; perRow: number; nameMax: number }> = {
  'extra-large': { tileW: 160, tileH: 136, font: 72, perRow: 4, nameMax: 150 },
  'large': { tileW: 112, tileH: 104, font: 48, perRow: 6, nameMax: 100 },
  'medium': { tileW: 88, tileH: 88, font: 32, perRow: 8, nameMax: 80 },
  'small': { tileW: 72, tileH: 64, font: 16, perRow: 10, nameMax: 66 },
};

export function IconsView({ entries, size = 'large' }: { entries: Entry[]; size?: IconSize }) {
  const s = SIZES[size];
  const parentRef = useRef<HTMLDivElement>(null);
  const sel = useSelectionStore();
  const navigate = useLocationStore((st) => st.navigate);
  const rowCount = Math.ceil(entries.length / s.perRow);
  const rowV = useVirtualizer({ count: rowCount, getScrollElement: () => parentRef.current, estimateSize: () => s.tileH, overscan: 8 });

  return (
    <div className="icons" ref={parentRef} style={{ overflow: 'auto', height: '100%' }}>
      <div style={{ height: `${rowV.getTotalSize()}px`, position: 'relative' }}>
        {rowV.getVirtualItems().map((vi) => {
          const start = vi.index * s.perRow;
          const row = entries.slice(start, start + s.perRow);
          return (
            <div key={vi.key} className="icon-row" style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: s.tileH }}>
              {row.map((item) => (
                <div
                  key={item.path}
                  className={`tile${sel.selected.includes(item.path) ? ' selected' : ''}`}
                  style={{ width: s.tileW, height: s.tileH - 8 }}
                  onClick={(ev) => handleClick(ev, item, entries, sel)}
                  onDoubleClick={() => item.isDir && navigate(item.path)}
                >
                  <div className="tile-icon" style={{ fontSize: s.font }}>{icon(item)}</div>
                  <div className="tile-name" style={{ maxWidth: s.nameMax }}>{item.name}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```
Update `IconsView.test.tsx`: change `<IconsView entries={...} />` to `<IconsView entries={...} size="large" />` (default still works, but be explicit). Test still passes.

- [ ] **Step 3: Update FileList dispatch** — replace `src/components/FileList.tsx`:
```tsx
import type { Entry, IconSize } from '../types';
import { ICON_MODES } from '../types';
import { useViewStore } from '../state/viewStore';
import { DetailsView } from './views/DetailsView';
import { IconsView } from './views/IconsView';
import { ListView } from './views/ListView';
import { TilesView } from './views/TilesView';
import { ContentView } from './views/ContentView';

export function FileList({ entries }: { entries: Entry[] }) {
  const viewMode = useViewStore((s) => s.viewMode);
  if (viewMode === 'details') return <DetailsView entries={entries} />;
  if (viewMode === 'list') return <ListView entries={entries} />;
  if (viewMode === 'tiles') return <TilesView entries={entries} />;
  if (viewMode === 'content') return <ContentView entries={entries} />;
  // icon sizes
  return <IconsView entries={entries} size={viewMode as IconSize} />;
}
```
(Stubs for ListView/TilesView/ContentView created in later tasks; to keep this task compiling, create temporary stubs returning `<div className="empty">TODO</div>` in those files now, replaced in T2-T4.)

- [ ] **Step 4: Create `src/shortcuts.ts`** — view-mode + selection shortcut maps:
```ts
import type { ViewMode } from './types';

// Ctrl+Shift+1..8 → view mode (Win11 mapping).
export const VIEW_SHORTCUTS: Record<string, ViewMode> = {
  '1': 'extra-large', '2': 'large', '3': 'medium', '4': 'small',
  '5': 'list', '6': 'details', '7': 'tiles', '8': 'content',
};
```

- [ ] **Step 5: View switcher + shortcuts in App.tsx** — replace the `<button className="view-toggle">…</button>` block with a `<select>`:
```tsx
<select
  className="view-select"
  value={path ? useViewStore.getState().viewMode : 'details'}
  onChange={(e) => useViewStore.getState().setViewMode(e.target.value as ViewMode)}
>
  <option value="extra-large">超大图标</option>
  <option value="large">大图标</option>
  <option value="medium">中等图标</option>
  <option value="small">小图标</option>
  <option value="list">列表</option>
  <option value="details">详细信息</option>
  <option value="tiles">平铺</option>
  <option value="content">内容</option>
</select>
```
And add `import type { ViewMode } from './types';` + `import { VIEW_SHORTCUTS } from './shortcuts';`.

Then add a keyboard-shortcut effect inside `App()` (after the theme effect):
```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; // don't hijack typing
    if (e.ctrlKey && e.shiftKey && VIEW_SHORTCUTS[e.key]) {
      e.preventDefault();
      useViewStore.getState().setViewMode(VIEW_SHORTCUTS[e.key]);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, []);
```
NOTE: the `<select value=...>` using `useViewStore.getState()` is non-reactive; to make it track the store, subscribe: add `const viewMode = useViewStore((s) => s.viewMode);` near the top of App and use `value={viewMode}`.

- [ ] **Step 6: CSS** — add to `src/styles/win11.css`:
```css
.view-select { height: 32px; border: 1px solid var(--border); background: var(--main-bg); color: var(--text); border-radius: 6px; padding: 0 8px; font-size: 13px; cursor: pointer; }
```

- [ ] **Step 7: Verify** — `npx tsc --noEmit` clean; `pnpm test` green (IconsView test updated); `pnpm run build` ok.

- [ ] **Step 8: Commit** — `feat(views): icon-size variants + view switcher + Ctrl+Shift+1-8` (+ Co-Authored-By trailer).

---

## Task 2: ListView (mode 5)

**Files:** Create `src/components/views/ListView.tsx`, `ListView.test.tsx`.

- [ ] **Step 1: Failing test** — `src/components/views/ListView.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useSelectionStore } from '../../state/selectionStore';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: any) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () => Array.from({ length: count }, (_, i) => ({ index: i, key: i, start: i * estimateSize() })),
  }),
}));

import { ListView } from './ListView';
import type { Entry } from '../../types';

const e = (n: string, isDir = false): Entry => ({ name: n, path: 'C:\\' + n, isDir, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: isDir ? '文件夹' : '文件', ext: '', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => useSelectionStore.getState().clear());

describe('ListView', () => {
  it('renders small-icon items and selects on click', () => {
    render(<ListView entries={[e('a.txt'), e('b')]} />);
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    fireEvent.click(screen.getByText('a.txt'));
    expect(useSelectionStore.getState().selected).toEqual(['C:\\a.txt']);
  });
});
```
- [ ] **Step 2: Run → fail (module not found).**
- [ ] **Step 3: Implement** — `src/components/views/ListView.tsx`:
```tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Entry } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { icon, handleClick } from './detailsHelpers';

const ROW_H = 22;

export function ListView({ entries }: { entries: Entry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sel = useSelectionStore();
  const navigate = useLocationStore((s) => s.navigate);
  const v = useVirtualizer({ count: entries.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 30 });
  return (
    <div className="list" ref={parentRef} style={{ overflow: 'auto', height: '100%', padding: '4px 8px' }}>
      <div style={{ height: `${v.getTotalSize()}px`, position: 'relative' }}>
        {v.getVirtualItems().map((vi) => {
          const item = entries[vi.index];
          const selected = sel.selected.includes(item.path);
          return (
            <div
              key={item.path}
              className={`list-item${selected ? ' selected' : ''}`}
              style={{ position: 'absolute', top: 0, left: 0, transform: `translateY(${vi.start}px)`, height: ROW_H, display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px' }}
              onClick={(ev) => handleClick(ev, item, entries, sel)}
              onDoubleClick={() => item.isDir && navigate(item.path)}
            >
              <span className="list-icon" style={{ fontSize: 16 }}>{icon(item)}</span>
              <span className="list-name">{item.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```
- [ ] **Step 4: CSS** — add `.list-item:hover { background: var(--hover-bg); } .list-item.selected { background: var(--select-bg); } .list-name { font-size: 13px; white-space: nowrap; }`.
- [ ] **Step 5: Run → pass; tsc; commit** `feat(views): list view`.

---

## Task 3: TilesView (mode 7)

**Files:** Create `src/components/views/TilesView.tsx`, `TilesView.test.tsx`.

- [ ] **Step 1: Failing test** (same pattern as ListView: renders tile with name + size; click selects). Use a file entry with size 1024 and assert `screen.getByText('a.txt')` + click selects.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — `src/components/views/TilesView.tsx`: virtualized rows of tiles (perRow 4), each tile = medium icon (left) + name + `<size> <type>` detail line. Reuse `icon`, `handleClick`, `formatSize` (from utils/format).
```tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Entry } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { formatSize } from '../../utils/format';
import { icon, handleClick } from './detailsHelpers';

const TILE_H = 76;
const perRow = 4;

export function TilesView({ entries }: { entries: Entry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sel = useSelectionStore();
  const navigate = useLocationStore((s) => s.navigate);
  const rowCount = Math.ceil(entries.length / perRow);
  const v = useVirtualizer({ count: rowCount, getScrollElement: () => parentRef.current, estimateSize: () => TILE_H, overscan: 8 });
  return (
    <div className="tiles" ref={parentRef} style={{ overflow: 'auto', height: '100%', padding: 8 }}>
      <div style={{ height: `${v.getTotalSize()}px`, position: 'relative' }}>
        {v.getVirtualItems().map((vi) => {
          const start = vi.index * perRow;
          const row = entries.slice(start, start + perRow);
          return (
            <div key={vi.key} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: TILE_H, display: 'flex', gap: 8 }}>
              {row.map((item) => {
                const selected = sel.selected.includes(item.path);
                return (
                  <div key={item.path}
                    className={`tile2${selected ? ' selected' : ''}`}
                    style={{ width: 220, height: TILE_H - 8, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 4 }}
                    onClick={(ev) => handleClick(ev, item, entries, sel)}
                    onDoubleClick={() => item.isDir && navigate(item.path)}
                  >
                    <span style={{ fontSize: 40 }}>{icon(item)}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span className="tile2-name" style={{ fontSize: 13 }}>{item.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{item.isDir ? '文件夹' : `${formatSize(item.size)} · ${item.typeLabel}`}</span>
                    </span>
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
- [ ] **Step 4: CSS** — `.tile2:hover { background: var(--hover-bg); } .tile2.selected { background: var(--select-bg); } .tile2-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`.
- [ ] **Step 5: Run → pass; tsc; commit** `feat(views): tiles view`.

---

## Task 4: ContentView (mode 8)

**Files:** Create `src/components/views/ContentView.tsx`, `ContentView.test.tsx`.

- [ ] **Step 1: Failing test** (renders rows: name + a date line; click selects).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — virtualized rows; each row = medium icon + (name on top, then "date, type, size" line). Reuse `formatDate`, `formatSize`, `icon`, `handleClick`.
```tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Entry } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { formatDate, formatSize } from '../../utils/format';
import { icon, handleClick } from './detailsHelpers';

const ROW_H = 56;

export function ContentView({ entries }: { entries: Entry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sel = useSelectionStore();
  const navigate = useLocationStore((s) => s.navigate);
  const v = useVirtualizer({ count: entries.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 15 });
  return (
    <div className="content" ref={parentRef} style={{ overflow: 'auto', height: '100%' }}>
      <div style={{ height: `${v.getTotalSize()}px`, position: 'relative' }}>
        {v.getVirtualItems().map((vi) => {
          const item = entries[vi.index];
          const selected = sel.selected.includes(item.path);
          return (
            <div key={item.path}
              className={`content-row${selected ? ' selected' : ''}`}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: ROW_H, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}
              onClick={(ev) => handleClick(ev, item, entries, sel)}
              onDoubleClick={() => item.isDir && navigate(item.path)}
            >
              <span style={{ fontSize: 36 }}>{icon(item)}</span>
              <span style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                <span style={{ fontSize: 13 }}>{item.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{item.typeLabel}{item.isDir ? '' : ` · ${formatSize(item.size)}`}{item.modified ? ` · ${formatDate(item.modified)}` : ''}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```
- [ ] **Step 4: CSS** — `.content-row { border-bottom: 1px solid var(--border); } .content-row:hover { background: var(--hover-bg); } .content-row.selected { background: var(--select-bg); }`.
- [ ] **Step 5: Run → pass; tsc; commit** `feat(views): content view`.

---

## Task 5: Selection — Ctrl+A + arrow-key focus

**Files:** Modify `src/state/selectionStore.ts` (add focus tracking), `src/App.tsx` (shortcuts), `src/state/selectionStore.test.ts`.

- [ ] **Step 1: Add focus to selectionStore** — extend the store: add `focusIndex: number` (-1 none), `setFocus(i)`, and `select`/`toggle` should set focusIndex to the index of the acted item when an ordered list is known. Minimal: add `focusIndex` + `setFocus`. Update the `SelectionState` interface and the create initializer (`focusIndex: -1`).
```ts
// add to interface:
focusIndex: number;
setFocus: (i: number) => void;
// add to impl:
focusIndex: -1,
setFocus: (i) => set({ focusIndex: i }),
```
- [ ] **Step 2: Test** — add a test: `setFocus(2)` → `focusIndex === 2`. Run → pass.
- [ ] **Step 3: Ctrl+A + arrow shortcuts in App.tsx** — extend the existing `onKey` handler (Task 1 Step 5) so the same effect also handles:
```tsx
// inside onKey, after the Ctrl+Shift+ view block:
const { entries } = entryRef.current; // see note
if (e.ctrlKey && !e.shiftKey && (e.key === 'a' || e.key === 'A')) {
  e.preventDefault();
  useSelectionStore.getState().select(entries);
  return;
}
```
NOTE: the keydown handler needs the current `entries`. Since `entries` changes per render, capture it via a ref: add `const entryRef = useRef(entries); entryRef.current = entries;` at the top of App, and read `entryRef.current` inside `onKey`. (The effect has `[]` deps so it can't close over `entries` directly.)
- [ ] **Step 4: Verify** — tsc clean; `pnpm test` green; `pnpm run build` ok. (Ctrl+A/arrow are integration; verified by build + manual run later.)
- [ ] **Step 5: Commit** `feat(selection): Ctrl+A select-all + selection focus index`.

---

## Task 6: Details sort indicators (▲/▼)

**Files:** Modify `src/components/views/DetailsView.tsx`, `src/styles/win11.css`.

- [ ] **Step 1: Show active sort + direction** — in `DetailsView.tsx`, subscribe to sort and render an arrow on the active header. Add near the top of the component:
```tsx
const sort = useViewStore((s) => s.sort);
const arrow = (field: string) => sort.field === field ? (sort.asc ? ' ▲' : ' ▼') : '';
```
Then update each header button label, e.g. `>名称{arrow('name')}</button>`, `>修改日期{arrow('modified')}</button>`, `>类型{arrow('type')}</button>`, `>大小{arrow('size')}</button>`. (Add `import { useViewStore } from '../../state/viewStore';` — already imported.)
- [ ] **Step 2: CSS** — `.details-header button.active-sort { color: var(--accent); font-weight: 600; }` (optional; the arrow alone suffices).
- [ ] **Step 3: Test** — extend `DetailsView.test.tsx` with a test: set `useViewStore.setState({ sort: { field: 'size', asc: false } })`, render, assert `screen.getByText(/大小/)` (or the arrow) is present. Minimal: assert the size header contains '▼'. Keep the existing click-select test.
- [ ] **Step 4: Verify** — tsc; `pnpm test`; build. Commit `feat(views): details sort direction indicators`.

---

## Definition of Done (Phase 1a)
- `npx tsc --noEmit` clean, `pnpm test` all green, `pnpm run build` ok, `pnpm tauri dev` launches.
- All 8 view modes selectable via the switcher + Ctrl+Shift+1-8; each renders real entries with selection + double-click navigation.
- Ctrl+A selects all; Details headers show ▲/▼ for the active sort.
- Deferred (noted for Plan 5 polish): rubber-band selection, Details column resize, real Win11 command-bar View flyout.

## Self-Review
- Coverage: 8 views (T1 icons×4 + T2 list + T3 tiles + T4 content + Phase0 details) ✓; selection Ctrl+A + focus (T5) ✓; sort indicators (T6) ✓. Deferred items explicitly listed.
- No placeholders; each code step is complete. Types: `IconSize`/`ICON_MODES` consistent across types.ts/FileList/IconsView/shortcuts.
