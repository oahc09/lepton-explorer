import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Entry, IconSize } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { handleClick } from './detailsHelpers';
import { openItem } from '../../utils/open';
import { Thumbnail } from '../Thumbnail';

const SIZES: Record<IconSize, { tileW: number; tileH: number; font: number; perRow: number; nameMax: number }> = {
  'extra-large': { tileW: 160, tileH: 136, font: 72, perRow: 4, nameMax: 150 },
  'large': { tileW: 112, tileH: 104, font: 48, perRow: 6, nameMax: 100 },
  'medium': { tileW: 88, tileH: 88, font: 32, perRow: 8, nameMax: 80 },
  'small': { tileW: 72, tileH: 64, font: 16, perRow: 10, nameMax: 66 },
};

export function IconsView({ entries, size = 'large', renamingPath, onRenameCommit }: { entries: Entry[]; size?: IconSize; renamingPath?: string | null; onRenameCommit?: (n: string) => void; }) {
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
                  data-path={item.path}
                  className={`tile${sel.selected.includes(item.path) ? ' selected' : ''}`}
                  style={{ width: s.tileW, height: s.tileH - 8 }}
                  onClick={(ev) => handleClick(ev, item, entries, sel)}
                  onDoubleClick={() => { if (item.isDir) navigate(item.path); else openItem(item.path); }}
                >
                  <div className="tile-icon"><Thumbnail entry={item} size={s.font} /></div>
                  {renamingPath === item.path ? (
                    <input
                      className="rename-input"
                      style={{ maxWidth: s.nameMax }}
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
                    <div className="tile-name" style={{ maxWidth: s.nameMax }}>{item.name}</div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
