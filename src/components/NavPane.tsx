import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SpecialFolder, Drive } from '../types';
import { useLocationStore } from '../state/locationStore';
import { usePinnedStore } from '../state/pinnedStore';
import { dropInto } from '../utils/drop';

export function NavPane() {
  const [folders, setFolders] = useState<SpecialFolder[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const navigate = useLocationStore((s) => s.navigate);
  const pinned = usePinnedStore((s) => s.pinned);
  const [expanded, setExpanded] = useState(true);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    invoke<SpecialFolder[]>('special_folders').then(setFolders);
    invoke<Drive[]>('list_drives').then(setDrives);
  }, []);

  // F6 pane-focus cycling: focus this pane when requested.
  useEffect(() => {
    const onFocus = () => navRef.current?.focus();
    window.addEventListener('winfinder:focus-navpane', onFocus);
    return () => window.removeEventListener('winfinder:focus-navpane', onFocus);
  }, []);

  return (
    <nav className="nav-pane" ref={navRef} tabIndex={0}>
      {pinned.length > 0 && (
        <div className="nav-section">
          {pinned.map((p) => (
            <button key={p.path} className="nav-item"
              onClick={() => navigate(p.path)}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; }}
              onDrop={(e) => { e.preventDefault(); void dropInto(p.path, e.ctrlKey); }}>
              <span aria-hidden>📌</span><span>{p.name}</span>
            </button>
          ))}
        </div>
      )}
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
            <button key={f.key} className="nav-item nav-child" onClick={() => navigate(f.path)} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; }} onDrop={(e) => { e.preventDefault(); void dropInto(f.path, e.ctrlKey); }}>
              <span aria-hidden>📂</span><span>{f.name}</span>
            </button>
          ))}
          {drives.map((d) => (
            <button key={d.letter} className="nav-item nav-child" onClick={() => navigate(d.path)} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; }} onDrop={(e) => { e.preventDefault(); void dropInto(d.path, e.ctrlKey); }}>
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
