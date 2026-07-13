import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OpenWithDialog } from './OpenWithDialog';
import type { Entry } from '../types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';

const entry = {
  name: 'note.txt',
  path: 'C:\\note.txt',
  isDir: false,
  size: 0,
  modified: 0,
  created: 0,
  accessed: 0,
  typeLabel: '文本文档',
  ext: 'txt',
  isHidden: false,
  isSystem: false,
  isReadOnly: false,
} as unknown as Entry;

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

describe('OpenWithDialog', () => {
  it('lists associated apps and launches the chosen one', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_open_with') {
        return {
          default: { name: 'Notepad', exe: 'C:\\windows\\notepad.exe', isDefault: true },
          apps: [
            { name: 'Notepad', exe: 'C:\\windows\\notepad.exe', isDefault: true },
            { name: 'WordPad', exe: 'C:\\windows\\write.exe', isDefault: false },
          ],
        };
      }
      return null;
    });
    const onClose = vi.fn();
    render(<OpenWithDialog entry={entry} onClose={onClose} />);

    expect(await screen.findByText('Notepad（推荐）')).toBeTruthy();
    expect(screen.getByText('WordPad')).toBeTruthy();

    fireEvent.click(screen.getByText('WordPad'));
    expect(mockInvoke).toHaveBeenCalledWith('open_with_path', {
      path: 'C:\\note.txt',
      exe: 'C:\\windows\\write.exe',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('offers the native picker when no apps are found', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_open_with') return { default: null, apps: [] };
      return null;
    });
    const onClose = vi.fn();
    render(<OpenWithDialog entry={entry} onClose={onClose} />);

    const other = await screen.findByText('在这台电脑上查找另一个应用');
    fireEvent.click(other);
    expect(mockInvoke).toHaveBeenCalledWith('open_with_dialog', {
      path: 'C:\\note.txt',
    });
    expect(onClose).toHaveBeenCalled();
  });
});
