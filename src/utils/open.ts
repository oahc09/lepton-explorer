import { openPath } from '@tauri-apps/plugin-opener';
import { useRecentStore } from '../state/recentStore';

export async function openItem(path: string) {
  try {
    await openPath(path);
    const name = path.replace(/^.*[\\/]/, '') || path;
    useRecentStore.getState().addRecent({ name, path });
  } catch {
    /* ignore open errors */
  }
}
