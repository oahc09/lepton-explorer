import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Entry } from '../types';

interface OpenWithApp {
  name: string;
  exe: string;
  isDefault: boolean;
}

interface OpenWithInfo {
  default: OpenWithApp | null;
  apps: OpenWithApp[];
}

export function OpenWithDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const [apps, setApps] = useState<OpenWithApp[]>([]);
  const [defaultApp, setDefaultApp] = useState<OpenWithApp | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    invoke<OpenWithInfo>('get_open_with', { path: entry.path })
      .then((info) => {
        if (!active) return;
        setDefaultApp(info.default);
        setApps(info.apps);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [entry.path]);

  // Resolve each app's icon (exe path -> system icon) via the existing get_icon command.
  useEffect(() => {
    const all = defaultApp ? [defaultApp, ...apps] : apps;
    all.forEach((a) => {
      if (!a.exe || icons[a.exe]) return;
      invoke<string | null>('get_icon', { path: a.exe, size: 32 })
        .then((url) => {
          if (url) setIcons((m) => ({ ...m, [a.exe]: url }));
        })
        .catch(() => {});
    });
  }, [defaultApp, apps, icons]);

  const launch = (exe: string) => {
    invoke('open_with_path', { path: entry.path, exe }).catch(() => {});
    onClose();
  };

  const pickOther = () => {
    invoke('open_with_dialog', { path: entry.path }).catch(() => {});
    onClose();
  };

  const list = defaultApp
    ? [defaultApp, ...apps.filter((a) => a.exe !== defaultApp.exe)]
    : apps;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal open-with" onClick={(e) => e.stopPropagation()}>
        <h3>你要如何打开此文件？</h3>
        <p className="ow-sub">“{entry.name}”</p>
        <div className="ow-list">
          {list.length === 0 && (
            <div className="empty">未找到可打开此文件类型的应用。</div>
          )}
          {list.map((a) => (
            <button key={a.exe} className="ow-item" onClick={() => launch(a.exe)}>
              {icons[a.exe] ? (
                // get_icon returns raw base64 PNG — needs a data: URL prefix.
                <img src={`data:image/png;base64,${icons[a.exe]}`} className="ow-icon" alt="" />
              ) : (
                <span className="ow-icon ow-icon-fallback" aria-hidden>
                  ▤
                </span>
              )}
              <span className="ow-name">
                {a.name}
                {a.isDefault ? '（推荐）' : ''}
              </span>
            </button>
          ))}
          <button className="ow-item ow-other" onClick={pickOther}>
            <span className="ow-icon ow-icon-fallback" aria-hidden>
              ⌕
            </span>
            <span className="ow-name">在这台电脑上查找另一个应用</span>
          </button>
        </div>
        <div className="modal-actions">
          <button className="cmd" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
