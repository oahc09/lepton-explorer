import { create } from 'zustand';

/**
 * Progress dialog state for long-running file ops (copy / compress / extract).
 * `open(kind)` shows the dialog (reset); the ProgressModal listens to the
 * `fs-copy-progress` / `fs-zip-progress` events and calls `update()`;
 * `close()` hides it when the op completes. `kind` drives the title and which
 * cancel command is invoked.
 */
export type ProgressKind = 'copy' | 'compress' | 'extract';

interface ProgressState {
  active: boolean;
  kind: ProgressKind;
  current: number;
  total: number;
  file: string;
  open: (kind: ProgressKind) => void;
  update: (current: number, total: number, file: string) => void;
  close: () => void;
}

export const useProgressStore = create<ProgressState>((set) => ({
  active: false,
  kind: 'copy',
  current: 0,
  total: 0,
  file: '',
  open: (kind) => set({ active: true, kind, current: 0, total: 0, file: '' }),
  update: (current, total, file) => set({ current, total, file }),
  close: () => set({ active: false }),
}));
