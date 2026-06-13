import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConflictModal } from './ConflictModal';
import { useConflictStore } from '../state/conflictStore';
import type { ConflictStrategy } from '../types';

beforeEach(() => {
  cleanup();
  useConflictStore.setState({ pending: null });
});

/** Drive the modal by seeding the store with a pending conflict + resolver. */
function seed(names: string[]) {
  let resolved: ConflictStrategy | null | undefined;
  useConflictStore.setState({
    pending: { names, resolve: (s) => { resolved = s; } },
  });
  return () => resolved;
}

describe('ConflictModal', () => {
  it('renders nothing when no conflict is pending', () => {
    render(<ConflictModal />);
    expect(screen.queryByText('替换或跳过文件')).toBeNull();
  });

  it('lists the conflicting names', () => {
    seed(['a.txt', 'b.txt']);
    render(<ConflictModal />);
    expect(screen.getByText('替换或跳过文件')).toBeTruthy();
    expect(screen.getByText('a.txt')).toBeTruthy();
    expect(screen.getByText('b.txt')).toBeTruthy();
    expect(screen.getByText(/应用于全部 2 个冲突项/)).toBeTruthy();
  });

  it('Replace button answers "replace" and clears the dialog', () => {
    const getResolved = seed(['a.txt']);
    render(<ConflictModal />);
    fireEvent.click(screen.getByText('替换'));
    expect(getResolved()).toBe('replace');
    expect(useConflictStore.getState().pending).toBeNull();
  });

  it('Skip button answers "skip"', () => {
    const getResolved = seed(['a.txt']);
    render(<ConflictModal />);
    fireEvent.click(screen.getByText('跳过'));
    expect(getResolved()).toBe('skip');
  });

  it('Keep-both button answers "rename"', () => {
    const getResolved = seed(['a.txt']);
    render(<ConflictModal />);
    fireEvent.click(screen.getByText('保留两者'));
    expect(getResolved()).toBe('rename');
  });

  it('Cancel button + overlay click answer null (cancel)', () => {
    const getResolved = seed(['a.txt']);
    render(<ConflictModal />);
    fireEvent.click(screen.getByText('取消'));
    expect(getResolved()).toBeNull();
  });
});
