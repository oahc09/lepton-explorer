import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

let counter = 0;
export async function newWindow() {
  counter += 1;
  // Unique label per window; loads the same frontend (own independent state).
  const label = `win-${Date.now()}-${counter}`;
  try {
    await new WebviewWindow(label, {
      url: 'index.html',
      title: 'WinFinder',
      width: 1000,
      height: 700,
    });
  } catch {
    // ignore creation errors
  }
}
