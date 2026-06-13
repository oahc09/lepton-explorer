import { describe, it, expect, beforeEach } from 'vitest';
import { useSearchStore } from './searchStore';
import type { Entry } from '../types';
const e = (n: string): Entry => ({ name: n, path: 'C:\\' + n, isDir: false, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: '', ext: '', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => useSearchStore.getState().clear());

describe('searchStore', () => {
  it('setQuery/setResults/clear', () => {
    useSearchStore.getState().setQuery('foo');
    expect(useSearchStore.getState().query).toBe('foo');
    useSearchStore.getState().setResults([e('a')]);
    expect(useSearchStore.getState().results).toHaveLength(1);
    useSearchStore.getState().clear();
    expect(useSearchStore.getState().query).toBe('');
    expect(useSearchStore.getState().results).toBeNull();
  });
});
