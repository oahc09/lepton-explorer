import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SearchBox } from './SearchBox';
import { useSearchStore } from '../state/searchStore';
import { useLocationStore } from '../state/locationStore';
import type { Entry } from '../types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
const m = invoke as unknown as ReturnType<typeof vi.fn>;

const anEntry = (n: string): Entry => ({
  name: n, path: 'C:\\folder\\' + n, isDir: false, size: 0, modified: 0, created: 0, accessed: 0,
  typeLabel: '', ext: '', isHidden: false, isSystem: false, isReadOnly: false,
});

beforeEach(() => {
  m.mockReset();
  m.mockResolvedValue([]);
  useSearchStore.setState({ query: '', results: null });
  useLocationStore.setState({ path: 'C:\\folder' });
});

describe('SearchBox', () => {
  it('debounces the search invoke by 250ms', () => {
    vi.useFakeTimers();
    render(<SearchBox />);
    fireEvent.change(screen.getByPlaceholderText('搜索 folder'), { target: { value: 'report' } });
    expect(m).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(250); });
    expect(m).toHaveBeenCalledWith('search', { root: 'C:\\folder', query: 'report' });
    vi.useRealTimers();
  });

  it('clears results when the query is emptied', () => {
    useSearchStore.setState({ query: 'x', results: [anEntry('a.txt')] });
    render(<SearchBox />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    expect(useSearchStore.getState().results).toBeNull();
  });

  it('shows a generic placeholder when there is no path (Home)', () => {
    useLocationStore.setState({ path: '' });
    render(<SearchBox />);
    expect(screen.getByPlaceholderText('搜索')).toBeTruthy();
  });

  it('focuses the input on the lepton:focus-search event', () => {
    render(<SearchBox />);
    const input = screen.getByPlaceholderText('搜索 folder');
    expect(document.activeElement).not.toBe(input);
    act(() => { window.dispatchEvent(new Event('lepton:focus-search')); });
    expect(document.activeElement).toBe(input);
  });
});
