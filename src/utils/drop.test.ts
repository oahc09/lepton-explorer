import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { setDragged } from './drag';
import { dropInto } from './drop';
import { useConflictStore } from '../state/conflictStore';
import { useProgressStore } from '../state/progressStore';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const m = invoke as unknown as ReturnType<typeof vi.fn>;

/** Route invoke by command; default check_conflicts → [] (no collision). */
function route(responses: Record<string, unknown> = {}) {
  m.mockImplementation((cmd: string) =>
    Promise.resolve(responses[cmd] ?? (cmd === 'check_conflicts' ? [] : [])),
  );
}

beforeEach(() => {
  m.mockReset();
  route();
  setDragged([]);
  useConflictStore.setState({ pending: null });
  useProgressStore.setState({ active: false });
});

describe('dropInto', () => {
  it('is a no-op when nothing is dragged', async () => {
    await dropInto('C:\\dest', false);
    expect(m).not.toHaveBeenCalled();
  });

  it('moving into the sources own parent folder is a no-op', async () => {
    setDragged(['C:\\dest\\a.txt']); // parent is C:\dest
    await dropInto('C:\\dest', false);
    expect(m).not.toHaveBeenCalled();
  });

  it('copy checks conflicts then invokes copy_with_progress and refreshes', async () => {
    setDragged(['C:\\src\\a.txt']);
    const spy = vi.spyOn(window, 'dispatchEvent');
    await dropInto('C:\\dest', true);
    expect(m).toHaveBeenCalledWith('check_conflicts', { sources: ['C:\\src\\a.txt'], dest: 'C:\\dest' });
    expect(m).toHaveBeenCalledWith('copy_with_progress', expect.objectContaining({ dest: 'C:\\dest', strategy: 'rename' }));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'lepton:refresh' }));
    expect(useProgressStore.getState().active).toBe(false);
    spy.mockRestore();
  });

  it('move invokes move_with_progress', async () => {
    setDragged(['C:\\src\\a.txt']);
    await dropInto('C:\\dest', false);
    expect(m).toHaveBeenCalledWith('move_with_progress', expect.objectContaining({ dest: 'C:\\dest', strategy: 'rename' }));
  });

  it('with a collision, asks the user; replace resolves to the replace strategy', async () => {
    setDragged(['C:\\src\\a.txt']);
    route({ check_conflicts: [{ name: 'a.txt' }] });
    const spy = vi.spyOn(window, 'dispatchEvent');
    const dropP = dropInto('C:\\dest', true);
    await vi.waitFor(() => expect(useConflictStore.getState().pending).not.toBeNull());
    useConflictStore.getState().answer('replace');
    await dropP;
    expect(m).toHaveBeenCalledWith('copy_with_progress', expect.objectContaining({ strategy: 'replace' }));
    spy.mockRestore();
  });

  it('with a collision the user cancels, performs no copy', async () => {
    setDragged(['C:\\src\\a.txt']);
    route({ check_conflicts: [{ name: 'a.txt' }] });
    const dropP = dropInto('C:\\dest', true);
    await vi.waitFor(() => expect(useConflictStore.getState().pending).not.toBeNull());
    useConflictStore.getState().answer(null);
    await dropP;
    expect(m).not.toHaveBeenCalledWith('copy_with_progress', expect.anything());
  });

  it('swallows op errors without refreshing', async () => {
    setDragged(['C:\\src\\a.txt']);
    m.mockImplementation((cmd: string) =>
      cmd === 'check_conflicts' ? Promise.resolve([]) : Promise.reject(new Error('denied')),
    );
    const spy = vi.spyOn(window, 'dispatchEvent');
    await dropInto('C:\\dest', true);
    expect(m).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'lepton:refresh' }));
    expect(useProgressStore.getState().active).toBe(false); // closed in finally even on error
    spy.mockRestore();
  });
});
