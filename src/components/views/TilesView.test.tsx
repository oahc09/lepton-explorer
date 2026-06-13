import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useSelectionStore } from '../../state/selectionStore';
import { useViewStore } from '../../state/viewStore';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () => Array.from({ length: count }, (_, i) => ({ index: i, key: i, start: i * estimateSize() })),
  }),
}));

import { TilesView } from './TilesView';
import type { Entry } from '../../types';

const e = (n: string, size = 0): Entry => ({ name: n, path: 'C:\\' + n, isDir: false, size, modified: 0, created: 0, accessed: 0, typeLabel: 'TXT 文件', ext: 'txt', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => { useSelectionStore.getState().clear(); useViewStore.setState({ showExtensions: true }); });

describe('TilesView', () => {
  it('renders tile with name and selects on click', () => {
    render(<TilesView entries={[e('a.txt', 1024)]} />);
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    fireEvent.click(screen.getByText('a.txt'));
    expect(useSelectionStore.getState().selected).toEqual(['C:\\a.txt']);
  });
});
