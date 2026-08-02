import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PinnedItem { name: string; path: string; }

interface PinnedState {
  pinned: PinnedItem[];
  pin: (item: PinnedItem) => void;
  unpin: (path: string) => void;
  isPinned: (path: string) => boolean;
}

export const usePinnedStore = create<PinnedState>()(
  persist(
    (set, get) => ({
      pinned: [],
      pin: (item) => set((s) => (s.pinned.some((p) => p.path === item.path) ? s : { pinned: [...s.pinned, item] })),
      unpin: (path) => set((s) => ({ pinned: s.pinned.filter((p) => p.path !== path) })),
      isPinned: (path) => get().pinned.some((p) => p.path === path),
    }),
    { name: 'lepton-pinned' }
  )
);
