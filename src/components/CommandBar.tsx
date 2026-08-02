import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Entry, ViewMode } from '../types';
import { useSelectionStore } from '../state/selectionStore';
import { useClipboardStore } from '../state/clipboardStore';
import { useLocationStore } from '../state/locationStore';
import { useViewStore } from '../state/viewStore';
import { useFileOps } from '../hooks/useFileOps';

const VIEWS: { mode: ViewMode; label: string }[] = [
  { mode: 'extra-large', label: '超大图标' }, { mode: 'large', label: '大图标' },
  { mode: 'medium', label: '中等图标' }, { mode: 'small', label: '小图标' },
  { mode: 'list', label: '列表' }, { mode: 'details', label: '详细信息' },
  { mode: 'tiles', label: '平铺' }, { mode: 'content', label: '内容' },
];

// Priority order: first in array = most important (always visible).
// When space is tight, items from the end are hidden into overflow first.
const BUTTON_ORDER = ['new', 'cut', 'copy', 'rename', 'delete', 'paste', 'view', 'sort'] as const;
type ButtonId = (typeof BUTTON_ORDER)[number];

export function CommandBar({ entries }: { entries: Entry[] }) {
  const selected = useSelectionStore((s) => s.selected);
  const hasSel = selected.length > 0;
  const path = useLocationStore((s) => s.path);
  const ops = useFileOps();
  const selEntries = entries.filter((en) => selected.includes(en.path));

  const [open, setOpen] = useState<null | 'view' | 'sort' | 'new' | 'overflow'>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<string, HTMLElement>>(new Map());
  const widthCache = useRef<Map<string, number>>(new Map());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const viewMode = useViewStore((s) => s.viewMode);
  const sort = useViewStore((s) => s.sort);
  const colVisible = useViewStore((s) => s.colVisible);
  const groupBy = useViewStore((s) => s.groupBy);
  const showExtensionsFlag = useViewStore((s) => s.showExtensions);
  const showHiddenFlag = useViewStore((s) => s.showHidden);

  // Measure buttons and compute overflow. Runs on mount + resize.
  // On first pass all buttons are visible → cache their real widths.
  // Subsequent passes use cached widths (hidden buttons aren't measurable).
  useLayoutEffect(() => {
    if (!barRef.current) return;
    const measure = () => {
      const bar = barRef.current!;
      const available = bar.clientWidth - 24; // subtract padding
      const OVERFLOW_W = 44; // "⋯" button + gap

      // Cache widths of currently-visible buttons.
      for (const [id, el] of buttonRefs.current) {
        if (el.offsetWidth > 0) widthCache.current.set(id, el.offsetWidth);
      }

      // Compute how many buttons fit left-to-right by priority.
      let total = 0;
      const newHidden = new Set<string>();
      let hitOverflow = false;
      for (const id of BUTTON_ORDER) {
        const w = widthCache.current.get(id) ?? 80;
        if (!hitOverflow) {
          total += w + 6;
          if (total > available - OVERFLOW_W) {
            hitOverflow = true;
          }
        }
        if (hitOverflow) newHidden.add(id);
      }
      // If nothing overflows, clear.
      if (!hitOverflow) newHidden.clear();

      setHiddenIds((prev) => {
        if (prev.size === newHidden.size && [...prev].every((x) => newHidden.has(x))) return prev;
        return newHidden;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(barRef.current);
    return () => ro.disconnect();
  }, []);

  // Helper: render a button, tracking its ref + width.
  const cmdButton = (id: ButtonId, label: string, props: { disabled?: boolean; onClick: () => void; hasFlyout?: boolean }) => {
    const isHidden = hiddenIds.has(id);
    return (
      <span
        data-cmd-id={id}
        ref={(el) => { if (el) buttonRefs.current.set(id, el); else buttonRefs.current.delete(id); }}
        style={{ position: 'relative', display: isHidden ? 'none' : undefined }}
      >
        <button className="cmd" disabled={props.disabled} onClick={props.onClick}>{label}</button>
        {props.hasFlyout && open === id && renderFlyout(id)}
      </span>
    );
  };

  const renderFlyout = (id: string) => {
    if (id === 'new') return (
      <ul className="flyout">
        <li className="flyout-item" onClick={() => { ops.newFolder(path); setOpen(null); }}>文件夹</li>
        <li className="flyout-item" onClick={() => { ops.newFile(path); setOpen(null); }}>文本文档</li>
      </ul>
    );
    if (id === 'view') return (
      <ul className="flyout">
        {VIEWS.map((v) => (
          <li key={v.mode} className={`flyout-item${viewMode === v.mode ? ' checked' : ''}`} onClick={() => { useViewStore.getState().setViewMode(v.mode); setOpen(null); }}>{v.label}</li>
        ))}
        <li className="flyout-sep" />
        <li className={`flyout-item${showExtensionsFlag ? ' checked' : ''}`} onClick={() => { useViewStore.getState().toggleExtensions(); }}>文件扩展名</li>
        <li className={`flyout-item${showHiddenFlag ? ' checked' : ''}`} onClick={() => { useViewStore.getState().toggleHidden(); }}>隐藏的项目</li>
      </ul>
    );
    if (id === 'sort') return (
      <ul className="flyout">
        {([['name', '名称'], ['modified', '修改日期'], ['type', '类型'], ['size', '大小']] as const).map(([f, label]) => (
          <li key={f} className={`flyout-item${sort.field === f ? ' checked' : ''}`} onClick={() => { useViewStore.getState().setSort(f); setOpen(null); }}>{label}{sort.field === f ? (sort.asc ? ' ▲' : ' ▼') : ''}</li>
        ))}
        <li className="flyout-sep" />
        <li className="flyout-item flyout-static" aria-hidden>分组依据</li>
        <li className={`flyout-item${groupBy === null ? ' checked' : ''}`} onClick={() => { useViewStore.getState().setGroupBy(null); setOpen(null); }}>(无)</li>
        {([['name', '名称'], ['modified', '修改日期'], ['type', '类型'], ['size', '大小']] as const).map(([f, label]) => (
          <li key={`g-${f}`} className={`flyout-item${groupBy === f ? ' checked' : ''}`} onClick={() => { useViewStore.getState().setGroupBy(f); setOpen(null); }}>{label}</li>
        ))}
        <li className="flyout-sep" />
        <li className="flyout-item flyout-static" aria-hidden>列（名称常显）</li>
        {([['date', '修改日期'], ['type', '类型'], ['size', '大小']] as const).map(([key, label]) => (
          <li key={key} className={`flyout-item${colVisible[key] ? ' checked' : ''}`} onClick={() => { useViewStore.getState().toggleCol(key); }}>{label}</li>
        ))}
      </ul>
    );
    return null;
  };

  // Overflow flyout: shows the hidden buttons as a vertical list.
  const overflowItems = BUTTON_ORDER.filter((id) => hiddenIds.has(id));

  return (
    <div className="command-bar" ref={barRef}>
      {cmdButton('new', '新建 ▾', { onClick: () => setOpen(open === 'new' ? null : 'new'), hasFlyout: true })}
      {cmdButton('cut', '剪切', { disabled: !hasSel, onClick: () => useClipboardStore.getState().cut(selEntries) })}
      {cmdButton('copy', '复制', { disabled: !hasSel, onClick: () => useClipboardStore.getState().copy(selEntries) })}
      {cmdButton('rename', '重命名', { disabled: selected.length !== 1, onClick: () => window.dispatchEvent(new CustomEvent('lepton:rename', { detail: selected[0] })) })}
      {cmdButton('delete', '删除', { disabled: !hasSel, onClick: () => ops.remove(selected, false) })}
      {cmdButton('paste', '粘贴', { onClick: () => ops.paste(path) })}
      {cmdButton('view', '视图 ▾', { onClick: () => setOpen(open === 'view' ? null : 'view'), hasFlyout: true })}
      {cmdButton('sort', '排序 ▾', { onClick: () => setOpen(open === 'sort' ? null : 'sort'), hasFlyout: true })}

      {overflowItems.length > 0 && (
        <span style={{ position: 'relative' }}>
          <button className="cmd cmd-overflow" onClick={() => setOpen(open === 'overflow' ? null : 'overflow')}>⋯</button>
          {open === 'overflow' && (
            <ul className="flyout" style={{ right: 0, left: 'auto' }}>
              {overflowItems.includes('new') && <li className="flyout-item" onClick={() => { setOpen('new'); }}>新建 ▾</li>}
              {overflowItems.includes('cut') && <li className={`flyout-item${!hasSel ? ' disabled' : ''}`} onClick={() => { if (hasSel) { useClipboardStore.getState().cut(selEntries); setOpen(null); } }}>剪切</li>}
              {overflowItems.includes('copy') && <li className={`flyout-item${!hasSel ? ' disabled' : ''}`} onClick={() => { if (hasSel) { useClipboardStore.getState().copy(selEntries); setOpen(null); } }}>复制</li>}
              {overflowItems.includes('rename') && <li className={`flyout-item${selected.length !== 1 ? ' disabled' : ''}`} onClick={() => { if (selected.length === 1) { window.dispatchEvent(new CustomEvent('lepton:rename', { detail: selected[0] })); setOpen(null); } }}>重命名</li>}
              {overflowItems.includes('delete') && <li className={`flyout-item${!hasSel ? ' disabled' : ''}`} onClick={() => { if (hasSel) { ops.remove(selected, false); setOpen(null); } }}>删除</li>}
              {overflowItems.includes('paste') && <li className="flyout-item" onClick={() => { ops.paste(path); setOpen(null); }}>粘贴</li>}
              {overflowItems.includes('view') && <li className="flyout-item" onClick={() => { setOpen('view'); }}>视图 ▾</li>}
              {overflowItems.includes('sort') && <li className="flyout-item" onClick={() => { setOpen('sort'); }}>排序 ▾</li>}
            </ul>
          )}
        </span>
      )}
    </div>
  );
}
