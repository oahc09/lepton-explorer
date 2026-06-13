import { invoke } from '@tauri-apps/api/core';
import { getDragged } from './drag';

const parentOf = (p: string) => {
  const norm = p.replace(/\//g, '\\').replace(/\\+$/, '');
  const idx = norm.lastIndexOf('\\');
  return idx <= 2 ? norm.slice(0, 3) : norm.slice(0, idx);
};

// Move (or copy if `copy`) the currently-dragged paths into `destDir`. Refreshes via the app event.
export async function dropInto(destDir: string, copy: boolean) {
  const sources = getDragged();
  if (!sources.length) return;
  try {
    if (!copy && sources.every((p) => parentOf(p) === destDir)) return; // moving into its own folder: no-op
    if (copy) await invoke('copy_items', { sources, dest: destDir });
    else await invoke('move_items', { sources, dest: destDir });
    window.dispatchEvent(new CustomEvent('winfinder:refresh'));
  } catch {
    // ignore op errors (e.g. permission denied, in-use) — don't refresh on failure
  }
}
