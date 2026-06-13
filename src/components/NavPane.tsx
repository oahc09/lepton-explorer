import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SpecialFolder, Drive } from '../types';
import { useLocationStore } from '../state/locationStore';

export function NavPane() {
  const [folders, setFolders] = useState<SpecialFolder[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const navigate = useLocationStore((s) => s.navigate);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    invoke<SpecialFolder[]>('special_folders').then(setFolders);
    invoke<Drive[]>('list_drives').then(setDrives);
  }, []);

  return (
    <nav className="nav-pane">
      <button className="nav-item" onClick={() => navigate('')}>
        <span aria-hidden>🏠</span><span>主页</span>
      </button>
      <button className="nav-item" onClick={() => {}}>
        <span aria-hidden>🖼️</span><span>Gallery</span>
      </button>
      <div className="nav-item nav-group-label" onClick={() => setExpanded((e) => !e)}>
        <span aria-hidden>{expanded ? '▾' : '▸'}💻</span><span>此电脑</span>
      </div>
      {expanded && (
        <div className="nav-group">
          {folders.filter((f) => f.key !== 'home').map((f) => (
            <button key={f.key} className="nav-item nav-child" onClick={() => navigate(f.path)}>
              <span aria-hidden>📂</span><span>{f.name}</span>
            </button>
          ))}
          {drives.map((d) => (
            <button key={d.letter} className="nav-item nav-child" onClick={() => navigate(d.path)}>
              <span aria-hidden>💽</span><span>{d.letter}</span>
            </button>
          ))}
          <button className="nav-item nav-child" onClick={() => {}}>
            <span aria-hidden>🌐</span><span>网络</span>
          </button>
        </div>
      )}
    </nav>
  );
}
