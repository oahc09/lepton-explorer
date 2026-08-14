import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useEffect, useMemo, useRef } from 'react';
import type { Entry } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { useViewStore } from '../../state/viewStore';
import { handleClick } from './detailsHelpers';
import { openItem } from '../../utils/open';
import { displayName } from '../../utils/display';
import { dropInto } from '../../utils/drop';
import { useItemDrag } from '../../utils/fileDrag';
import { Thumbnail } from '../Thumbnail';

const ROW_H = 22;

type ListItemProps = {
  item: Entry;
  showExtensions: boolean;
  isSelected: boolean;
  allInOrder: Entry[];
};

const ListItem = memo(function ListItem({ item, showExtensions, isSelected, allInOrder }: ListItemProps) {
  const navigate = useLocationStore((s) => s.navigate);
  const selPaths = useSelectionStore.getState().selected;
  const paths = selPaths.includes(item.path) ? selPaths : [item.path];
  const drag = useItemDrag(paths);
  return (
    <div
      data-path={item.path}
      className={`list-item${isSelected ? ' selected' : ''}`}
      style={{ height: ROW_H, display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px' }}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onDragOver={(e) => { if (item.isDir) { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; } }}
      onDrop={(e) => { if (item.isDir) { e.preventDefault(); void dropInto(item.path, e.ctrlKey); } }}
      onClick={(ev) => { if (drag.guardClick()) return; handleClick(ev, item, allInOrder, useSelectionStore.getState()); }}
      onDoubleClick={() => { if (item.isDir) navigate(item.path); else openItem(item.path); }}
      onAuxClick={(e) => { if (e.button === 1 && item.isDir) { e.preventDefault(); useLocationStore.getState().addTab(item.path); } }}
    >
      <span className="list-icon"><Thumbnail entry={item} size={16} /></span>
      <span className="list-name">{displayName(item, showExtensions)}</span>
    </div>
  );
}, (prev, next) => {
  return prev.item.path === next.item.path
    && prev.item.size === next.item.size
    && prev.item.modified === next.item.modified
    && prev.item.isDir === next.item.isDir
    && prev.isSelected === next.isSelected
    && prev.showExtensions === next.showExtensions
    && prev.allInOrder === next.allInOrder;
});

export function ListView({ entries }: { entries: Entry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const showExtensions = useViewStore((s) => s.showExtensions);
  const selected = useSelectionStore((s) => s.selected);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const v = useVirtualizer({ count: entries.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 30 });

  useEffect(() => {
    const onScroll = (ev: Event) => {
      const el = parentRef.current;
      if (!el) return;
      const key = (ev as CustomEvent<string>).detail;
      if (key === 'Home') el.scrollTop = 0;
      if (key === 'End') el.scrollTop = el.scrollHeight;
    };
    window.addEventListener('lepton:scroll', onScroll as EventListener);
    return () => window.removeEventListener('lepton:scroll', onScroll as EventListener);
  }, []);

  useEffect(() => {
    const onScrollTo = (ev: Event) => {
      const idx = (ev as CustomEvent<number>).detail;
      v.scrollToIndex(idx, { align: 'auto' });
    };
    window.addEventListener('lepton:scroll-to-index', onScrollTo as EventListener);
    return () => window.removeEventListener('lepton:scroll-to-index', onScrollTo as EventListener);
  }, [v]);
  return (
    <div className="list" ref={parentRef} style={{ overflow: 'auto', height: '100%', padding: '4px 8px' }}>
      <div style={{ height: `${v.getTotalSize()}px`, position: 'relative' }}>
        {v.getVirtualItems().map((vi) => {
          const item = entries[vi.index];
          return (
            <div
              key={item.path}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: ROW_H }}
            >
              <ListItem item={item} showExtensions={showExtensions} isSelected={selectedSet.has(item.path)} allInOrder={entries} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
