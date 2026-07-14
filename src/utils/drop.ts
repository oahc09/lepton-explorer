import { invoke } from '@tauri-apps/api/core';
import { getDragged } from './drag';
import { parentOf } from '../state/locationStore';
import { useConflictStore } from '../state/conflictStore';
import { useProgressStore } from '../state/progressStore';
import type { ConflictInfo, ConflictStrategy } from '../types';

// Move (or copy if `copy`) the currently-dragged paths into `destDir`. Mirrors the
// paste flow: checks for collisions (Replace/Skip/Keep-both dialog) and shows a
// progress dialog for long copies / cross-volume moves. Refreshes via the app event.
export async function dropInto(destDir: string, copy: boolean) {
  const sources = getDragged();
  if (!sources.length) return;
  try {
    if (!copy && sources.every((p) => parentOf(p) === destDir)) return; // moving into its own folder: no-op

    // Collision check + conflict dialog (same as paste).
    const conflicts = await invoke<ConflictInfo[]>('check_conflicts', { sources, dest: destDir });
    let strategy: ConflictStrategy = 'rename';
    if (conflicts.length) {
      const choice = await useConflictStore.getState().ask(conflicts.map((c) => c.name));
      if (choice === null) return; // cancelled
      strategy = choice;
    }

    useProgressStore.getState().open('copy');
    try {
      if (copy) await invoke('copy_with_progress', { sources, dest: destDir, strategy });
      else await invoke('move_with_progress', { sources, dest: destDir, strategy });
    } finally {
      useProgressStore.getState().close();
    }
    window.dispatchEvent(new CustomEvent('winfinder:refresh'));
  } catch (e) {
    // op errors (permission denied, in-use, etc.) — don't refresh on failure, but log for diagnosis
    console.warn('dropInto failed', e);
  }
}
