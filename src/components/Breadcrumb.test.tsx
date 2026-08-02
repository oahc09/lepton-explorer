import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Breadcrumb } from './Breadcrumb';
import { useLocationStore } from '../state/locationStore';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
const m = invoke as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  useLocationStore.setState({ path: '', backStack: [], forwardStack: [] });
  m.mockReset();
  m.mockResolvedValue([]);
});

describe('Breadcrumb', () => {
  it('renders path segments and navigates on click', () => {
    useLocationStore.setState({ path: 'C:\\Users\\caosh' });
    render(<Breadcrumb />);
    expect(screen.getByText('caosh')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Users'));
    expect(useLocationStore.getState().path).toBe('C:\\Users');
  });

  it('shows address-bar path suggestions while editing and navigates on pick', async () => {
    m.mockImplementation((cmd: string) =>
      cmd === 'suggest_paths'
        ? Promise.resolve([{ name: 'Documents', path: 'C:\\Documents', isDir: true }])
        : Promise.resolve([]),
    );
    render(<Breadcrumb />);
    act(() => window.dispatchEvent(new Event('lepton:focus-address')));
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'C:\\Do' } });
    await waitFor(() => expect(screen.getByText(/Documents/)).toBeInTheDocument());
    // Picking the suggestion (mousedown) navigates to it.
    fireEvent.mouseDown(screen.getByText(/Documents/));
    expect(useLocationStore.getState().path).toBe('C:\\Documents');
  });
});
