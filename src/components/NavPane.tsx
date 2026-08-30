import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SpecialFolder, Drive } from '../types';
import { GALLERY_ROOT, NETWORK_ROOT, THISPC_ROOT } from '../types';
import { useLocationStore } from '../state/locationStore';
import { usePinnedStore } from '../state/pinnedStore';
import { useViewStore } from '../state/viewStore';
import { dropInto } from '../utils/drop';
import {
  ICON_CHEVRON_DOWN, ICON_CHEVRON_RIGHT, ICON_CLOUD, ICON_HOME, ICON_NETWORK,
  ICON_PICTURE, ICON_PINNED, ICON_STAR, ICON_THIS_PC, iconForFolderKey,
} from '../utils/icons';

export function NavPane() {
  const [folders, setFolders] = useState<SpecialFolder[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const navigate = useLocationStore((s) => s.navigate);
  const pinned = usePinnedStore((s) => s.pinned);
  const [expanded, setExpanded] = useState(true);
  const navRef = useRef<HTMLElement>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const navPaneWidth = useViewStore((s) => s.navPaneWidth);
  const path = useLocationStore((s) => s.path);

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
  // Active = the item currently being browsed. Drives match by prefix, so
  // browsing C:\Foo keeps the C: drive highlighted.
  const isActive = (p: string) => {
    if (p === '') return path === ''; // Home is the empty path
    if (!p || !path) return false;
    const a = p.replace(/[\\/]+$/, '').toLowerCase();
    const b = path.toLowerCase();
    return b === a || b.startsWith(a + '\\') || b.startsWith(a + '/');
  };
  const itemClass = (p: string, base: string) => {
    let cls = base;
    if (isActive(p)) cls += ' active';
    if (dragOver === p) cls += ' drag-over';
    return cls;
  };

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
            <button key={p.path} className={itemClass(p.path, 'nav-item')}
              onClick={() => navigate(p.path)}
              {...dropProps(p.path)}>
              <span aria-hidden className="fi">{ICON_PINNED}</span><span>{p.name}</span>
            </button>
          ))}
        </div>
      )}
      <button className={itemClass('', 'nav-item')} onClick={() => navigate('')}>
        <span aria-hidden className="fi">{ICON_HOME}</span><span>主页</span>
      </button>
      <button className="nav-item" onClick={() => {
        invoke<string>('get_special_folder', { kind: 'onedrive' })
          .then((p) => { if (p) navigate(p); })
          .catch(() => {});
      }}>
        <span aria-hidden className="fi">{ICON_CLOUD}</span><span>OneDrive</span>
      </button>
      <button className={itemClass(GALLERY_ROOT, 'nav-item')} onClick={() => {
        navigate(GALLERY_ROOT);
        useViewStore.getState().setViewMode('large');
      }}>
        <span aria-hidden className="fi">{ICON_PICTURE}</span><span>Gallery</span>
      </button>
      <div className="nav-item nav-group-label">
        <span aria-hidden className="fi">{ICON_STAR}</span><span>快速访问</span>
      </div>
      <div className="nav-group">
        {folders.filter((f) => f.key !== 'home').map((f) => (
          <button key={f.key} className={itemClass(f.path, 'nav-item nav-child')} onClick={() => navigate(f.path)} {...dropProps(f.path)}>
            <span aria-hidden className="fi">{iconForFolderKey(f.key)}</span><span>{f.name}</span>
          </button>
        ))}
      </div>
      <div className="nav-item nav-group-label">
        <span aria-hidden className="nav-caret fi" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}>
          {expanded ? ICON_CHEVRON_DOWN : ICON_CHEVRON_RIGHT}
        </span>
        <span className="nav-group-title" onClick={() => navigate(THISPC_ROOT)}><span aria-hidden className="fi">{ICON_THIS_PC}</span> 此电脑</span>
      </div>
      {expanded && (
        <div className="nav-group">
          {drives.map((d) => (
            <button key={d.letter} className={itemClass(d.path, 'nav-item nav-child')} onClick={() => navigate(d.path)} {...dropProps(d.path)}>
              <span aria-hidden className="nav-drive-icon" /><span>{d.letter}</span>
            </button>
          ))}
          <button className={itemClass(NETWORK_ROOT, 'nav-item nav-child')} onClick={() => navigate(NETWORK_ROOT)}>
            <span aria-hidden className="fi">{ICON_NETWORK}</span><span>网络</span>
          </button>
        </div>
      )}
    </nav>
  );
}
