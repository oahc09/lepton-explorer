import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Entry } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { formatSize } from '../../utils/format';
import { icon, handleClick } from './detailsHelpers';
import { openItem } from '../../utils/open';

const TILE_H = 76;
const perRow = 4;

export function TilesView({ entries }: { entries: Entry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sel = useSelectionStore();
  const navigate = useLocationStore((s) => s.navigate);
  const rowCount = Math.ceil(entries.length / perRow);
  const v = useVirtualizer({ count: rowCount, getScrollElement: () => parentRef.current, estimateSize: () => TILE_H, overscan: 8 });
  return (
    <div className="tiles" ref={parentRef} style={{ overflow: 'auto', height: '100%', padding: 8 }}>
      <div style={{ height: `${v.getTotalSize()}px`, position: 'relative' }}>
        {v.getVirtualItems().map((vi) => {
          const start = vi.index * perRow;
          const row = entries.slice(start, start + perRow);
          return (
            <div key={vi.key} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: TILE_H, display: 'flex', gap: 8 }}>
              {row.map((item) => {
                const selected = sel.selected.includes(item.path);
                return (
                  <div key={item.path}
                    className={`tile2${selected ? ' selected' : ''}`}
                    style={{ width: 220, height: TILE_H - 8, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 4 }}
                    onClick={(ev) => handleClick(ev, item, entries, sel)}
                    onDoubleClick={() => { if (item.isDir) navigate(item.path); else openItem(item.path); }}
                  >
                    <span style={{ fontSize: 40 }}>{icon(item)}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span className="tile2-name" style={{ fontSize: 13 }}>{item.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{item.isDir ? '文件夹' : `${formatSize(item.size)} · ${item.typeLabel}`}</span>
                    </span>
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
