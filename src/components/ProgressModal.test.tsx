import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProgressModal } from './ProgressModal';
import { useProgressStore } from '../state/progressStore';

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
const m = invoke as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  m.mockReset();
  m.mockResolvedValue(undefined);
  useProgressStore.setState({ active: false, current: 0, total: 0, file: '' });
});

describe('ProgressModal', () => {
  it('renders nothing when inactive', () => {
    const { container } = render(<ProgressModal />);
    expect(container.querySelector('.progress-modal')).toBeNull();
  });

  it('renders the title, file name, and a 30% fill when 3/10', () => {
    useProgressStore.setState({ active: true, current: 3, total: 10, file: 'report.pdf' });
    render(<ProgressModal />);
    expect(screen.getByText('正在复制')).toBeTruthy();
    expect(screen.getByText(/3 \/ 10 项/)).toBeTruthy();
    expect(screen.getByText('report.pdf')).toBeTruthy();
    const fill = document.querySelector('.progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('30%');
  });

  it('clamps the fill at 100%', () => {
    useProgressStore.setState({ active: true, current: 12, total: 10, file: 'x' });
    render(<ProgressModal />);
    const fill = document.querySelector('.progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('the Cancel button invokes cancel_copy', () => {
    useProgressStore.setState({ active: true, current: 1, total: 5, file: 'a.txt' });
    render(<ProgressModal />);
    fireEvent.click(screen.getByText('取消'));
    expect(m).toHaveBeenCalledWith('cancel_copy');
  });
});

