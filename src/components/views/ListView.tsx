import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef } from 'react';
import type { Entry } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { useViewStore } from '../../state/viewStore';
import { handleClick } from './detailsHelpers';
import { openItem } from '../../utils/open';
import { displayName } from '../../utils/display';
import { setDragged } from '../../utils/drag';
import { dropInto } from '../../utils/drop';
import { Thumbnail } from '../Thumbnail';

const ROW_H = 22;

export function ListView({ entries }: { entries: Entry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sel = useSelectionStore();
  const navigate = useLocationStore((s) => s.navigate);
  const showExtensions = useViewStore((s) => s.showExtensions);
  const v = useVirtualizer({ count: entries.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 30 });

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
      v.scrollToIndex(idx, { align: 'auto' });
    };
    window.addEventListener('winfinder:scroll-to-index', onScrollTo as EventListener);
    return () => window.removeEventListener('winfinder:scroll-to-index', onScrollTo as EventListener);
  }, [v]);
  return (
    <div className="list" ref={parentRef} style={{ overflow: 'auto', height: '100%', padding: '4px 8px' }}>
      <div style={{ height: `${v.getTotalSize()}px`, position: 'relative' }}>
        {v.getVirtualItems().map((vi) => {
          const item = entries[vi.index];
          const selected = sel.selected.includes(item.path);
          return (
            <div
              key={item.path}
              data-path={item.path}
              className={`list-item${selected ? ' selected' : ''}`}
              style={{ position: 'absolute', top: 0, left: 0, transform: `translateY(${vi.start}px)`, height: ROW_H, display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px' }}
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
              onClick={(ev) => handleClick(ev, item, entries, sel)}
              onDoubleClick={() => { if (item.isDir) navigate(item.path); else openItem(item.path); }}
            >
              <span className="list-icon"><Thumbnail entry={item} size={16} /></span>
              <span className="list-name">{displayName(item, showExtensions)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
