import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewPane } from './PreviewPane';
import { DetailsPane } from './DetailsPane';
import type { Entry } from '../types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));

const file: Entry = {
  name: 'a.txt', path: 'C:\\a.txt', isDir: false, size: 2048,
  modified: 1700000000, created: 1700000000, accessed: 1700000000,
  typeLabel: '文本文档', ext: '.txt', isHidden: true, isSystem: false, isReadOnly: false,
};

describe('PreviewPane', () => {
  it('shows the empty prompt when no entry is selected', () => {
    render(<PreviewPane entry={null} />);
    expect(screen.getByText('选择一个项目以预览')).toBeTruthy();
  });

  it('shows the entry name, type, and size when an entry is given', () => {
    render(<PreviewPane entry={file} />);
    expect(screen.getByText('a.txt')).toBeTruthy();
    expect(screen.getAllByText('文本文档').length).toBeGreaterThan(0);
  });
});

describe('DetailsPane', () => {
  it('shows the empty prompt when no entry is selected', () => {
    render(<DetailsPane entry={null} />);
    expect(screen.getByText('选择一个项目以查看详细信息')).toBeTruthy();
  });

  it('shows attributes including the hidden flag', () => {
    render(<DetailsPane entry={file} />);
    expect(screen.getByText('a.txt')).toBeTruthy();
    expect(screen.getByText('隐藏')).toBeTruthy();
  });

  it('shows folder type + — size for a directory', () => {
    const dir: Entry = { ...file, isDir: true };
    render(<DetailsPane entry={dir} />);
    expect(screen.getAllByText('文件夹').length).toBeGreaterThan(0);
  });
});
