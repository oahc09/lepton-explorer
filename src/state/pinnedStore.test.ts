import { describe, it, expect, beforeEach } from 'vitest';
import { usePinnedStore } from './pinnedStore';

beforeEach(() => usePinnedStore.setState({ pinned: [] }));

describe('pinnedStore', () => {
  it('pin adds (dedup) and unpin removes', () => {
    usePinnedStore.getState().pin({ name: 'A', path: 'C:\\A' });
    usePinnedStore.getState().pin({ name: 'A', path: 'C:\\A' }); // dedup
    expect(usePinnedStore.getState().pinned).toHaveLength(1);
    expect(usePinnedStore.getState().isPinned('C:\\A')).toBe(true);
    usePinnedStore.getState().unpin('C:\\A');
    expect(usePinnedStore.getState().pinned).toHaveLength(0);
    expect(usePinnedStore.getState().isPinned('C:\\A')).toBe(false);
  });
});
