import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Entry } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { icon, handleClick } from './detailsHelpers';

const TILE_H = 96;

export function IconsView({ entries }: { entries: Entry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sel = useSelectionStore();
  const navigate = useLocationStore((s) => s.navigate);

  const perRow = 6;
  const rowCount = Math.ceil(entries.length / perRow);
  const rowV = useVirtualizer({ count: rowCount, getScrollElement: () => parentRef.current, estimateSize: () => TILE_H, overscan: 8 });

  return (
    <div className="icons" ref={parentRef} style={{ overflow: 'auto', height: '100%' }}>
      <div style={{ height: `${rowV.getTotalSize()}px`, position: 'relative' }}>
        {rowV.getVirtualItems().map((vi) => {
          const start = vi.index * perRow;
          const row = entries.slice(start, start + perRow);
          return (
            <div key={vi.key} className="icon-row" style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: TILE_H }}>
              {row.map((item) => {
                const selected = sel.selected.includes(item.path);
                return (
                  <div
                    key={item.path}
                    className={`tile${selected ? ' selected' : ''}`}
                    onClick={(ev) => handleClick(ev, item, entries, sel)}
                    onDoubleClick={() => item.isDir && navigate(item.path)}
                  >
                    <div className="tile-icon">{icon(item)}</div>
                    <div className="tile-name">{item.name}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
