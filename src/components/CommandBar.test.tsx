import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandBar } from './CommandBar';
import { useSelectionStore } from '../state/selectionStore';
import type { Entry } from '../types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue([]) }));
const e = (n: string): Entry => ({ name: n, path: 'C:\\' + n, isDir: false, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: '', ext: '', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => useSelectionStore.getState().clear());

describe('CommandBar', () => {
  it('opens the New flyout with 文件夹 and 文本文档', () => {
    render(<CommandBar entries={[e('a.txt')]} />);
    fireEvent.click(screen.getByText('新建 ▾'));
    expect(screen.getByText('文件夹')).toBeInTheDocument();
    expect(screen.getByText('文本文档')).toBeInTheDocument();
  });
  it('opens the View flyout with 8 modes', () => {
    render(<CommandBar entries={[e('a.txt')]} />);
    fireEvent.click(screen.getByText('视图 ▾'));
    expect(screen.getByText('详细信息')).toBeInTheDocument();
    expect(screen.getByText('超大图标')).toBeInTheDocument();
  });
  it('disables 剪切/复制/删除 with no selection', () => {
    render(<CommandBar entries={[e('a.txt')]} />);
    expect(screen.getByText('剪切')).toBeDisabled();
    expect(screen.getByText('复制')).toBeDisabled();
    expect(screen.getByText('删除')).toBeDisabled();
  });
});
