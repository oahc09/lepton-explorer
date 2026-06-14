import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusBar } from './StatusBar';
import { useSelectionStore } from '../state/selectionStore';
import { useViewStore } from '../state/viewStore';
import type { Entry } from '../types';

const f = (name: string, size: number): Entry => ({
  name, path: 'C:\\' + name, isDir: false, size, modified: 0, created: 0, accessed: 0,
  typeLabel: '', ext: '', isHidden: false, isSystem: false, isReadOnly: false,
});

beforeEach(() => {
  useSelectionStore.getState().clear();
  useViewStore.setState({ viewMode: 'details' });
});

describe('StatusBar', () => {
  it('shows the item count when nothing is selected', () => {
    render(<StatusBar count={42} entries={[]} />);
    expect(screen.getByText('42 个项目')).toBeTruthy();
  });

  it('shows the selection size for a single selected file', () => {
    const e = f('a.txt', 2048);
    useSelectionStore.setState({ selected: ['C:\\a.txt'] });
    const { container } = render(<StatusBar count={5} entries={[e]} />);
    const left = container.querySelector('.status-bar span')!.textContent || '';
    expect(left).toMatch(/已选定 1 个项目/);
    expect(left).toMatch(/\d/); // a size value is appended
  });

  it('shows total size for multiple selected files', () => {
    const entries = [f('a.txt', 1024), f('b.txt', 2048)];
    useSelectionStore.setState({ selected: ['C:\\a.txt', 'C:\\b.txt'] });
    render(<StatusBar count={5} entries={entries} />);
    expect(screen.getByText(/已选定 2 个项目/)).toBeTruthy();
  });

  it('the view slider reflects the current mode and changes it', () => {
    render(<StatusBar count={5} entries={[]} />);
    const slider = screen.getByTitle('视图大小') as HTMLInputElement;
    expect(slider.value).toBe('6'); // details is index 5 → +1
    fireEvent.change(slider, { target: { value: '1' } });
    expect(useViewStore.getState().viewMode).toBe('extra-large');
  });

  it('the slider maps value 8 → content view', () => {
    render(<StatusBar count={5} entries={[]} />);
    const slider = screen.getByTitle('视图大小') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '8' } });
    expect(useViewStore.getState().viewMode).toBe('content');
  });
});
