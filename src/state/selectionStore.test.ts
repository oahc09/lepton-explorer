import { describe, it, expect, beforeEach } from 'vitest';
import { useSelectionStore } from './selectionStore';
import type { Entry } from '../types';

const e = (n: string): Entry => ({ name: n, path: 'C:\\' + n, isDir: false, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: '', ext: '', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => useSelectionStore.getState().clear());

describe('selectionStore', () => {
  it('select single', () => {
    useSelectionStore.getState().select([e('a')]);
    expect(useSelectionStore.getState().selected).toEqual(['C:\\a']);
    expect(useSelectionStore.getState().anchor).toBe('C:\\a');
  });
  it('toggle adds/removes', () => {
    useSelectionStore.getState().toggle(e('a'));
    expect(useSelectionStore.getState().selected).toEqual(['C:\\a']);
    useSelectionStore.getState().toggle(e('a'));
    expect(useSelectionStore.getState().selected).toEqual([]);
  });
  it('selectRange from anchor to target inclusive', () => {
    const items = [e('a'), e('b'), e('c')];
    useSelectionStore.getState().select([items[0]]);
    useSelectionStore.getState().selectRange(items, 'C:\\c');
    expect(useSelectionStore.getState().selected.sort()).toEqual(['C:\\a', 'C:\\b', 'C:\\c']);
  });
});
