import { useEffect, useRef, useState } from 'react';
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

export function CommandBar({ entries }: { entries: Entry[] }) {
  const selected = useSelectionStore((s) => s.selected);
  const hasSel = selected.length > 0;
  const path = useLocationStore((s) => s.path);
  const ops = useFileOps();
  const selEntries = entries.filter((en) => selected.includes(en.path));

  const [open, setOpen] = useState<null | 'view' | 'sort' | 'new'>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const viewMode = useViewStore((s) => s.viewMode);
  const sort = useViewStore((s) => s.sort);
  const colVisible = useViewStore((s) => s.colVisible);
  const showExtensionsFlag = useViewStore((s) => s.showExtensions);
  const showHiddenFlag = useViewStore((s) => s.showHidden);

  return (
    <div className="command-bar" ref={barRef}>
      <span style={{ position: 'relative' }}>
        <button className="cmd" onClick={() => setOpen(open === 'new' ? null : 'new')}>新建 ▾</button>
        {open === 'new' && (
          <ul className="flyout">
            <li className="flyout-item" onClick={() => { ops.newFolder(path); setOpen(null); }}>文件夹</li>
            <li className="flyout-item" onClick={() => { ops.newFile(path); setOpen(null); }}>文本文档</li>
          </ul>
        )}
      </span>
      <button className="cmd" disabled={!hasSel} onClick={() => useClipboardStore.getState().cut(selEntries)}>剪切</button>
      <button className="cmd" disabled={!hasSel} onClick={() => useClipboardStore.getState().copy(selEntries)}>复制</button>
      <button className="cmd" disabled={selected.length !== 1} onClick={() => window.dispatchEvent(new CustomEvent('winfinder:rename', { detail: selected[0] }))}>重命名</button>
      <button className="cmd" disabled={!hasSel} onClick={() => ops.remove(selected, false)}>删除</button>
      <button className="cmd" onClick={() => ops.paste(path)}>粘贴</button>
      <span style={{ position: 'relative' }}>
        <button className="cmd" onClick={() => setOpen(open === 'view' ? null : 'view')}>视图 ▾</button>
        {open === 'view' && (
          <ul className="flyout">
            {VIEWS.map((v) => (
              <li key={v.mode} className={`flyout-item${viewMode === v.mode ? ' checked' : ''}`} onClick={() => { useViewStore.getState().setViewMode(v.mode); setOpen(null); }}>{v.label}</li>
            ))}
            <li className="flyout-sep" />
            <li className={`flyout-item${showExtensionsFlag ? ' checked' : ''}`} onClick={() => { useViewStore.getState().toggleExtensions(); }}>文件扩展名</li>
            <li className={`flyout-item${showHiddenFlag ? ' checked' : ''}`} onClick={() => { useViewStore.getState().toggleHidden(); }}>隐藏的项目</li>
          </ul>
        )}
      </span>
      <span style={{ position: 'relative' }}>
        <button className="cmd" onClick={() => setOpen(open === 'sort' ? null : 'sort')}>排序 ▾</button>
        {open === 'sort' && (
          <ul className="flyout">
            {([['name', '名称'], ['modified', '修改日期'], ['type', '类型'], ['size', '大小']] as const).map(([f, label]) => (
              <li key={f} className={`flyout-item${sort.field === f ? ' checked' : ''}`} onClick={() => { useViewStore.getState().setSort(f); setOpen(null); }}>{label}{sort.field === f ? (sort.asc ? ' ▲' : ' ▼') : ''}</li>
            ))}
            <li className="flyout-sep" />
            <li className="flyout-item flyout-static" aria-hidden>列（名称常显）</li>
            {([['date', '修改日期'], ['type', '类型'], ['size', '大小']] as const).map(([key, label]) => (
              <li key={key} className={`flyout-item${colVisible[key] ? ' checked' : ''}`} onClick={() => { useViewStore.getState().toggleCol(key); }}>{label}</li>
            ))}
          </ul>
        )}
      </span>
    </div>
  );
}
