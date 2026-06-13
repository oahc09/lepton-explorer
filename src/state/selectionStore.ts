import { create } from 'zustand';
import type { Entry } from '../types';

interface SelectionState {
  selected: string[];
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
