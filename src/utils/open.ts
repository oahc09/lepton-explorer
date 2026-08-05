import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import { useRecentStore } from '../state/recentStore';

export async function openItem(path: string) {
  try {
    try {
      // Prefer the backend handler: it resolves the system's default program
      // for the file type (so PNGs etc. open with the corresponding software).
      await invoke('open_file', { path });
    } catch {
      // Fallback for non-Windows or if the backend command is unavailable.
      await openPath(path);
    }
    const name = path.replace(/^.*[\\/]/, '') || path;
    useRecentStore.getState().addRecent({ name, path });
  } catch {
    /* ignore open errors */
  }
}
