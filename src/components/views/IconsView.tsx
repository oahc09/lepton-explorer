import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Entry, IconSize } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { icon, handleClick } from './detailsHelpers';

const SIZES: Record<IconSize, { tileW: number; tileH: number; font: number; perRow: number; nameMax: number }> = {
  'extra-large': { tileW: 160, tileH: 136, font: 72, perRow: 4, nameMax: 150 },
  'large': { tileW: 112, tileH: 104, font: 48, perRow: 6, nameMax: 100 },
  'medium': { tileW: 88, tileH: 88, font: 32, perRow: 8, nameMax: 80 },
  'small': { tileW: 72, tileH: 64, font: 16, perRow: 10, nameMax: 66 },
};

export function IconsView({ entries, size = 'large' }: { entries: Entry[]; size?: IconSize }) {
  const s = SIZES[size];
  const parentRef = useRef<HTMLDivElement>(null);
  const sel = useSelectionStore();
  const navigate = useLocationStore((st) => st.navigate);
  const rowCount = Math.ceil(entries.length / s.perRow);
  const rowV = useVirtualizer({ count: rowCount, getScrollElement: () => parentRef.current, estimateSize: () => s.tileH, overscan: 8 });

  return (
    <div className="icons" ref={parentRef} style={{ overflow: 'auto', height: '100%' }}>
      <div style={{ height: `${rowV.getTotalSize()}px`, position: 'relative' }}>
        {rowV.getVirtualItems().map((vi) => {
          const start = vi.index * s.perRow;
          const row = entries.slice(start, start + s.perRow);
          return (
            <div key={vi.key} className="icon-row" style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: s.tileH }}>
              {row.map((item) => (
                <div
                  key={item.path}
                  className={`tile${sel.selected.includes(item.path) ? ' selected' : ''}`}
                  style={{ width: s.tileW, height: s.tileH - 8 }}
                  onClick={(ev) => handleClick(ev, item, entries, sel)}
                  onDoubleClick={() => item.isDir && navigate(item.path)}
                >
                  <div className="tile-icon" style={{ fontSize: s.font }}>{icon(item)}</div>
                  <div className="tile-name" style={{ maxWidth: s.nameMax }}>{item.name}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
