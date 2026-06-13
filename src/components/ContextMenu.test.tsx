import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextMenu } from './ContextMenu';
import { useSelectionStore } from '../state/selectionStore';
import type { Entry } from '../types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue([]) }));
const e = (n: string): Entry => ({ name: n, path: 'C:\\' + n, isDir: false, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: '', ext: '', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => useSelectionStore.getState().clear());

describe('ContextMenu', () => {
  it('shows menu with 新建文件夹/粘贴 on right-click inside main-view', () => {
    document.body.innerHTML = '<div class="main-view" data-testid="mv"></div>';
    render(<ContextMenu entries={[e('a.txt')]} />);
    fireEvent.contextMenu(screen.getByTestId('mv'));
    expect(screen.getByText('新建文件夹')).toBeInTheDocument();
    expect(screen.getByText('粘贴')).toBeInTheDocument();
  });
  it('does not show the menu for a right-click outside main-view', () => {
    document.body.innerHTML = '<div class="other" data-testid="other"></div><div class="main-view" data-testid="mv" style="display:none"></div>';
    render(<ContextMenu entries={[]} />);
    fireEvent.contextMenu(screen.getByTestId('other'));
    expect(screen.queryByText('新建文件夹')).toBeNull();
  });
});
