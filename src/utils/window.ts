import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

let counter = 0;

/**
 * Open an independent OS window running its own WinFinder instance (Phase 2).
 * Each window is a separate webview with its own independent state; we pass the
 * optional `path` as a URL query so the new window opens on the same folder.
 */
export async function newWindow(path?: string) {
  counter += 1;
  // Unique label per window; loads the same frontend (own independent state).
  const label = `win-${Date.now()}-${counter}`;
  let url = 'index.html';
  if (path) url += `?path=${encodeURIComponent(path)}`;
  try {
    await new WebviewWindow(label, {
      url,
      title: path ? `WinFinder - ${path}` : 'WinFinder',
      width: 1000,
      height: 700,
    });
  } catch {
    // ignore creation errors
  }
}
