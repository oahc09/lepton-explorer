import { describe, it, expect, beforeEach } from 'vitest';
import { useTagStore, TAG_HEX, TAG_COLORS } from './tagStore';

beforeEach(() => useTagStore.setState({ tags: {} }));

describe('tagStore', () => {
  it('setTag assigns a color to a path', () => {
    useTagStore.getState().setTag('C:\\a.txt', 'red');
    expect(useTagStore.getState().tags['C:\\a.txt']).toBe('red');
  });

  it('clearTag removes the path only', () => {
    useTagStore.getState().setTag('C:\\a.txt', 'blue');
    useTagStore.getState().setTag('C:\\b.txt', 'green');
    useTagStore.getState().clearTag('C:\\a.txt');
    expect(useTagStore.getState().tags['C:\\a.txt']).toBeUndefined();
    expect(useTagStore.getState().tags['C:\\b.txt']).toBe('green');
  });

  it('clearTag on an untagged path is a no-op', () => {
    useTagStore.getState().clearTag('C:\\never');
    expect(Object.keys(useTagStore.getState().tags)).toHaveLength(0);
  });

  it('every tag color has a hex mapping', () => {
    for (const c of TAG_COLORS) {
      expect(TAG_HEX[c.key]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
