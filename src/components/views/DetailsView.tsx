import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, memo, useMemo, useRef, useState } from 'react';
import type { Entry, SortField } from '../../types';
import { useViewStore } from '../../state/viewStore';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { formatDate, formatSize } from '../../utils/format';
import { displayName } from '../../utils/display';
import { handleClick, useOpen } from './detailsHelpers';
import { openItem } from '../../utils/open';
import { setDragged } from '../../utils/drag';
import { dropInto } from '../../utils/drop';
import { groupEntries } from '../../utils/groupBy';
import { useTagStore, TAG_HEX } from '../../state/tagStore';
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

type DetailsRowProps = {
  item: Entry;
  cols: string;
  visibleColKeys: ColKey[];
  showExtensions: boolean;
  renamingPath: string | null;
  onRenameCommit?: (n: string) => void;
  isSelected: boolean;
  isDragOver: boolean;
  onDragOverChange: (path: string | null) => void;
};

const DetailsRow = memo(function DetailsRow({ item, cols, visibleColKeys, showExtensions, renamingPath, onRenameCommit, isSelected, isDragOver, onDragOverChange }: DetailsRowProps) {
  const onOpen = useOpen();
  const tagColor = useTagStore((s) => s.tags[item.path] ?? null);

  const renderCells = (it: Entry) =>
    COLS.filter((c) => visibleColKeys.includes(c.key)).map((c) => {
      if (c.key === 'name') {
        return (
          <span className="col-name" key="name">
            {tagColor && (
              <span
                className="tag-dot"
                style={{ background: TAG_HEX[tagColor] || '#888' }}
              />
            )}
            <span className="row-icon" aria-hidden>
              <Thumbnail entry={it} size={16} />
            </span>
            {renamingPath === it.path ? (
              <input
                className="rename-input"
                autoFocus
                defaultValue={it.name}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.currentTarget as HTMLInputElement).dataset.committed = '1';
                    onRenameCommit?.(e.currentTarget.value);
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    (e.currentTarget as HTMLInputElement).dataset.committed = '1';
                    onRenameCommit?.(it.name);
                  }
                }}
                onBlur={(e) => {
                  if (!e.currentTarget.dataset.committed) onRenameCommit?.(e.currentTarget.value);
                }}
              />
            ) : (
              <span className="name">{displayName(it, showExtensions)}</span>
            )}
          </span>
        );
      }
      if (c.key === 'date') return <span className="col-date" key="date">{formatDate(it.modified)}</span>;
      if (c.key === 'type') return <span className="col-type" key="type">{it.typeLabel}</span>;
      return <span className="col-size" key="size">{it.isDir ? '' : formatSize(it.size)}</span>;
    });

  return (
    <div
      data-path={item.path}
      className={`details-row${isSelected ? ' selected' : ''}${isDragOver ? ' drag-over' : ''}`}
      style={{ width: '100%', display: 'grid', gridTemplateColumns: cols }}
      draggable
      onDragStart={(e) => {
        const selPaths = useSelectionStore.getState().selected;
        const paths = selPaths.includes(item.path) ? selPaths : [item.path];
        setDragged(paths);
        e.dataTransfer.effectAllowed = 'copyMove';
        e.dataTransfer.setData('text/plain', paths.join('\n'));
      }}
      onDragOver={(e) => {
        if (item.isDir) {
          e.preventDefault();
          e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
          onDragOverChange(item.path);
        }
      }}
      onDragLeave={() => onDragOverChange(null)}
      onDrop={(e) => {
        if (item.isDir) {
          e.preventDefault();
          onDragOverChange(null);
          void dropInto(item.path, e.ctrlKey);
        }
      }}
      onClick={(ev) => handleClick(ev, item, [] as Entry[], useSelectionStore.getState())}
      onDoubleClick={() => {
        if (item.isDir) onOpen(item); else openItem(item.path);
      }}
      onAuxClick={(e) => {
        if (e.button === 1 && item.isDir) {
          e.preventDefault();
          useLocationStore.getState().addTab(item.path);
        }
      }}
    >
      {renderCells(item)}
    </div>
  );
}, (prev, next) => {
  return (
    prev.item.path === next.item.path &&
    prev.item.size === next.item.size &&
    prev.item.modified === next.item.modified &&
    prev.item.isDir === next.item.isDir &&
    prev.isSelected === next.isSelected &&
    prev.isDragOver === next.isDragOver &&
    prev.renamingPath === next.renamingPath &&
    prev.showExtensions === next.showExtensions &&
    prev.cols === next.cols &&
    prev.visibleColKeys === next.visibleColKeys
  );
});

export function DetailsView({ entries, renamingPath, onRenameCommit }: { entries: Entry[]; renamingPath?: string | null; onRenameCommit?: (n: string) => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sorted = entries;
  const sort = useViewStore((s) => s.sort);
  const colWidths = useViewStore((s) => s.colWidths);
  const colVisible = useViewStore((s) => s.colVisible);
  const groupBy = useViewStore((s) => s.groupBy);
  const showExtensions = useViewStore((s) => s.showExtensions);
  const setColWidth = useViewStore((s) => s.setColWidth);
  const selected = useSelectionStore((s) => s.selected);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Name is always shown; force-include it so the grid is never empty.
  const visibleCols = useMemo(() => COLS.filter((c) => c.key === 'name' || colVisible[c.key]), [colVisible]);
  const visibleColKeys = useMemo(() => visibleCols.map((c) => c.key), [visibleCols]);
  const cols = useMemo(() => visibleCols
    .map((c) => (c.key === 'name' ? `minmax(80px, ${colWidths.name}px)` : `${colWidths[c.widthKey]}px`))
    .join(' '), [visibleCols, colWidths]);

  const { flat, rowToFlat } = useMemo(() => groupEntries(sorted, groupBy), [sorted, groupBy]);
  const rowVirtualizer = useVirtualizer({ count: flat.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 20 });

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
      const rowIdx = (ev as CustomEvent<number>).detail;
      rowVirtualizer.scrollToIndex(rowToFlat[rowIdx] ?? rowIdx, { align: 'auto' });
    };
    window.addEventListener('winfinder:scroll-to-index', onScrollTo as EventListener);
    return () => window.removeEventListener('winfinder:scroll-to-index', onScrollTo as EventListener);
  }, [rowVirtualizer, rowToFlat]);

  const startResize = (key: ColKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[key];
    const onMove = (ev: MouseEvent) => setColWidth(key, startW + (ev.clientX - startX));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const arrow = (field: SortField) => (sort.field === field ? (sort.asc ? ' ▲' : ' ▼') : '');

  return (
    <div className="details" ref={parentRef} style={{ overflow: 'auto', height: '100%' }}>
      <div className="details-header" style={{ display: 'grid', gridTemplateColumns: cols }}>
        {visibleCols.map((c) => (
          <div className="col-head" key={c.key}>
            <button
              className={sort.field === c.sortField ? `col-${c.key} active-sort` : `col-${c.key}`}
              onClick={() => useViewStore.getState().setSort(c.sortField)}
            >
              {c.label}{arrow(c.sortField)}
            </button>
            <div className="col-resizer" onMouseDown={(e) => startResize(c.widthKey, e)} />
          </div>
        ))}
      </div>
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((vi) => {
          const fi = flat[vi.index];
          if (fi.kind === 'group') {
            return (
              <div
                key={`g-${vi.index}`}
                className="group-header"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vi.start}px)`,
                  height: ROW_H,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                }}
              >
                {fi.label}
              </div>
            );
          }
          const item = fi.entry!;
          return (
            <div
              key={item.path}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start}px)`,
                height: ROW_H,
              }}
            >
              <DetailsRow
                item={item}
                cols={cols}
                visibleColKeys={visibleColKeys}
                showExtensions={showExtensions}
                renamingPath={renamingPath ?? null}
                onRenameCommit={onRenameCommit}
                isSelected={selectedSet.has(item.path)}
                isDragOver={dragOver === item.path}
                onDragOverChange={setDragOver}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
