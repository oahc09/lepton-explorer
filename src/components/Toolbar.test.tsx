import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toolbar } from './Toolbar';
import { useLocationStore } from '../state/locationStore';

beforeEach(() => useLocationStore.setState({ path: '', backStack: [], forwardStack: [] }));

describe('Toolbar', () => {
  it('back is disabled with empty history and enabled after navigate', () => {
    render(<Toolbar onRefresh={() => {}} />);
    expect(screen.getByTitle('后退')).toBeDisabled();
    useLocationStore.setState({ backStack: ['C:\\'] });
    render(<Toolbar onRefresh={() => {}} />);
    expect(screen.getAllByTitle('后退')[1]).toBeEnabled();
  });
  it('up navigates to parent', () => {
    useLocationStore.setState({ path: 'C:\\Users\\caosh' });
    render(<Toolbar onRefresh={() => {}} />);
    fireEvent.click(screen.getByTitle('向上'));
    expect(useLocationStore.getState().path).toBe('C:\\Users');
  });
  it('refresh calls onRefresh', () => {
    const onRefresh = vi.fn();
    render(<Toolbar onRefresh={onRefresh} />);
    fireEvent.click(screen.getByTitle('刷新'));
    expect(onRefresh).toHaveBeenCalled();
  });
});
