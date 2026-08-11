import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSelectionStore } from '../state/selectionStore';
import { useClipboardStore } from '../state/clipboardStore';
import { useLocationStore } from '../state/locationStore';
import { usePinnedStore } from '../state/pinnedStore';
import { useFileOps } from '../hooks/useFileOps';
import { openItem } from '../utils/open';
import { NEW_FILE_KINDS } from '../types';
import { useTagStore, TAG_COLORS } from '../state/tagStore';
import type { Entry } from '../types';

interface Pos { x: number; y: number; }

interface OpenWithAppInfo {
  name: string;
  exe: string;
  isDefault: boolean;
}
interface OpenWithInfo {
  default: OpenWithAppInfo | null;
  apps: OpenWithAppInfo[];
}

export function ContextMenu({ entries }: { entries: Entry[] }) {
  const [pos, setPos] = useState<Pos | null>(null);
  // Final on-screen position after viewport clamping/flip (computed in a layout
  // effect so the menu never overflows the edge and gets clipped).
  const [box, setBox] = useState<Pos | null>(null);
  const boxRef = useRef<Pos | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const [flipLeft, setFlipLeft] = useState(false);
  const sel = useSelectionStore((s) => s.selected);
  const ops = useFileOps();
  const path = useLocationStore((s) => s.path);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  // Name of the system default app for the currently selected file, so the
  // "打开" label can read e.g. "打开（照片）" to make it obvious the file will
  // be opened with the matching system software.
  const [defaultAppName, setDefaultAppName] = useState<string | null>(null);

  useEffect(() => {
    // Select the right-clicked item synchronously so the menu reflects it on first render.
    const onMenu = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.main-view')) return;
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-path]') as HTMLElement | null;
      if (el?.dataset.path && !useSelectionStore.getState().selected.includes(el.dataset.path)) {
        const en = entriesRef.current.find((x) => x.path === el.dataset.path);
        if (en) useSelectionStore.getState().select([en]);
      }
      setPos({ x: e.clientX, y: e.clientY });
    };
    // Don't close when clicking inside the menu itself (lets items work).
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.context-menu')) setPos(null);
    };
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ x: number; y: number }>).detail;
      if (detail) { setPos({ x: detail.x, y: detail.y }); }
    };
    document.addEventListener('contextmenu', onMenu);
    document.addEventListener('click', onClick);
    window.addEventListener('lepton:open-menu', onOpen as EventListener);
    return () => {
      document.removeEventListener('contextmenu', onMenu);
      document.removeEventListener('click', onClick);
      window.removeEventListener('lepton:open-menu', onOpen as EventListener);
    };
  }, []);

  // Resolve the system default app for the selected file so the "打开" label
  // can advertise which software the file will open with.
  useEffect(() => {
    let active = true;
    setDefaultAppName(null);
    const selEntries = entries.filter((e) => sel.includes(e.path));
    if (sel.length === 1 && selEntries[0] && !selEntries[0].isDir) {
      invoke<OpenWithInfo>('get_open_with', { path: selEntries[0].path })
        .then((info) => {
          if (active && info.default) setDefaultAppName(info.default.name);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [sel, pos, entries]);

  // Keep the menu fully inside the viewport. If it would overflow the bottom
  // (or right) edge, flip it upward (or leftward) so it is never clipped.
  useLayoutEffect(() => {
    if (!pos || !menuRef.current) return;
    const m = menuRef.current;
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const margin = 4;
    let x = pos.x;
    let y = pos.y;
    let flippedX = false;
    if (x + w + margin > vw) {
      x = Math.max(margin, vw - w - margin);
      flippedX = true;
    }
    if (y + h + margin > vh) {
      y = Math.max(margin, vh - h - margin);
    }
    const next = { x, y };
    setBox(next);
    boxRef.current = next;
    setFlipLeft(flippedX);
  }, [pos]);

  if (!pos) return null;
  const selEntries = entries.filter((e) => sel.includes(e.path));
  const hasSel = selEntries.length > 0;
  // Only allow zip/unzip on real filesystem paths (not virtual roots like
  // network: / gallery: where the backend can't resolve a destination).
  const realPath = !path.endsWith(':') && !path.startsWith('network:') && !path.startsWith('gallery:');
  const item = (label: string, fn: () => void, disabled = false) => (
    <li className={`cm-item${disabled ? ' disabled' : ''}`} onClick={() => { if (!disabled) { fn(); setPos(null); } }}>{label}</li>
  );

  // "显示更多选项": invoke the real Windows Shell classic context menu via
  // the Rust backend (IContextMenu COM). Falls back gracefully on error.
  const showMoreOptions = async () => {
    setPos(null);
    const targets = hasSel ? sel : (path ? [path] : []);
    if (!targets.length) return;
    // `boxRef`/`pos` are webview-relative CSS pixels; the native
    // TrackPopupMenuEx expects *screen* pixels, so offset by the window's
    // on-screen position. The Rust side then scales to physical pixels for
    // HiDPI displays.
    const p = boxRef.current ?? pos;
    const sx = Math.round((p?.x ?? 0) + window.screenX);
    const sy = Math.round((p?.y ?? 0) + window.screenY);
    try {
      await invoke('show_classic_menu', { paths: targets, x: sx, y: sy });
      refresh();
    } catch {
      // Non-Windows or COM failure — silently ignore.
    }
  };

  return (
    <ul ref={menuRef} className={`context-menu${flipLeft ? ' flip-left' : ''}`} style={{ left: (box ?? pos).x, top: (box ?? pos).y }}>
      {hasSel && item(sel.length === 1 && defaultAppName ? `打开（${defaultAppName}）` : '打开', () => selEntries.forEach((e) => (e.isDir ? useLocationStore.getState().navigate(e.path) : openItem(e.path))))}
      {(() => {
        const en = selEntries[0];
        const show = sel.length === 1 && !en?.isDir;
        if (!show) return null;
        return item('打开方式', () =>
          window.dispatchEvent(new CustomEvent('lepton:open-with', { detail: en })),
        );
      })()}
      {item('在新标签页中打开', () => { const en = selEntries[0]; if (en?.isDir) useLocationStore.getState().addTab(en.path); }, !(sel.length === 1 && selEntries[0]?.isDir))}
      {(() => {
        const en = selEntries[0];
        const show = sel.length === 1 && en?.isDir;
        if (!show) return null;
        const pinned = usePinnedStore.getState().isPinned(en.path);
        return item(pinned ? '从快速访问取消固定' : '固定到快速访问', () => {
          if (pinned) usePinnedStore.getState().unpin(en.path);
          else usePinnedStore.getState().pin({ name: en.name, path: en.path });
        });
      })()}
      {item('新建文件夹', () => ops.newFolder(path))}
      <li className="cm-item cm-has-submenu">新建文件 ▸
        <ul className="cm-submenu">
          {NEW_FILE_KINDS.map((k) => (
            <li key={k.ext} className="cm-item" onClick={() => { ops.newTypedFile(path, k.label, k.ext); setPos(null); }}>{k.label} (.{k.ext})</li>
          ))}
        </ul>
      </li>
      <li className="cm-sep" />
      {item('压缩为 ZIP', () => ops.zip(selEntries.map((e) => e.path), path), !hasSel || !realPath)}
      {(() => {
        const en = selEntries[0];
        const show = realPath && sel.length === 1 && en && !en.isDir && /\.zip$/i.test(en.name);
        if (!show) return null;
        return item('解压到文件夹', () => ops.unzip(en.path, path));
      })()}
      {item('剪切', () => useClipboardStore.getState().cut(selEntries), !hasSel)}
      {item('复制', () => useClipboardStore.getState().copy(selEntries), !hasSel)}
      {item('复制路径', () => ops.copyPath(sel.join('\n')), !hasSel)}
      {item('粘贴', () => ops.paste(path))}
      {item('在终端打开', () => { const en = selEntries[0]; ops.openTerminal(en && en.isDir ? en.path : path); })}
      {item('重命名', () => window.dispatchEvent(new CustomEvent('lepton:rename', { detail: sel[0] })), sel.length !== 1)}
      {item('删除', () => ops.remove(sel, false), !hasSel)}
      <li className={`cm-item cm-has-submenu${sel.length === 1 ? '' : ' disabled'}`}>标签 ▸
        <ul className="cm-submenu">
          <li className="cm-item" onClick={() => { if (sel[0]) useTagStore.getState().clearTag(sel[0]); setPos(null); }}>无</li>
          {TAG_COLORS.map((c) => (
            <li key={c.key} className="cm-item" onClick={() => { if (sel[0]) useTagStore.getState().setTag(sel[0], c.key); setPos(null); }}>
              <span style={{ color: c.hex }}>●</span>&nbsp; {c.label}
            </li>
          ))}
        </ul>
      </li>
      {item('属性', () => { const en = selEntries[0]; if (en) window.dispatchEvent(new CustomEvent('lepton:properties', { detail: en })); }, sel.length !== 1)}
      <li className="cm-sep" />
      {item('全选', () => useSelectionStore.getState().select(entries))}
      {item('反转选择', () => {
        const cur = useSelectionStore.getState().selected;
        const newSel = entries.filter((e) => !cur.includes(e.path)).map((e) => e.path);
        useSelectionStore.setState({ selected: newSel, anchor: newSel[newSel.length - 1] ?? null });
      })}
      {item('刷新', () => window.dispatchEvent(new CustomEvent('lepton:refresh')))}
      <li className="cm-sep" />
      <li className="cm-item" onClick={(e) => { e.stopPropagation(); void showMoreOptions(); }}>显示更多选项 ▾</li>
    </ul>
  );
}

function refresh() {
  window.dispatchEvent(new CustomEvent('lepton:refresh'));
}
