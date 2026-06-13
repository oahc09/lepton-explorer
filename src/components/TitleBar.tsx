import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TabBar } from './TabBar';

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const win = getCurrentWindow();

  useEffect(() => {
    let active = true;
    win.isMaximized().then((m) => active && setMaximized(m)).catch(() => {});
    const unlisten = win.onResized(() => win.isMaximized().then((m) => active && setMaximized(m)).catch(() => {}));
    return () => { active = false; unlisten.then((u) => u()); };
  }, [win]);

  return (
    <header className="title-bar" data-tauri-drag-region>
      <TabBar />
      <div className="window-controls">
        <button className="wc wc-min" onClick={() => win.minimize()} title="最小化">—</button>
        <button className="wc wc-max" onClick={() => win.toggleMaximize()} title="最大化">{maximized ? '🗗' : '🗖'}</button>
        <button className="wc wc-close" onClick={() => win.close()} title="关闭">✕</button>
      </div>
    </header>
  );
}
