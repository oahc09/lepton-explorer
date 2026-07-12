import { useEffect, useRef, useState } from 'react';
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

export function ContextMenu({ entries }: { entries: Entry[] }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const sel = useSelectionStore((s) => s.selected);
  const ops = useFileOps();
  const path = useLocationStore((s) => s.path);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

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
    window.addEventListener('winfinder:open-menu', onOpen as EventListener);
    return () => {
      document.removeEventListener('contextmenu', onMenu);
      document.removeEventListener('click', onClick);
      window.removeEventListener('winfinder:open-menu', onOpen as EventListener);
    };
  }, []);

  if (!pos) return null;
  const selEntries = entries.filter((e) => sel.includes(e.path));
  const hasSel = selEntries.length > 0;
  const item = (label: string, fn: () => void, disabled = false) => (
    <li className={`cm-item${disabled ? ' disabled' : ''}`} onClick={() => { if (!disabled) { fn(); setPos(null); } }}>{label}</li>
  );

  // "显示更多选项": invoke the real Windows Shell classic context menu via
  // the Rust backend (IContextMenu COM). Falls back gracefully on error.
  const showMoreOptions = async () => {
    setPos(null);
    const targets = hasSel ? sel : (path ? [path] : []);
    if (!targets.length) return;
    try {
      await invoke('show_classic_menu', { paths: targets, x: Math.round(pos.x), y: Math.round(pos.y) });
      refresh();
    } catch {
      // Non-Windows or COM failure — silently ignore.
    }
  };

  return (
    <ul className="context-menu" style={{ left: pos.x, top: pos.y }}>
      {hasSel && item('打开', () => selEntries.forEach((e) => (e.isDir ? useLocationStore.getState().navigate(e.path) : openItem(e.path))))}
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
      {item('剪切', () => useClipboardStore.getState().cut(selEntries), !hasSel)}
      {item('复制', () => useClipboardStore.getState().copy(selEntries), !hasSel)}
      {item('复制路径', () => ops.copyPath(sel.join('\n')), !hasSel)}
      {item('粘贴', () => ops.paste(path))}
      {item('在终端打开', () => { const en = selEntries[0]; ops.openTerminal(en && en.isDir ? en.path : path); })}
      {item('重命名', () => window.dispatchEvent(new CustomEvent('winfinder:rename', { detail: sel[0] })), sel.length !== 1)}
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
      {item('属性', () => { const en = selEntries[0]; if (en) window.dispatchEvent(new CustomEvent('winfinder:properties', { detail: en })); }, sel.length !== 1)}
      <li className="cm-sep" />
      {item('全选', () => useSelectionStore.getState().select(entries))}
      {item('反转选择', () => {
        const cur = useSelectionStore.getState().selected;
        const newSel = entries.filter((e) => !cur.includes(e.path)).map((e) => e.path);
        useSelectionStore.setState({ selected: newSel, anchor: newSel[newSel.length - 1] ?? null });
      })}
      {item('刷新', () => window.dispatchEvent(new CustomEvent('winfinder:refresh')))}
      <li className="cm-sep" />
      <li className="cm-item" onClick={(e) => { e.stopPropagation(); void showMoreOptions(); }}>显示更多选项 ▾</li>
    </ul>
  );
}

function refresh() {
  window.dispatchEvent(new CustomEvent('winfinder:refresh'));
}
