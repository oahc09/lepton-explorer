import { create } from 'zustand';

/**
 * Copy-progress dialog state. `open()` shows the dialog (reset); the
 * ProgressModal listens to the `fs-copy-progress` event and calls `update()`;
 * `close()` hides it when the copy completes.
 */
interface ProgressState {
  active: boolean;
  current: number;
  total: number;
  file: string;
  open: () => void;
  update: (current: number, total: number, file: string) => void;
  close: () => void;
}

export const useProgressStore = create<ProgressState>((set) => ({
  active: false,
  current: 0,
  total: 0,
  file: '',
  open: () => set({ active: true, current: 0, total: 0, file: '' }),
  update: (current, total, file) => set({ current, total, file }),
  close: () => set({ active: false }),
}));
