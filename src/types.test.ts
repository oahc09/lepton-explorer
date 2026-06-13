import { describe, it, expect } from 'vitest';
import type { Entry } from './types';

describe('Entry type shape', () => {
  it('compiles with all fields', () => {
    const e: Entry = {
      name: 'a.txt', path: 'C:\\a.txt', isDir: false, size: 1,
      modified: 0, created: 0, accessed: 0, typeLabel: 'TXT 文件',
      ext: 'txt', isHidden: false, isSystem: false, isReadOnly: false,
    };
    expect(e.name).toBe('a.txt');
  });
});
