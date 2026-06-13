import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Breadcrumb } from './Breadcrumb';
import { useLocationStore } from '../state/locationStore';

beforeEach(() => useLocationStore.setState({ path: '', backStack: [], forwardStack: [] }));

describe('Breadcrumb', () => {
  it('renders path segments and navigates on click', () => {
    useLocationStore.setState({ path: 'C:\\Users\\caosh' });
    render(<Breadcrumb />);
    expect(screen.getByText('caosh')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Users'));
    expect(useLocationStore.getState().path).toBe('C:\\Users');
  });
});
