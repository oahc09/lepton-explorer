import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NavPane } from './NavPane';
import { useLocationStore } from '../state/locationStore';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockInvoke.mockReset();
  useLocationStore.setState({ path: '', backStack: [], forwardStack: [] });
});

describe('NavPane', () => {
  it('lists special folders and drives, navigates on click', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'special_folders') return Promise.resolve([{ key: 'documents', name: '文档', path: 'C:\\Users\\caosh\\Documents' }]);
      if (cmd === 'list_drives') return Promise.resolve([{ letter: 'C:', path: 'C:\\' }]);
      return Promise.resolve([]);
    });
    render(<NavPane />);
    await waitFor(() => screen.getByText('文档'));
    fireEvent.click(screen.getByText('文档'));
    expect(useLocationStore.getState().path).toBe('C:\\Users\\caosh\\Documents');
    fireEvent.click(screen.getByText('C:'));
    expect(useLocationStore.getState().path).toBe('C:\\');
  });
});
