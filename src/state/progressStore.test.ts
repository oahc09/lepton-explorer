import { describe, it, expect, beforeEach } from 'vitest';
import { useProgressStore } from './progressStore';

beforeEach(() => useProgressStore.setState({ active: false, current: 0, total: 0, file: '' }));

describe('progressStore', () => {
  it('open resets counters and activates', () => {
    useProgressStore.setState({ current: 5, total: 10, file: 'old' });
    useProgressStore.getState().open();
    const s = useProgressStore.getState();
    expect(s.active).toBe(true);
    expect(s.current).toBe(0);
    expect(s.total).toBe(0);
    expect(s.file).toBe('');
  });

  it('update sets current/total/file', () => {
    useProgressStore.getState().update(3, 10, 'a.txt');
    const s = useProgressStore.getState();
    expect(s.current).toBe(3);
    expect(s.total).toBe(10);
    expect(s.file).toBe('a.txt');
  });

  it('close deactivates (keeps last values)', () => {
    useProgressStore.getState().open();
    useProgressStore.getState().update(7, 10, 'b.txt');
    useProgressStore.getState().close();
    const s = useProgressStore.getState();
    expect(s.active).toBe(false);
  });
});
