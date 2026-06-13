import { create } from 'zustand';
import type { ConflictStrategy } from '../types';

/**
 * Pending copy/move conflict awaiting the user's resolution.
 *
 * `ask()` returns a promise that resolves with the chosen strategy, or `null`
 * if the user cancels. The ConflictModal renders while `pending` is set and
 * calls `answer()` to resolve the promise and clear the state.
 */
export interface PendingConflict {
  names: string[];
  resolve: (strategy: ConflictStrategy | null) => void;
}

interface ConflictState {
  pending: PendingConflict | null;
  /** Show the conflict dialog for `names`; resolves on answer (null = cancel). */
  ask: (names: string[]) => Promise<ConflictStrategy | null>;
  /** Resolve the pending conflict and clear it. */
  answer: (strategy: ConflictStrategy | null) => void;
}

export const useConflictStore = create<ConflictState>((set, get) => ({
  pending: null,
  ask: (names) =>
    new Promise<ConflictStrategy | null>((resolve) => {
      set({ pending: { names, resolve } });
    }),
  answer: (strategy) => {
    const p = get().pending;
    if (p) {
      p.resolve(strategy);
      set({ pending: null });
    }
  },
}));
