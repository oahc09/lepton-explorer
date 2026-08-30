import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TitleBar } from './TitleBar';
import { useLocationStore } from '../state/locationStore';

const winMock = {
  isMaximized: vi.fn().mockResolvedValue(false),
  onResized: vi.fn().mockResolvedValue(() => {}),
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
};
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => winMock }));

beforeEach(() => {
  winMock.minimize.mockClear();
  winMock.toggleMaximize.mockClear();
  winMock.close.mockClear();
  useLocationStore.setState({ tabs: [{ id: 't1', title: '主页', path: '', backStack: [], forwardStack: [] }], activeId: 't1' });
});

describe('TitleBar', () => {
  it('renders the three window-control buttons + the new-tab button', () => {
    render(<TitleBar />);
    expect(screen.getByTitle('最小化')).toBeTruthy();
    expect(screen.getByTitle('最大化')).toBeTruthy();
    expect(screen.getByTitle('关闭')).toBeTruthy();
    expect(screen.getByTitle('新标签页 (Ctrl+T)')).toBeTruthy();
  });

  it('minimize / maximize / close buttons call the window API', async () => {
    render(<TitleBar />);
    fireEvent.click(screen.getByTitle('最小化'));
    fireEvent.click(screen.getByTitle('最大化'));
    fireEvent.click(screen.getByTitle('关闭'));
    await waitFor(() => {
      expect(winMock.minimize).toHaveBeenCalled();
      expect(winMock.toggleMaximize).toHaveBeenCalled();
      expect(winMock.close).toHaveBeenCalled();
    });
  });

  it('reflects the maximized state in the maximize button glyph', async () => {
    winMock.isMaximized.mockResolvedValueOnce(true);
    render(<TitleBar />);
    // When maximized the button becomes "restore" (title + glyph both change).
    await waitFor(() => expect(screen.getByTitle('还原').textContent).toBe('\uE923'));
  });
});
