import { useMemo } from 'react';
import type { MouseEvent } from 'react';
import type { Entry } from '../../types';
import { useViewStore } from '../../state/viewStore';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';

type SelectionApi = ReturnType<typeof useSelectionStore.getState>;

// Folders first, then by the active sort field (Win11 default). Subscribes to
// viewStore.sort so views re-render when the user clicks a column header.
// Lowercase sort keys are precomputed once per entries array instead of
// allocating two throwaway strings per comparison (O(n log n) allocations).
export function useSorted(entries: Entry[]): Entry[] {
  const sort = useViewStore((s) => s.sort);
  return useMemo(() => {
    const lower = new Map<string, string>();
    for (const e of entries) lower.set(e.path, e.name.toLowerCase());
    const keyOf = (e: Entry) => lower.get(e.path) ?? e.name.toLowerCase();
    const cmp = (a: Entry, b: Entry) => {
      let r = 0;
      if (sort.field === 'name') r = keyOf(a).localeCompare(keyOf(b));
      else if (sort.field === 'modified') r = a.modified - b.modified;
      else if (sort.field === 'size') r = a.size - b.size;
      else r = a.typeLabel.localeCompare(b.typeLabel) || a.ext.localeCompare(b.ext);
      if (sort.field !== 'name') r = r || keyOf(a).localeCompare(keyOf(b));
      return sort.asc ? r : -r;
    };
    return [...entries].sort((a, b) => Number(b.isDir) - Number(a.isDir) || cmp(a, b));
  }, [entries, sort]);
}

export function icon(item: Entry): string {
  return item.isDir ? '📁' : '📄';
}

export function handleClick(ev: MouseEvent, item: Entry, allInOrder: Entry[], sel: SelectionApi) {
  if (ev.ctrlKey) sel.toggle(item);
  else if (ev.shiftKey && sel.anchor) sel.selectRange(allInOrder, item.path);
  else if (ev.detail === 1 && sel.selected.length === 1 && sel.selected[0] === item.path) {
    // Single-click on an already-selected single item → re-enter inline rename
    // (Explorer's slow-click-to-rename, simplified). `detail === 1` excludes the
    // second click of a double-click so open-by-double-click still works.
    window.dispatchEvent(new CustomEvent('lepton:rename', { detail: item.path }));
  }
  else sel.select([item]);
}

export function useOpen() {
  return (item: Entry) => {
    if (item.isDir) useLocationStore.getState().navigate(item.path);
  };
}
