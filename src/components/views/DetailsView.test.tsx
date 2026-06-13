import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useSelectionStore } from '../../state/selectionStore';
import { useViewStore } from '../../state/viewStore';
import type { Entry } from '../../types';

// jsdom has no layout → real virtualizer renders 0 rows. Stub to render all rows.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({ index: i, key: i, start: i * estimateSize() })),
  }),
}));

import { DetailsView } from './DetailsView';

const e = (n: string): Entry => ({ name: n, path: 'C:\\' + n, isDir: false, size: 10, modified: 1700000000000, created: 0, accessed: 0, typeLabel: 'TXT 文件', ext: 'txt', isHidden: false, isSystem: false, isReadOnly: false });

beforeEach(() => {
  useSelectionStore.getState().clear();
  useViewStore.setState({ viewMode: 'details', sort: { field: 'name', asc: true }, showExtensions: true });
});

describe('DetailsView', () => {
  it('renders rows and selects on click', () => {
    render(<DetailsView entries={[e('a.txt'), e('b.txt')]} />);
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    fireEvent.click(screen.getByText('a.txt'));
    expect(useSelectionStore.getState().selected).toEqual(['C:\\a.txt']);
  });

  it('shows sort direction arrow on the active column', () => {
    useViewStore.setState({ sort: { field: 'size', asc: false } });
    render(<DetailsView entries={[e('a.txt')]} />);
    // 大小 header carries the descending arrow
    expect(screen.getByText(/大小/).textContent).toMatch(/▼/);
  });
});
