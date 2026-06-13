import { describe, it, expect, beforeEach } from 'vitest';
import { useConflictStore } from './conflictStore';

beforeEach(() => {
  useConflictStore.setState({ pending: null });
});

describe('conflictStore', () => {
  it('ask sets pending and resolves with the answered strategy', async () => {
    const p = useConflictStore.getState().ask(['a.txt', 'b.txt']);
    expect(useConflictStore.getState().pending).not.toBeNull();
    expect(useConflictStore.getState().pending?.names).toEqual(['a.txt', 'b.txt']);
    useConflictStore.getState().answer('replace');
    expect(await p).toBe('replace');
    expect(useConflictStore.getState().pending).toBeNull();
  });

  it('answer(null) cancels and resolves null', async () => {
    const p = useConflictStore.getState().ask(['a.txt']);
    useConflictStore.getState().answer(null);
    expect(await p).toBeNull();
    expect(useConflictStore.getState().pending).toBeNull();
  });

  it('answer with no pending is a no-op', () => {
    expect(() => useConflictStore.getState().answer('skip')).not.toThrow();
    expect(useConflictStore.getState().pending).toBeNull();
  });
});
