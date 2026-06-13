import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Thumbnail } from './Thumbnail';
import type { Entry } from '../types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
const m = invoke as unknown as ReturnType<typeof vi.fn>;

const img: Entry = { name: 'a.png', path: 'C:\\a.png', isDir: false, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: 'PNG 文件', ext: 'png', isHidden: false, isSystem: false, isReadOnly: false };
const folder: Entry = { name: 'd', path: 'C:\\d', isDir: true, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: '文件夹', ext: '', isHidden: false, isSystem: false, isReadOnly: false };

beforeEach(() => {
  m.mockReset();
  // Default: invoke resolves to null so any command (get_icon for folders,
  // get_thumbnail for images) is safe to call and returns no image data.
  m.mockResolvedValue(null);
});

describe('Thumbnail', () => {
  it('renders an <img> when the backend returns base64 data', async () => {
    m.mockResolvedValue('iVBORw0');
    render(<Thumbnail entry={img} size={48} />);
    await waitFor(() => expect(document.querySelector('img.thumb-img')).not.toBeNull());
    expect(m).toHaveBeenCalledWith('get_thumbnail', { path: 'C:\\a.png', size: 48 });
  });
  it('renders the folder emoji and does not invoke get_thumbnail', () => {
    render(<Thumbnail entry={folder} size={16} />);
    expect(screen.getByText('📁')).toBeInTheDocument();
    expect(m).not.toHaveBeenCalledWith('get_thumbnail', expect.anything());
  });
});
