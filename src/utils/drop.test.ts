import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { setDragged } from './drag';
import { dropInto } from './drop';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const m = invoke as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  m.mockReset();
  m.mockResolvedValue([]);
  setDragged([]);
});

describe('dropInto', () => {
  it('is a no-op when nothing is dragged', async () => {
    await dropInto('C:\\dest', false);
    expect(m).not.toHaveBeenCalled();
  });

  it('copy invokes copy_items and dispatches a refresh', async () => {
    setDragged(['C:\\src\\a.txt']);
    const spy = vi.spyOn(window, 'dispatchEvent');
    await dropInto('C:\\dest', true);
    expect(m).toHaveBeenCalledWith('copy_items', { sources: ['C:\\src\\a.txt'], dest: 'C:\\dest' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'winfinder:refresh' }));
    spy.mockRestore();
  });

  it('move invokes move_items', async () => {
    setDragged(['C:\\src\\a.txt']);
    await dropInto('C:\\dest', false);
    expect(m).toHaveBeenCalledWith('move_items', { sources: ['C:\\src\\a.txt'], dest: 'C:\\dest' });
  });

  it('moving into the sources own parent folder is a no-op', async () => {
    setDragged(['C:\\dest\\a.txt']); // parent is C:\dest
    await dropInto('C:\\dest', false);
    expect(m).not.toHaveBeenCalled();
  });

  it('swallows op errors without refreshing', async () => {
    setDragged(['C:\\src\\a.txt']);
    m.mockRejectedValue(new Error('denied'));
    const spy = vi.spyOn(window, 'dispatchEvent');
    await dropInto('C:\\dest', true);
    expect(m).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'winfinder:refresh' }));
    spy.mockRestore();
  });
});
