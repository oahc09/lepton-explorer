import { create } from 'zustand';
import type { Sort, SortField, ViewMode } from '../types';

type ColKey = 'name' | 'date' | 'type' | 'size';
type ColRecord = Record<ColKey, boolean>;

interface ViewState {
  viewMode: ViewMode;
  sort: Sort;
  colWidths: { name: number; date: number; type: number; size: number };
  colVisible: ColRecord;
  groupBy: SortField | null;
  showHidden: boolean;
  showExtensions: boolean;
  previewPane: boolean;
  detailsPane: boolean;
  themeMode: 'auto' | 'light' | 'dark';
  setViewMode: (m: ViewMode) => void;
  setThemeMode: (m: 'auto' | 'light' | 'dark') => void;
  setSort: (field: SortField) => void; // click a column header
  setGroupBy: (field: SortField | null) => void; // Group by ▾ (null = no grouping)
  setColWidth: (key: ColKey, w: number) => void;
  toggleCol: (key: ColKey) => void; // show/hide a details column
  toggleHidden: () => void;
  toggleExtensions: () => void;
  togglePreview: () => void;
  toggleDetails: () => void;
}

export const useViewStore = create<ViewState>((set) => ({
  viewMode: 'details',
  sort: { field: 'name', asc: true },
  colWidths: { name: 300, date: 180, type: 160, size: 110 },
  colVisible: { name: true, date: true, type: true, size: true },
  groupBy: null,
  showHidden: false,
  showExtensions: false,
  previewPane: false,
  detailsPane: false,
  themeMode: 'auto',
  setViewMode: (m) => set({ viewMode: m }),
  setThemeMode: (m) => set({ themeMode: m }),
  setSort: (field) =>
    set((s) => ({
      sort:
        s.sort.field === field
          ? { field, asc: !s.sort.asc }
          : { field, asc: true },
    })),
  setGroupBy: (field) => set({ groupBy: field }),
  setColWidth: (key, w) =>
    set((s) => ({ colWidths: { ...s.colWidths, [key]: Math.max(40, w) } })),
  toggleCol: (key) =>
    set((s) => {
      // Never allow hiding the Name column (Win11 keeps it).
      if (key === 'name') return {};
      return { colVisible: { ...s.colVisible, [key]: !s.colVisible[key] } };
    }),
  toggleHidden: () => set((s) => ({ showHidden: !s.showHidden })),
  toggleExtensions: () => set((s) => ({ showExtensions: !s.showExtensions })),
  togglePreview: () => set((s) => ({ previewPane: !s.previewPane, detailsPane: false })),
  toggleDetails: () => set((s) => ({ detailsPane: !s.detailsPane, previewPane: false })),
}));
