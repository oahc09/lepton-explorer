import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useHistoryStore } from './historyStore';

beforeEach(() => useHistoryStore.setState({ undoStack: [], redoStack: [] }));

describe('historyStore', () => {
  it('push then undo calls the entry undo and enables redo', async () => {
    const undo = vi.fn().mockResolvedValue(undefined);
    const redo = vi.fn().mockResolvedValue(undefined);
    useHistoryStore.getState().push({ label: 'rename', undo, redo });
    await useHistoryStore.getState().undo();
    expect(undo).toHaveBeenCalledOnce();
    expect(useHistoryStore.getState().canUndo()).toBe(false);
    expect(useHistoryStore.getState().canRedo()).toBe(true);
  });
  it('redo calls redo and restores undoability', async () => {
    const undo = vi.fn().mockResolvedValue(undefined);
    const redo = vi.fn().mockResolvedValue(undefined);
    useHistoryStore.getState().push({ label: 'x', undo, redo });
    await useHistoryStore.getState().undo();
    await useHistoryStore.getState().redo();
    expect(redo).toHaveBeenCalledOnce();
    expect(useHistoryStore.getState().canUndo()).toBe(true);
  });
  it('push clears the redo stack', () => {
    useHistoryStore.getState().push({ label: 'a', undo: async () => {}, redo: async () => {} });
    useHistoryStore.getState().push({ label: 'b', undo: async () => {}, redo: async () => {} });
    expect(useHistoryStore.getState().undoStack).toHaveLength(2);
    expect(useHistoryStore.getState().redoStack).toHaveLength(0);
  });
  it('undo then new push clears the redo stack', async () => {
    const mk = (n: string) => ({ label: n, undo: async () => {}, redo: async () => {} });
    useHistoryStore.getState().push(mk('a'));
    await useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().canRedo()).toBe(true);
    useHistoryStore.getState().push(mk('b'));
    expect(useHistoryStore.getState().canRedo()).toBe(false);
  });
});
