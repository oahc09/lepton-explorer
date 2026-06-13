import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useSelectionStore } from '../../state/selectionStore';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () => Array.from({ length: count }, (_, i) => ({ index: i, key: i, start: i * estimateSize() })),
  }),
}));

import { IconsView } from './IconsView';
import type { Entry } from '../../types';

const e = (n: string): Entry => ({ name: n, path: 'C:\\' + n, isDir: true, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: '文件夹', ext: '', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => useSelectionStore.getState().clear());

describe('IconsView', () => {
  it('renders tiles and selects on click', () => {
    render(<IconsView entries={[e('Folder1')]} />);
    expect(screen.getByText('Folder1')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Folder1'));
    expect(useSelectionStore.getState().selected).toEqual(['C:\\Folder1']);
  });
});
