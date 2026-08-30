import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TabBar } from './TabBar';
import { useLocationStore } from '../state/locationStore';

const closeMock = vi.fn();
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ close: closeMock }) }));

const tab = (id: string, title: string, path = 'C:\\' + title) =>
  ({ id, title, path, backStack: [] as string[], forwardStack: [] as string[] });

beforeEach(() => {
  closeMock.mockReset();
  useLocationStore.setState({ tabs: [tab('t1', '主页', '')], activeId: 't1' });
});

describe('TabBar', () => {
  it('renders each tab and marks the active one', () => {
    useLocationStore.setState({ tabs: [tab('t1', 'A'), tab('t2', 'B')], activeId: 't2' });
    render(<TabBar />);
    const tabs = document.querySelectorAll('.tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[1].classList.contains('active')).toBe(true);
    expect(tabs[0].classList.contains('active')).toBe(false);
  });

  it('the ＋ button adds a new tab', () => {
    render(<TabBar />);
    fireEvent.click(screen.getByTitle('新标签页 (Ctrl+T)'));
    expect(useLocationStore.getState().tabs.length).toBe(2);
  });

  it('clicking a tab makes it active', () => {
    useLocationStore.setState({ tabs: [tab('t1', 'A'), tab('t2', 'B')], activeId: 't1' });
    render(<TabBar />);
    fireEvent.click(document.querySelectorAll('.tab')[1]);
    expect(useLocationStore.getState().activeId).toBe('t2');
  });

  it('closing the last tab closes the window', async () => {
    render(<TabBar />);
    fireEvent.click(document.querySelector('.tab-close')!);
    await waitFor(() => expect(closeMock).toHaveBeenCalled());
  });

  it('closing a non-last tab removes it without closing the window', async () => {
    useLocationStore.setState({ tabs: [tab('t1', 'A'), tab('t2', 'B')], activeId: 't1' });
    render(<TabBar />);
    fireEvent.click(document.querySelectorAll('.tab-close')[1]); // close t2
    await waitFor(() => expect(useLocationStore.getState().tabs.length).toBe(1));
    expect(closeMock).not.toHaveBeenCalled();
  });
});
