import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileOps } from './useFileOps';
import { useClipboardStore } from '../state/clipboardStore';
import { useHistoryStore } from '../state/historyStore';
import { useConflictStore } from '../state/conflictStore';
import { useProgressStore } from '../state/progressStore';
import type { Entry } from '../types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
const m = invoke as unknown as ReturnType<typeof vi.fn>;

const e = (n: string): Entry => ({ name: n, path: 'C:\\src\\' + n, isDir: false, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: '', ext: '', isHidden: false, isSystem: false, isReadOnly: false });

/** Route invoke by command name so the paste flow (check_conflicts → copy/move) works. */
function route(responses: Record<string, unknown>) {
  m.mockImplementation((cmd: string) => Promise.resolve(responses[cmd] ?? []));
}

beforeEach(() => {
  m.mockReset();
  useClipboardStore.getState().clear();
  useHistoryStore.setState({ undoStack: [], redoStack: [] });
  useConflictStore.setState({ pending: null });
  useProgressStore.setState({ active: false });
});

describe('useFileOps', () => {
  it('newFolder creates a folder and pushes an undo entry', async () => {
    m.mockImplementation((cmd: string) =>
      cmd === 'unique_target' ? Promise.resolve('C:\\dest\\新建文件夹') : Promise.resolve([]),
    );
    const { result } = renderHook(() => useFileOps());
    await act(async () => { await result.current.newFolder('C:\\dest'); });
    expect(m).toHaveBeenCalledWith('unique_target', expect.objectContaining({ name: '新建文件夹' }));
    expect(m).toHaveBeenCalledWith('create_dir', expect.objectContaining({ path: 'C:\\dest\\新建文件夹' }));
    expect(useHistoryStore.getState().canUndo()).toBe(true);
  });

  it('paste in copy mode with no conflict invokes copy_with_progress(rename) and opens then closes the progress dialog', async () => {
    useClipboardStore.getState().copy([e('a.txt')]);
    route({ check_conflicts: [], copy_with_progress: ['C:\\dest\\a.txt'] });
    const { result } = renderHook(() => useFileOps());
    await act(async () => { await result.current.paste('C:\\dest'); });
    expect(m).toHaveBeenCalledWith('check_conflicts', expect.objectContaining({ dest: 'C:\\dest' }));
    expect(m).toHaveBeenCalledWith('copy_with_progress', expect.objectContaining({ dest: 'C:\\dest', strategy: 'rename' }));
    expect(useProgressStore.getState().active).toBe(false); // closed after completion
  });

  it('paste with a conflict asks the user; choosing replace uses the replace strategy', async () => {
    useClipboardStore.getState().copy([e('a.txt')]);
    route({ check_conflicts: [{ name: 'a.txt' }], copy_with_progress: ['C:\\dest\\a.txt'] });
    const { result } = renderHook(() => useFileOps());
    await act(async () => {
      const pasteP = result.current.paste('C:\\dest');
      await vi.waitFor(() => expect(useConflictStore.getState().pending).not.toBeNull());
      useConflictStore.getState().answer('replace');
      await pasteP;
    });
    expect(m).toHaveBeenCalledWith('copy_with_progress', expect.objectContaining({ strategy: 'replace' }));
  });

  it('paste with a conflict that the user cancels performs no copy', async () => {
    useClipboardStore.getState().copy([e('a.txt')]);
    route({ check_conflicts: [{ name: 'a.txt' }] });
    const { result } = renderHook(() => useFileOps());
    await act(async () => {
      const pasteP = result.current.paste('C:\\dest');
      await vi.waitFor(() => expect(useConflictStore.getState().pending).not.toBeNull());
      useConflictStore.getState().answer(null);
      await pasteP;
    });
    expect(m).not.toHaveBeenCalledWith('copy_with_progress', expect.anything());
    expect(useProgressStore.getState().active).toBe(false); // never opened (cancel before copy)
  });

  it('paste in cut mode with no conflict invokes move_with_progress(rename) and clears clipboard', async () => {
    useClipboardStore.getState().cut([e('a.txt')]);
    route({ check_conflicts: [], move_with_progress: [['C:\\src\\a.txt', 'C:\\dest\\a.txt']] });
    const { result } = renderHook(() => useFileOps());
    await act(async () => { await result.current.paste('C:\\dest'); });
    expect(m).toHaveBeenCalledWith('move_with_progress', expect.objectContaining({ dest: 'C:\\dest', strategy: 'rename' }));
    expect(useClipboardStore.getState().items).toHaveLength(0);
    expect(useProgressStore.getState().active).toBe(false); // closed after completion
  });
});
