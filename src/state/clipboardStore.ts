import { create } from 'zustand';
import type { Entry } from '../types';

export type ClipboardMode = 'copy' | 'cut';

interface ClipboardState {
  items: Entry[];
  mode: ClipboardMode;
  copy: (items: Entry[]) => void;
  cut: (items: Entry[]) => void;
  clear: () => void;
}

export const useClipboardStore = create<ClipboardState>((set) => ({
  items: [],
  mode: 'copy',
  copy: (items) => set({ items, mode: 'copy' }),
  cut: (items) => set({ items, mode: 'cut' }),
  clear: () => set({ items: [], mode: 'copy' }),
}));
