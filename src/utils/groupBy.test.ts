import { describe, it, expect } from 'vitest';
import { groupEntries } from './groupBy';
import type { Entry } from '../types';

const f = (name: string, size = 100, typeLabel = 'TXT 文件'): Entry => ({
  name, path: 'C:\\' + name, isDir: false, size, modified: 1700000000000,
  created: 0, accessed: 0, typeLabel, ext: 'txt', isHidden: false, isSystem: false, isReadOnly: false,
});

describe('groupEntries', () => {
  it('null field → flat rows only, identity rowToFlat', () => {
    const { flat, rowToFlat } = groupEntries([f('a'), f('b')], null);
    expect(flat.every((i) => i.kind === 'row')).toBe(true);
    expect(flat.length).toBe(2);
    expect(rowToFlat).toEqual([0, 1]);
  });

  it('by name → groups by first letter with a header before each group', () => {
    const { flat } = groupEntries([f('apple'), f('banana'), f('apricot')], 'name');
    // group A (apple, apricot), group B (banana)
    const kinds = flat.map((i) => i.kind);
    expect(kinds).toEqual(['group', 'row', 'row', 'group', 'row']);
    expect(flat[0].label).toBe('A');
    expect(flat[3].label).toBe('B');
  });

  it('rowToFlat maps logical row index → flat index (accounts for headers)', () => {
    const { flat, rowToFlat } = groupEntries([f('apple'), f('banana'), f('apricot')], 'name');
    // sorted order: apple, apricot (A), banana (B). flat: [A-header, apple, apricot, B-header, banana]
    expect(flat[rowToFlat[0]].entry!.name).toBe('apple');   // row 0 → flat 1
    expect(flat[rowToFlat[1]].entry!.name).toBe('apricot'); // row 1 → flat 2
    expect(flat[rowToFlat[2]].entry!.name).toBe('banana');  // row 2 → flat 4
  });

  it('by type → groups by typeLabel', () => {
    const { flat } = groupEntries([f('a', 10, 'PNG 图片'), f('b', 10, 'TXT 文件')], 'type');
    expect(flat.filter((i) => i.kind === 'group').length).toBe(2);
  });

  it('group headers are not counted as rows (rowIndex stays sequential)', () => {
    const { flat } = groupEntries([f('apple'), f('banana'), f('cherry')], 'name');
    const rows = flat.filter((i) => i.kind === 'row');
    expect(rows.map((r) => r.rowIndex)).toEqual([0, 1, 2]);
  });

  it('non-letter names fall under the # group', () => {
    const { flat } = groupEntries([f('123.txt'), f('_cache')], 'name');
    const groups = flat.filter((i) => i.kind === 'group');
    expect(groups.every((g) => g.label === '#')).toBe(true);
    expect(groups.length).toBe(1);
  });
});
