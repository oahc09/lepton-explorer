import { create } from 'zustand';

/**
 * A lightweight confirm dialog prompt (yes/no). Used for destructive actions
 * such as deleting files, where we want an explicit user confirmation before
 * invoking the backend.
 *
 * `ask()` returns a promise that resolves with `true` (confirm) or `false`
 * (cancel). The ConfirmDialog renders while `pending` is set and calls
 * `answer()` to resolve the promise and clear the state.
 */
export interface PendingConfirm {
  title: string;
  message: string;
  /** Item names to list in the dialog body (optional). */
  names?: string[];
  /** Label for the confirm (danger) button, e.g. "删除". */
  confirmLabel: string;
  /** Render the confirm button as a destructive/red action. */
  danger: boolean;
  resolve: (ok: boolean) => void;
}

interface ConfirmState {
  pending: PendingConfirm | null;
  /** Show the confirm dialog; resolves `true` on confirm, `false` on cancel. */
  ask: (opts: Omit<PendingConfirm, 'resolve'>) => Promise<boolean>;
  /** Resolve the pending confirm and clear it. */
  answer: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  pending: null,
  ask: (opts) =>
    new Promise<boolean>((resolve) => {
      set({ pending: { ...opts, resolve } });
    }),
  answer: (ok) => {
    const p = get().pending;
    if (p) {
      p.resolve(ok);
      set({ pending: null });
    }
  },
}));
