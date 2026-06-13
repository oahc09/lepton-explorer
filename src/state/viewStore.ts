import { create } from 'zustand';
import type { Sort, SortField, ViewMode } from '../types';

type ColKey = 'name' | 'date' | 'type' | 'size';

interface ViewState {
  viewMode: ViewMode;
  sort: Sort;
  colWidths: { name: number; date: number; type: number; size: number };
  setViewMode: (m: ViewMode) => void;
  setSort: (field: SortField) => void; // click a column header
  setColWidth: (key: ColKey, w: number) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  viewMode: 'details',
  sort: { field: 'name', asc: true },
  colWidths: { name: 600, date: 180, type: 160, size: 110 },
  setViewMode: (m) => set({ viewMode: m }),
  setSort: (field) =>
    set((s) => ({
      sort:
        s.sort.field === field
          ? { field, asc: !s.sort.asc }
          : { field, asc: true },
    })),
  setColWidth: (key, w) =>
    set((s) => ({ colWidths: { ...s.colWidths, [key]: Math.max(40, w) } })),
}));
