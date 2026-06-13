import { openPath } from '@tauri-apps/plugin-opener';

export async function openItem(path: string) {
  try {
    await openPath(path);
  } catch {
    // ignore open errors
  }
}
