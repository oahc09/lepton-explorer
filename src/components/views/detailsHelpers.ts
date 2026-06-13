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
