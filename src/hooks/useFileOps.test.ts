import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileOps } from './useFileOps';
import { useClipboardStore } from '../state/clipboardStore';
import { useHistoryStore } from '../state/historyStore';
import type { Entry } from '../types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
const m = invoke as unknown as ReturnType<typeof vi.fn>;

const e = (n: string): Entry => ({ name: n, path: 'C:\\dest\\' + n, isDir: false, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: '', ext: '', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => { m.mockReset(); useClipboardStore.getState().clear(); useHistoryStore.setState({ undoStack: [], redoStack: [] }); });

describe('useFileOps', () => {
  it('newFolder creates a folder and pushes an undo entry', async () => {
    m.mockResolvedValue([]);
    const { result } = renderHook(() => useFileOps());
    await act(async () => { await result.current.newFolder('C:\\dest'); });
    expect(m).toHaveBeenCalledWith('create_dir', expect.objectContaining({ path: expect.stringMatching(/新建文件夹/) }));
    expect(useHistoryStore.getState().canUndo()).toBe(true);
  });

  it('paste in copy mode invokes copy_items', async () => {
    useClipboardStore.getState().copy([e('a.txt')]);
    m.mockResolvedValue(['C:\\dest\\a.txt']);
    const { result } = renderHook(() => useFileOps());
    await act(async () => { await result.current.paste('C:\\dest'); });
    expect(m).toHaveBeenCalledWith('copy_items', expect.objectContaining({ dest: 'C:\\dest' }));
  });
});
