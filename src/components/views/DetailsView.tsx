import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Entry } from '../../types';
import { useViewStore } from '../../state/viewStore';
import { useSelectionStore } from '../../state/selectionStore';
import { formatDate, formatSize } from '../../utils/format';
import { useSorted, handleClick, icon, useOpen } from './detailsHelpers';

const ROW_H = 32;

export function DetailsView({ entries }: { entries: Entry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sorted = useSorted(entries);
  const rowVirtualizer = useVirtualizer({ count: sorted.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 20 });
  const sel = useSelectionStore();
  const onOpen = useOpen();

  return (
    <div className="details" ref={parentRef} style={{ overflow: 'auto', height: '100%' }}>
      <div className="details-header">
        <button className="col-name" onClick={() => useViewStore.getState().setSort('name')}>名称</button>
        <button className="col-date" onClick={() => useViewStore.getState().setSort('modified')}>修改日期</button>
        <button className="col-type" onClick={() => useViewStore.getState().setSort('type')}>类型</button>
        <button className="col-size" onClick={() => useViewStore.getState().setSort('size')}>大小</button>
      </div>
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((vi) => {
          const item = sorted[vi.index];
          const selected = sel.selected.includes(item.path);
          return (
            <div
              key={item.path}
              className={`details-row${selected ? ' selected' : ''}`}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: ROW_H }}
              onClick={(ev) => handleClick(ev, item, sorted, sel)}
              onDoubleClick={() => onOpen(item)}
            >
              <span className="col-name"><span className="row-icon" aria-hidden>{icon(item)}</span><span className="name">{item.name}</span></span>
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
