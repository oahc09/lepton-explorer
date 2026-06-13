import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RecentItem { name: string; path: string; }

interface RecentState {
  recent: RecentItem[];
  addRecent: (item: RecentItem) => void;
  clear: () => void;
}

export const useRecentStore = create<RecentState>()(
  persist(
    (set) => ({
      recent: [],
      addRecent: (item) =>
        set((s) => {
          const filtered = s.recent.filter((r) => r.path !== item.path);
          return { recent: [item, ...filtered].slice(0, 20) };
        }),
      clear: () => set({ recent: [] }),
    }),
    { name: 'winfinder-recent' }
  )
);
