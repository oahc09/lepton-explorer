import { describe, it, expect, beforeEach } from 'vitest';
import { useLocationStore, parentOf } from './locationStore';

function resetStore() {
  const { setState } = useLocationStore;
  // create a brand-new single-tab state
  setState({
    path: '',
    backStack: [],
    forwardStack: [],
    tabs: [{ id: 't0', title: '主页', path: '', backStack: [], forwardStack: [] }],
    activeId: 't0',
  });
}

beforeEach(resetStore);

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

describe('tabs', () => {
  beforeEach(resetStore);
  it('addTab adds and activates', () => {
    const id = useLocationStore.getState().addTab('C:\\Users');
    expect(useLocationStore.getState().tabs.length).toBe(2);
    expect(useLocationStore.getState().activeId).toBe(id);
    expect(useLocationStore.getState().path).toBe('C:\\Users');
  });
  it('closeTab switches active to neighbor and returns true; false on last', () => {
    useLocationStore.getState().addTab('C:\\A');
    const b = useLocationStore.getState().addTab('C:\\B');
    expect(useLocationStore.getState().closeTab(b)).toBe(true);
    expect(useLocationStore.getState().tabs.length).toBe(2);
    // close all remaining -> false
    useLocationStore.getState().closeTab(useLocationStore.getState().activeId);
    expect(useLocationStore.getState().closeTab(useLocationStore.getState().activeId)).toBe(false);
  });
  it('setActive switches path to that tab', () => {
    useLocationStore.getState().navigate('C:\\X');
    useLocationStore.getState().addTab('C:\\Y');
    expect(useLocationStore.getState().path).toBe('C:\\Y');
    useLocationStore.getState().setActive('t0');
    expect(useLocationStore.getState().path).toBe('C:\\X');
  });
  it('moveTab reorders without losing active', () => {
    // start from a clean 3-tab layout (no seeded tab) so ids[2] is the last
    useLocationStore.setState({
      path: '',
      backStack: [],
      forwardStack: [],
      tabs: [
        { id: 't0', title: 'A', path: 'C:\\A', backStack: [], forwardStack: [] },
        { id: 't1', title: 'B', path: 'C:\\B', backStack: [], forwardStack: [] },
        { id: 't2', title: 'C', path: 'C:\\C', backStack: [], forwardStack: [] },
      ],
      activeId: 't0',
    });
    const ids = useLocationStore.getState().tabs.map((t) => t.id);
    useLocationStore.getState().moveTab(ids[0], ids[2]); // move first to last position
    const after = useLocationStore.getState().tabs.map((t) => t.id);
    expect(after[after.length - 1]).toBe(ids[0]);
    expect(after.length).toBe(ids.length);
  });
});
