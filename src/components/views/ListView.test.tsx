import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useSelectionStore } from '../../state/selectionStore';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () => Array.from({ length: count }, (_, i) => ({ index: i, key: i, start: i * estimateSize() })),
  }),
}));

import { ListView } from './ListView';
import type { Entry } from '../../types';

const e = (n: string, isDir = false): Entry => ({ name: n, path: 'C:\\' + n, isDir, size: 0, modified: 0, created: 0, accessed: 0, typeLabel: isDir ? '文件夹' : '文件', ext: '', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => useSelectionStore.getState().clear());

describe('ListView', () => {
  it('renders small-icon items and selects on click', () => {
    render(<ListView entries={[e('a.txt'), e('b')]} />);
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    fireEvent.click(screen.getByText('a.txt'));
    expect(useSelectionStore.getState().selected).toEqual(['C:\\a.txt']);
  });
});
