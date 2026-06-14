import { useEffect, useState } from 'react';
import { useSelectionStore } from '../state/selectionStore';
import { useClipboardStore } from '../state/clipboardStore';
import { useLocationStore } from '../state/locationStore';
import { usePinnedStore } from '../state/pinnedStore';
import { useFileOps } from '../hooks/useFileOps';
import { openItem } from '../utils/open';
import type { Entry } from '../types';

interface Pos { x: number; y: number; }

export function ContextMenu({ entries }: { entries: Entry[] }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [more, setMore] = useState(false);
  const sel = useSelectionStore((s) => s.selected);
  const ops = useFileOps();
  const path = useLocationStore((s) => s.path);

  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.main-view')) {
        e.preventDefault();
        setMore(false);
        setPos({ x: e.clientX, y: e.clientY });
      }
    };
    const onClick = () => setPos(null);
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ x: number; y: number }>).detail;
      if (detail) { setMore(false); setPos({ x: detail.x, y: detail.y }); }
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

  // Select the right-clicked item (if not already in selection) before showing the menu.
  useEffect(() => {
    if (!pos) return;
    const el = document.elementFromPoint(pos.x, pos.y)?.closest('[data-path]') as HTMLElement | null;
    if (el?.dataset.path && !sel.includes(el.dataset.path)) {
      const en = entries.find((e) => e.path === el.dataset.path);
      if (en) useSelectionStore.getState().select([en]);
    }
  }, [pos, sel, entries]);

  if (!pos) return null;
  const selEntries = entries.filter((e) => sel.includes(e.path));
  const hasSel = selEntries.length > 0;
  const item = (label: string, fn: () => void, disabled = false) => (
    <li className={`cm-item${disabled ? ' disabled' : ''}`} onClick={() => { if (!disabled) { fn(); setPos(null); } }}>{label}</li>
  );
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
      {item('剪切', () => useClipboardStore.getState().cut(selEntries), !hasSel)}
      {item('复制', () => useClipboardStore.getState().copy(selEntries), !hasSel)}
      {item('粘贴', () => ops.paste(path))}
      {item('重命名', () => window.dispatchEvent(new CustomEvent('winfinder:rename', { detail: sel[0] })), sel.length !== 1)}
      {item('删除', () => ops.remove(sel, false), !hasSel)}
      {item('属性', () => { const en = selEntries[0]; if (en) window.dispatchEvent(new CustomEvent('winfinder:properties', { detail: en })); }, sel.length !== 1)}
      <li className="cm-sep" />
      {!more && (
        <li className="cm-item" onClick={(e) => { e.stopPropagation(); setMore(true); }}>显示更多选项 ▾</li>
      )}
      {more && (
        <>
          {item('全选', () => useSelectionStore.getState().select(entries))}
          {item('反转选择', () => {
            const cur = useSelectionStore.getState().selected;
            const newSel = entries.filter((e) => !cur.includes(e.path)).map((e) => e.path);
            useSelectionStore.setState({ selected: newSel, anchor: newSel[newSel.length - 1] ?? null });
          })}
          {item('刷新', () => window.dispatchEvent(new CustomEvent('winfinder:refresh')))}
        </>
      )}
    </ul>
  );
}
