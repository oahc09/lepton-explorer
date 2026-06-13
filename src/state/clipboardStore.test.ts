import { describe, it, expect, beforeEach } from 'vitest';
import { useClipboardStore } from './clipboardStore';
import type { Entry } from '../types';
const e = (n: string): Entry => ({ name: n, path: 'C:\\' + n, isDir: false, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: '', ext: '', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => useClipboardStore.getState().clear());

describe('clipboardStore', () => {
  it('copy stores entries with mode copy', () => {
    useClipboardStore.getState().copy([e('a')]);
    expect(useClipboardStore.getState().items.map((i) => i.path)).toEqual(['C:\\a']);
    expect(useClipboardStore.getState().mode).toBe('copy');
  });
  it('cut stores entries with mode cut', () => {
    useClipboardStore.getState().cut([e('a'), e('b')]);
    expect(useClipboardStore.getState().mode).toBe('cut');
    expect(useClipboardStore.getState().items).toHaveLength(2);
  });
  it('clear empties', () => {
    useClipboardStore.getState().copy([e('a')]);
    useClipboardStore.getState().clear();
    expect(useClipboardStore.getState().items).toEqual([]);
  });
});
