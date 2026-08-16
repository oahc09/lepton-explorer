import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SpecialFolder, Drive } from '../types';
import { GALLERY_ROOT, NETWORK_ROOT, THISPC_ROOT } from '../types';
import { useLocationStore } from '../state/locationStore';
import { usePinnedStore } from '../state/pinnedStore';
import { useViewStore } from '../state/viewStore';
import { dropInto } from '../utils/drop';

export function NavPane() {
  const [folders, setFolders] = useState<SpecialFolder[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const navigate = useLocationStore((s) => s.navigate);
  const pinned = usePinnedStore((s) => s.pinned);
  const [expanded, setExpanded] = useState(true);
  const navRef = useRef<HTMLElement>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const navPaneWidth = useViewStore((s) => s.navPaneWidth);

  useEffect(() => {
    invoke<SpecialFolder[]>('special_folders').then(setFolders);
    invoke<Drive[]>('list_drives').then(setDrives);
  }, []);

  // Shared drag handlers + highlight class for drop targets (Win11 highlights the
  // folder being dragged over). `onDragLeave` only clears when leaving THIS item.
  const dropProps = (p: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; setDragOver(p); },
    onDragLeave: () => setDragOver((cur) => (cur === p ? null : cur)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setDragOver(null); void dropInto(p, e.ctrlKey); },
  });
  const dropClass = (p: string, base: string) => dragOver === p ? `${base} drag-over` : base;

  // F6 pane-focus cycling: focus this pane when requested.
  useEffect(() => {
    const onFocus = () => navRef.current?.focus();
    window.addEventListener('lepton:focus-navpane', onFocus);
    return () => window.removeEventListener('lepton:focus-navpane', onFocus);
  }, []);

  return (
    <nav className="nav-pane" ref={navRef} tabIndex={0} style={{ width: navPaneWidth }}>
      {pinned.length > 0 && (
        <div className="nav-section">
          {pinned.map((p) => (
            <button key={p.path} className={dropClass(p.path, 'nav-item')}
              onClick={() => navigate(p.path)}
              {...dropProps(p.path)}>
              <span aria-hidden>📌</span><span>{p.name}</span>
            </button>
          ))}
        </div>
      )}
      <button className="nav-item" onClick={() => navigate('')}>
        <span aria-hidden>🏠</span><span>主页</span>
      </button>
      <button className="nav-item" onClick={() => {
        invoke<string>('get_special_folder', { kind: 'onedrive' })
          .then((p) => { if (p) navigate(p); })
          .catch(() => {});
      }}>
        <span aria-hidden>☁️</span><span>OneDrive</span>
      </button>
      <button className="nav-item" onClick={() => {
        navigate(GALLERY_ROOT);
        useViewStore.getState().setViewMode('large');
      }}>
        <span aria-hidden>🖼️</span><span>Gallery</span>
      </button>
      <div className="nav-item nav-group-label">
        <span aria-hidden>📁</span><span>快速访问</span>
      </div>
      <div className="nav-group">
        {folders.filter((f) => f.key !== 'home').map((f) => (
          <button key={f.key} className={dropClass(f.path, 'nav-item nav-child')} onClick={() => navigate(f.path)} {...dropProps(f.path)}>
            <span aria-hidden>{iconFor(f.key)}</span><span>{f.name}</span>
          </button>
        ))}
      </div>
      <div className="nav-item nav-group-label">
        <span aria-hidden className="nav-caret" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}>
          {expanded ? '▾' : '▸'}
        </span>
        <span className="nav-group-title" onClick={() => navigate(THISPC_ROOT)}>💻 此电脑</span>
      </div>
      {expanded && (
        <div className="nav-group">
          {drives.map((d) => (
            <button key={d.letter} className={dropClass(d.path, 'nav-item nav-child')} onClick={() => navigate(d.path)} {...dropProps(d.path)}>
              <span aria-hidden>💽</span><span>{d.letter}</span>
            </button>
          ))}
          <button className="nav-item nav-child" onClick={() => navigate(NETWORK_ROOT)}>
            <span aria-hidden>🌐</span><span>网络</span>
          </button>
        </div>
      )}
    </nav>
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
