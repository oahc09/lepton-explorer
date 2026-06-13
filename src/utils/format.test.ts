import { describe, it, expect } from 'vitest';
import { formatSize, formatDate } from './format';

describe('formatSize', () => {
  it('bytes under 1024', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1023)).toBe('1023 B');
  });
  it('KB and above', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(1048576)).toBe('1.0 MB');
  });
});

describe('formatDate', () => {
  it('empty for zero', () => {
    expect(formatDate(0)).toBe('');
  });
  it('formats a known timestamp', () => {
    // 2023-11-14 22:13:20 UTC → format depends on TZ; just assert it contains 2023 and :
    const s = formatDate(1700000000000);
    expect(s).toMatch(/2023/);
    expect(s).toMatch(/:/);
  });
});
