import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef } from 'react';
import type { Entry, SortField } from '../../types';
import { useViewStore } from '../../state/viewStore';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { formatDate, formatSize } from '../../utils/format';
import { displayName } from '../../utils/display';
import { useSorted, handleClick, useOpen } from './detailsHelpers';
import { openItem } from '../../utils/open';
import { setDragged } from '../../utils/drag';
import { dropInto } from '../../utils/drop';
import { Thumbnail } from '../Thumbnail';

const ROW_H = 32;

/** Details-view column descriptors (key, header label, sort field, width key). */
type ColKey = 'name' | 'date' | 'type' | 'size';
const COLS: { key: ColKey; label: string; sortField: SortField; widthKey: ColKey }[] = [
  { key: 'name', label: '名称', sortField: 'name', widthKey: 'name' },
  { key: 'date', label: '修改日期', sortField: 'modified', widthKey: 'date' },
  { key: 'type', label: '类型', sortField: 'type', widthKey: 'type' },
  { key: 'size', label: '大小', sortField: 'size', widthKey: 'size' },
];

export function DetailsView({ entries, renamingPath, onRenameCommit }: { entries: Entry[]; renamingPath?: string | null; onRenameCommit?: (n: string) => void; }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sorted = useSorted(entries);
  const rowVirtualizer = useVirtualizer({ count: sorted.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 20 });
  const sel = useSelectionStore();
  const onOpen = useOpen();
  const sort = useViewStore((s) => s.sort);
  const colWidths = useViewStore((s) => s.colWidths);
  const colVisible = useViewStore((s) => s.colVisible);
  const showExtensions = useViewStore((s) => s.showExtensions);
  const setColWidth = useViewStore((s) => s.setColWidth);
  const arrow = (field: SortField) => (sort.field === field ? (sort.asc ? ' ▲' : ' ▼') : '');
  // Name is always shown (can't be hidden via the UI); force-include it as a
  // safety fallback so the grid is never empty even if colVisible.name were false.
  const visibleCols = COLS.filter((c) => c.key === 'name' || colVisible[c.key]);
  const cols = visibleCols.map((c) => `${colWidths[c.widthKey]}px`).join(' ');

  useEffect(() => {
    const onScroll = (ev: Event) => {
      const el = parentRef.current;
      if (!el) return;
      const key = (ev as CustomEvent<string>).detail;
      if (key === 'Home') el.scrollTop = 0;
      if (key === 'End') el.scrollTop = el.scrollHeight;
    };
    window.addEventListener('winfinder:scroll', onScroll as EventListener);
    return () => window.removeEventListener('winfinder:scroll', onScroll as EventListener);
  }, []);

  useEffect(() => {
    const onScrollTo = (ev: Event) => {
      const idx = (ev as CustomEvent<number>).detail;
      rowVirtualizer.scrollToIndex(idx, { align: 'auto' });
    };
    window.addEventListener('winfinder:scroll-to-index', onScrollTo as EventListener);
    return () => window.removeEventListener('winfinder:scroll-to-index', onScrollTo as EventListener);
  }, [rowVirtualizer]);

  const startResize = (key: 'name' | 'date' | 'type' | 'size', e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[key];
    const onMove = (ev: MouseEvent) => setColWidth(key, startW + (ev.clientX - startX));
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="details" ref={parentRef} style={{ overflow: 'auto', height: '100%' }}>
      <div className="details-header" style={{ display: 'grid', gridTemplateColumns: cols }}>
        {visibleCols.map((c) => (
          <div className="col-head" key={c.key}>
            <button className={sort.field === c.sortField ? `col-${c.key} active-sort` : `col-${c.key}`} onClick={() => useViewStore.getState().setSort(c.sortField)}>{c.label}{arrow(c.sortField)}</button>
            <div className="col-resizer" onMouseDown={(e) => startResize(c.widthKey, e)} />
          </div>
        ))}
      </div>
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((vi) => {
          const item = sorted[vi.index];
          const selected = sel.selected.includes(item.path);
          return (
            <div
              key={item.path}
              data-path={item.path}
              className={`details-row${selected ? ' selected' : ''}`}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: ROW_H, display: 'grid', gridTemplateColumns: cols }}
              draggable
              onDragStart={(e) => {
                const selPaths = useSelectionStore.getState().selected;
                const paths = selPaths.includes(item.path) ? selPaths : [item.path];
                setDragged(paths);
                e.dataTransfer.effectAllowed = 'copyMove';
                e.dataTransfer.setData('text/plain', paths.join('\n'));
              }}
              onDragOver={(e) => { if (item.isDir) { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; } }}
              onDrop={(e) => { if (item.isDir) { e.preventDefault(); void dropInto(item.path, e.ctrlKey); } }}
              onClick={(ev) => handleClick(ev, item, sorted, sel)}
              onDoubleClick={() => { if (item.isDir) onOpen(item); else openItem(item.path); }}
              onAuxClick={(e) => { if (e.button === 1 && item.isDir) { e.preventDefault(); useLocationStore.getState().addTab(item.path); } }}
            >
              {visibleCols.map((c) => {
                if (c.key === 'name') {
                  return (
                    <span className="col-name" key="name">
                      <span className="row-icon" aria-hidden><Thumbnail entry={item} size={16} /></span>
                      {renamingPath === item.path ? (
                        <input
                          className="rename-input"
                          autoFocus
                          defaultValue={item.name}
                          onClick={(e) => e.stopPropagation()}
                          onFocus={(e) => e.currentTarget.select()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).dataset.committed = '1'; onRenameCommit?.((e.currentTarget as HTMLInputElement).value); }
                            if (e.key === 'Escape') { e.preventDefault(); (e.currentTarget as HTMLInputElement).dataset.committed = '1'; onRenameCommit?.(item.name); }
                          }}
                          onBlur={(e) => { if (!e.currentTarget.dataset.committed) onRenameCommit?.(e.currentTarget.value); }}
                        />
                      ) : (
                        <span className="name">{displayName(item, showExtensions)}</span>
                      )}
                    </span>
                  );
                }
                if (c.key === 'date') return <span className="col-date" key="date">{formatDate(item.modified)}</span>;
                if (c.key === 'type') return <span className="col-type" key="type">{item.typeLabel}</span>;
                return <span className="col-size" key="size">{item.isDir ? '' : formatSize(item.size)}</span>;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
