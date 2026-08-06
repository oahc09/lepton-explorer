import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FolderView, Sort, SortField, ViewMode } from '../types';

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
  navPaneWidth: number;
  /** Custom app background color (any CSS color). null = use the theme default. */
  bgColor: string | null;
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
  setNavPaneWidth: (w: number) => void;
  setBgColor: (c: string | null) => void;
  /** Apply per-folder overrides loaded from the backend (no auto-persist). */
  applyFolderOverrides: (fv: FolderView) => void;
}

export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
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
      navPaneWidth: 240,
      bgColor: null,
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
      setNavPaneWidth: (w) => set({ navPaneWidth: Math.max(160, Math.min(480, w)) }),
      setBgColor: (c) => set({ bgColor: c }),
      applyFolderOverrides: (fv) =>
        set({
          viewMode: fv.viewMode,
          sort: { field: fv.sortField, asc: fv.sortAsc },
          colWidths: {
            name: fv.colWidths.name,
            date: fv.colWidths.date,
            type: fv.colWidths.type,
            size: fv.colWidths.size,
          },
        }),
    }),
    {
      name: 'lepton-view',
      partialize: (s) => ({
        navPaneWidth: s.navPaneWidth,
        themeMode: s.themeMode,
        showHidden: s.showHidden,
        showExtensions: s.showExtensions,
        previewPane: s.previewPane,
        detailsPane: s.detailsPane,
        bgColor: s.bgColor,
      }),
    }
  )
);
