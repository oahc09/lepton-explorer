import { describe, it, expect } from 'vitest';
import { displayName } from './display';
import type { Entry } from '../types';

const e = (name: string, ext: string): Entry => ({ name, path: 'C:\\' + name, isDir: false, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: '', ext, isHidden: false, isSystem: false, isReadOnly: false });

describe('displayName', () => {
  it('hides extension when showExtensions is false', () => {
    expect(displayName(e('a.txt', 'txt'), false)).toBe('a');
  });
  it('shows extension when showExtensions is true', () => {
    expect(displayName(e('a.txt', 'txt'), true)).toBe('a.txt');
  });
  it('leaves extensionless names unchanged', () => {
    expect(displayName(e('README', ''), false)).toBe('README');
  });
  it('strips only the last extension for multi-dot names', () => {
    expect(displayName(e('archive.tar.gz', 'gz'), false)).toBe('archive.tar');
  });
});
