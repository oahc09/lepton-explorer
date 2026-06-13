import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Entry } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { useViewStore } from '../../state/viewStore';
import { formatDate, formatSize } from '../../utils/format';
import { handleClick } from './detailsHelpers';
import { openItem } from '../../utils/open';
import { displayName } from '../../utils/display';
import { Thumbnail } from '../Thumbnail';

const ROW_H = 56;

export function ContentView({ entries }: { entries: Entry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sel = useSelectionStore();
  const navigate = useLocationStore((s) => s.navigate);
  const showExtensions = useViewStore((s) => s.showExtensions);
  const v = useVirtualizer({ count: entries.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 15 });
  return (
    <div className="content" ref={parentRef} style={{ overflow: 'auto', height: '100%' }}>
      <div style={{ height: `${v.getTotalSize()}px`, position: 'relative' }}>
        {v.getVirtualItems().map((vi) => {
          const item = entries[vi.index];
          const selected = sel.selected.includes(item.path);
          return (
            <div key={item.path}
              data-path={item.path}
              className={`content-row${selected ? ' selected' : ''}`}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: ROW_H, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}
              onClick={(ev) => handleClick(ev, item, entries, sel)}
              onDoubleClick={() => { if (item.isDir) navigate(item.path); else openItem(item.path); }}
            >
              <span><Thumbnail entry={item} size={36} /></span>
              <span style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                <span style={{ fontSize: 13 }}>{displayName(item, showExtensions)}</span>
                <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{item.typeLabel}{item.isDir ? '' : ` · ${formatSize(item.size)}`}{item.modified ? ` · ${formatDate(item.modified)}` : ''}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
