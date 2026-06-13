import { describe, it, expect } from 'vitest';
import { joinPath, pathSegments } from './paths';

describe('paths', () => {
  it('joinPath joins dir + name with a backslash and strips trailing separators', () => {
    expect(joinPath('C:\\Users', 'caosh')).toBe('C:\\Users\\caosh');
    expect(joinPath('C:\\Users\\', 'caosh')).toBe('C:\\Users\\caosh');
    expect(joinPath('C:\\Users/', 'f')).toBe('C:\\Users\\f');
  });
  it('pathSegments splits a Windows path', () => {
    const s = pathSegments('C:\\Users\\caosh');
    expect(s.map((x) => x.name)).toEqual(['C:', 'Users', 'caosh']);
    expect(s[1].path).toBe('C:\\Users');
  });
});
