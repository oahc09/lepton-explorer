import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openPath } from '@tauri-apps/plugin-opener';
import { openItem } from './open';
import { useRecentStore } from '../state/recentStore';

vi.mock('@tauri-apps/plugin-opener', () => ({ openPath: vi.fn() }));
const m = openPath as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  m.mockReset();
  useRecentStore.setState({ recent: [] });
});

describe('openItem', () => {
  it('opens the path via the opener plugin and records it in recent', async () => {
    m.mockResolvedValue(undefined);
    await openItem('C:\\folder\\a.txt');
    expect(m).toHaveBeenCalledWith('C:\\folder\\a.txt');
    expect(useRecentStore.getState().recent.some((r) => r.path === 'C:\\folder\\a.txt')).toBe(true);
  });

  it('records the file name (last path segment) in recent', async () => {
    m.mockResolvedValue(undefined);
    await openItem('C:\\docs\\report.pdf');
    const entry = useRecentStore.getState().recent.find((r) => r.path.endsWith('report.pdf'));
    expect(entry?.name).toBe('report.pdf');
  });

  it('swallows open errors', async () => {
    m.mockRejectedValue(new Error('no associated app'));
    await expect(openItem('C:\\x.unknownext')).resolves.toBeUndefined();
  });
});
