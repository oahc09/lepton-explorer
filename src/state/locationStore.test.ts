import { describe, it, expect, beforeEach } from 'vitest';
import { useLocationStore, parentOf } from './locationStore';

beforeEach(() => useLocationStore.setState({ path: '', backStack: [], forwardStack: [] }));

describe('parentOf', () => {
  it('returns the parent directory', () => {
    expect(parentOf('C:\\Users\\caosh')).toBe('C:\\Users');
  });
  it('returns drive root when already at a top-level path', () => {
    expect(parentOf('C:\\Users')).toBe('C:\\');
  });
  it('returns same drive root when at root', () => {
    expect(parentOf('C:\\')).toBe('C:\\');
  });
});

describe('locationStore navigation', () => {
  it('navigate pushes current path and clears forward stack', () => {
    const s = useLocationStore.getState();
    s.navigate('C:\\Users');
    s.navigate('C:\\Users\\caosh');
    const st = useLocationStore.getState();
    expect(st.path).toBe('C:\\Users\\caosh');
    expect(st.backStack).toEqual(['', 'C:\\Users']);
    expect(st.forwardStack).toEqual([]);
  });
  it('back moves back and pushes forward', () => {
    const s = useLocationStore.getState();
    s.navigate('C:\\A'); s.navigate('C:\\B');
    expect(s.back()).toBe(true);
    expect(useLocationStore.getState().path).toBe('C:\\A');
    expect(useLocationStore.getState().forwardStack).toEqual(['C:\\B']);
  });
  it('back returns false with empty history', () => {
    expect(useLocationStore.getState().back()).toBe(false);
  });
  it('up navigates to parent', () => {
    const s = useLocationStore.getState();
    s.navigate('C:\\Users\\caosh');
    expect(s.up()).toBe(true);
    expect(useLocationStore.getState().path).toBe('C:\\Users');
  });
});
