import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Entry } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { handleClick } from './detailsHelpers';
import { openItem } from '../../utils/open';
import { Thumbnail } from '../Thumbnail';

const ROW_H = 22;

export function ListView({ entries }: { entries: Entry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sel = useSelectionStore();
  const navigate = useLocationStore((s) => s.navigate);
  const v = useVirtualizer({ count: entries.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 30 });
  return (
    <div className="list" ref={parentRef} style={{ overflow: 'auto', height: '100%', padding: '4px 8px' }}>
      <div style={{ height: `${v.getTotalSize()}px`, position: 'relative' }}>
        {v.getVirtualItems().map((vi) => {
          const item = entries[vi.index];
          const selected = sel.selected.includes(item.path);
          return (
            <div
              key={item.path}
              className={`list-item${selected ? ' selected' : ''}`}
              style={{ position: 'absolute', top: 0, left: 0, transform: `translateY(${vi.start}px)`, height: ROW_H, display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px' }}
              onClick={(ev) => handleClick(ev, item, entries, sel)}
              onDoubleClick={() => { if (item.isDir) navigate(item.path); else openItem(item.path); }}
            >
              <span className="list-icon"><Thumbnail entry={item} size={16} /></span>
              <span className="list-name">{item.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
