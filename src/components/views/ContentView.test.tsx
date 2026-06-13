import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useSelectionStore } from '../../state/selectionStore';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () => Array.from({ length: count }, (_, i) => ({ index: i, key: i, start: i * estimateSize() })),
  }),
}));

import { ContentView } from './ContentView';
import type { Entry } from '../../types';

const e = (n: string): Entry => ({ name: n, path: 'C:\\' + n, isDir: false, size: 1024, modified: 1700000000000, created: 0, accessed: 0, typeLabel: 'TXT 文件', ext: 'txt', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => useSelectionStore.getState().clear());

describe('ContentView', () => {
  it('renders row with name and selects on click', () => {
    render(<ContentView entries={[e('a.txt')]} />);
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    fireEvent.click(screen.getByText('a.txt'));
    expect(useSelectionStore.getState().selected).toEqual(['C:\\a.txt']);
  });
});
