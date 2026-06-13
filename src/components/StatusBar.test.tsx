import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusBar } from './StatusBar';
import { useSelectionStore } from '../state/selectionStore';
import { useViewStore } from '../state/viewStore';

beforeEach(() => {
  useSelectionStore.getState().clear();
  useViewStore.setState({ viewMode: 'details' });
});

describe('StatusBar', () => {
  it('shows the item count when nothing is selected', () => {
    render(<StatusBar count={42} />);
    expect(screen.getByText('42 项')).toBeTruthy();
  });

  it('shows the selection count when items are selected', () => {
    useSelectionStore.setState({ selected: ['a', 'b', 'c'] });
    render(<StatusBar count={42} />);
    expect(screen.getByText('已选 3 项')).toBeTruthy();
  });

  it('the view slider reflects the current mode and changes it', () => {
    render(<StatusBar count={5} />);
    const slider = screen.getByTitle('视图大小') as HTMLInputElement;
    // 'details' is index 5 in MODES → slider value 6.
    expect(slider.value).toBe('6');
    fireEvent.change(slider, { target: { value: '1' } });
    expect(useViewStore.getState().viewMode).toBe('extra-large');
  });

  it('the slider maps value 8 → content view', () => {
    render(<StatusBar count={5} />);
    const slider = screen.getByTitle('视图大小') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '8' } });
    expect(useViewStore.getState().viewMode).toBe('content');
  });
});
