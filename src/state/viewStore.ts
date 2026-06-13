import { create } from 'zustand';
import type { Sort, SortField, ViewMode } from '../types';

interface ViewState {
  viewMode: ViewMode;
  sort: Sort;
  setViewMode: (m: ViewMode) => void;
  setSort: (field: SortField) => void; // click a column header
}

export const useViewStore = create<ViewState>((set, get) => ({
  viewMode: 'details',
  sort: { field: 'name', asc: true },
  setViewMode: (m) => set({ viewMode: m }),
  setSort: (field) =>
    set((s) => ({
      sort:
        s.sort.field === field
          ? { field, asc: !s.sort.asc }
          : { field, asc: true },
    })),
}));
