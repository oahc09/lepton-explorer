import { create } from 'zustand';

export interface HistoryEntry {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface HistoryState {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  push: (e: HistoryEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  push: (e) => set((s) => ({ undoStack: [...s.undoStack, e], redoStack: [] })),
  undo: async () => {
    const stack = get().undoStack;
    if (!stack.length) return;
    const entry = stack[stack.length - 1];
    await entry.undo();
    set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, entry] }));
  },
  redo: async () => {
    const stack = get().redoStack;
    if (!stack.length) return;
    const entry = stack[0];
    await entry.redo();
    set((s) => ({ redoStack: s.redoStack.slice(1), undoStack: [...s.undoStack, entry] }));
  },
  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
}));
