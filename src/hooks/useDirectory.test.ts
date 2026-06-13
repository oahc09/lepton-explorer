import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDirectory } from './useDirectory';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => mockInvoke.mockReset());

describe('useDirectory', () => {
  it('loads entries for a path', async () => {
    mockInvoke.mockResolvedValueOnce([{ name: 'a.txt', path: 'C:\\a.txt', isDir: false }]);
    const { result } = renderHook(() => useDirectory('C:\\'));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(mockInvoke).toHaveBeenCalledWith('list_directory', { dir: 'C:\\' });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('captures errors', async () => {
    mockInvoke.mockRejectedValueOnce({ message: 'boom' });
    const { result } = renderHook(() => useDirectory('C:\\bad'));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.entries).toEqual([]);
  });

  it('re-lists when refreshKey changes', async () => {
    mockInvoke.mockResolvedValue([{ name: 'a.txt', path: 'C:\\a.txt', isDir: false }]);
    const { result, rerender } = renderHook(({ rk }) => useDirectory('C:\\', rk), { initialProps: { rk: 0 } });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    mockInvoke.mockClear();
    rerender({ rk: 1 });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
  });
});
