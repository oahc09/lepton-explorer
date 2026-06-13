import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PropertiesDialog } from './PropertiesDialog';
import type { Entry } from '../types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
const m = invoke as unknown as ReturnType<typeof vi.fn>;

const fileEntry: Entry = {
  name: 'a.txt', path: 'C:\\folder\\a.txt', isDir: false, size: 1024,
  modified: 1700000000, created: 1700000000, accessed: 1700000000,
  typeLabel: '文本文档', ext: '.txt', isHidden: false, isSystem: false, isReadOnly: false,
};

beforeEach(() => m.mockReset());

describe('PropertiesDialog', () => {
  it('renders the entry name, type, and location', () => {
    render(<PropertiesDialog entry={fileEntry} onClose={() => {}} />);
    expect(screen.getByText('a.txt 属性')).toBeTruthy();
    expect(screen.getByText('文本文档')).toBeTruthy();
    expect(screen.getByText('C:\\folder')).toBeTruthy(); // location = parent dir
  });

  it('does not call get_properties for a file', () => {
    render(<PropertiesDialog entry={fileEntry} onClose={() => {}} />);
    expect(m).not.toHaveBeenCalled();
  });

  it('fetches aggregated size via get_properties for a folder', async () => {
    m.mockResolvedValue(4096);
    const dir: Entry = { ...fileEntry, name: 'sub', path: 'C:\\folder\\sub', isDir: true, typeLabel: '文件夹' };
    render(<PropertiesDialog entry={dir} onClose={() => {}} />);
    await waitFor(() => expect(m).toHaveBeenCalledWith('get_properties', { path: 'C:\\folder\\sub' }));
  });

  it('the 确定 button and overlay click both call onClose', () => {
    let closed = 0;
    const { container } = render(<PropertiesDialog entry={fileEntry} onClose={() => { closed++; }} />);
    fireEvent.click(screen.getByText('确定'));
    // Clicking the overlay (outer) also closes.
    fireEvent.click(container.querySelector('.modal-overlay')!);
    expect(closed).toBe(2);
  });
});
