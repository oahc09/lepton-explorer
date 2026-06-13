import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useRecentStore } from '../../state/recentStore';
import { openItem } from '../../utils/open';
import type { SpecialFolder } from '../../types';

export function HomeView({ onOpen }: { onOpen: (path: string) => void }) {
  const [folders, setFolders] = useState<SpecialFolder[]>([]);
  useEffect(() => { invoke<SpecialFolder[]>('special_folders').then(setFolders).catch(() => {}); }, []);
  const cards = folders.filter((f) => f.key !== 'home');
  const recent = useRecentStore((s) => s.recent);
  return (
    <div className="home">
      <h2 className="home-section">快速访问</h2>
      <div className="home-grid">
        {cards.map((f) => (
          <button key={f.key} className="home-card" onClick={() => onOpen(f.path)}>
            <span className="home-icon">{iconFor(f.key)}</span>
            <span className="home-label">{f.name}</span>
          </button>
        ))}
      </div>
      {recent.length > 0 && (
        <>
          <h2 className="home-section" style={{ marginTop: 24 }}>最近使用的文件</h2>
          <div className="home-recent">
            {recent.map((r) => (
              <button key={r.path} className="home-recent-item" onClick={() => openItem(r.path)}>
                <span aria-hidden>📄</span><span>{r.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function iconFor(key: string): string {
  switch (key) {
    case 'desktop': return '🖥️';
    case 'documents': return '📄';
    case 'downloads': return '⬇️';
    case 'pictures': return '🖼️';
    case 'music': return '🎵';
    case 'videos': return '🎬';
    default: return '📁';
  }
}
