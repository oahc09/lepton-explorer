import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Entry } from '../../types';
import { useViewStore } from '../../state/viewStore';
import { useSelectionStore } from '../../state/selectionStore';
import { formatDate, formatSize } from '../../utils/format';
import { useSorted, handleClick, useOpen } from './detailsHelpers';
import { openItem } from '../../utils/open';
import { Thumbnail } from '../Thumbnail';

const ROW_H = 32;

export function DetailsView({ entries, renamingPath, onRenameCommit }: { entries: Entry[]; renamingPath?: string | null; onRenameCommit?: (n: string) => void; }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sorted = useSorted(entries);
  const rowVirtualizer = useVirtualizer({ count: sorted.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 20 });
  const sel = useSelectionStore();
  const onOpen = useOpen();
  const sort = useViewStore((s) => s.sort);
  const arrow = (field: 'name' | 'modified' | 'type' | 'size') =>
    sort.field === field ? (sort.asc ? ' ▲' : ' ▼') : '';

  return (
    <div className="details" ref={parentRef} style={{ overflow: 'auto', height: '100%' }}>
      <div className="details-header">
        <button className={sort.field === 'name' ? 'col-name active-sort' : 'col-name'} onClick={() => useViewStore.getState().setSort('name')}>名称{arrow('name')}</button>
        <button className={sort.field === 'modified' ? 'col-date active-sort' : 'col-date'} onClick={() => useViewStore.getState().setSort('modified')}>修改日期{arrow('modified')}</button>
        <button className={sort.field === 'type' ? 'col-type active-sort' : 'col-type'} onClick={() => useViewStore.getState().setSort('type')}>类型{arrow('type')}</button>
        <button className={sort.field === 'size' ? 'col-size active-sort' : 'col-size'} onClick={() => useViewStore.getState().setSort('size')}>大小{arrow('size')}</button>
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
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: ROW_H }}
              onClick={(ev) => handleClick(ev, item, sorted, sel)}
              onDoubleClick={() => { if (item.isDir) onOpen(item); else openItem(item.path); }}
            >
              <span className="col-name"><span className="row-icon" aria-hidden><Thumbnail entry={item} size={16} /></span>{renamingPath === item.path ? (
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
                <span className="name">{item.name}</span>
              )}</span>
              <span className="col-date">{formatDate(item.modified)}</span>
              <span className="col-type">{item.typeLabel}</span>
              <span className="col-size">{item.isDir ? '' : formatSize(item.size)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
