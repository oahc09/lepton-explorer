import { invoke } from '@tauri-apps/api/core';
import { getDragged } from './drag';

// Move (or copy if `copy`) the currently-dragged paths into `destDir`. Refreshes via the app event.
export async function dropInto(destDir: string, copy: boolean) {
  const sources = getDragged();
  if (!sources.length) return;
  if (copy) await invoke('copy_items', { sources, dest: destDir });
  else await invoke('move_items', { sources, dest: destDir });
  window.dispatchEvent(new CustomEvent('winfinder:refresh'));
}
