import { describe, it, expect, beforeEach } from 'vitest';
import { useRecentStore } from './recentStore';

beforeEach(() => useRecentStore.setState({ recent: [] }));

describe('recentStore', () => {
  it('prepends, dedups, and caps at 20', () => {
    for (let i = 0; i < 22; i++) useRecentStore.getState().addRecent({ name: `f${i}.txt`, path: `C:\\f${i}.txt` });
    // re-add an existing one -> moves to front, no dup
    useRecentStore.getState().addRecent({ name: 'f5.txt', path: 'C:\\f5.txt' });
    const r = useRecentStore.getState().recent;
    expect(r).toHaveLength(20);
    expect(r[0].path).toBe('C:\\f5.txt');
    expect(r.filter((x) => x.path === 'C:\\f5.txt')).toHaveLength(1);
  });

  it('clear empties the list', () => {
    useRecentStore.getState().addRecent({ name: 'a.txt', path: 'C:\\a.txt' });
    useRecentStore.getState().addRecent({ name: 'b.txt', path: 'C:\\b.txt' });
    expect(useRecentStore.getState().recent).toHaveLength(2);
    useRecentStore.getState().clear();
    expect(useRecentStore.getState().recent).toEqual([]);
  });
});
