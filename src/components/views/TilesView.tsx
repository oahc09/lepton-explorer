import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, memo, useMemo, useRef } from 'react';
import type { Entry } from '../../types';
import { useViewStore } from '../../state/viewStore';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { formatSize } from '../../utils/format';
import { handleClick } from './detailsHelpers';
import { openItem } from '../../utils/open';
import { displayName } from '../../utils/display';
import { dropInto } from '../../utils/drop';
import { useItemDrag } from '../../utils/fileDrag';
import { Thumbnail } from '../Thumbnail';

const TILE_H = 76;
const perRow = 4;

type Tile2ItemProps = {
  item: Entry;
  showExtensions: boolean;
  isSelected: boolean;
  allInOrder: Entry[];
};

const Tile2Item = memo(function Tile2Item({ item, showExtensions, isSelected, allInOrder }: Tile2ItemProps) {
  const navigate = useLocationStore((s) => s.navigate);
  const selPaths = useSelectionStore.getState().selected;
  const paths = selPaths.includes(item.path) ? selPaths : [item.path];
  const drag = useItemDrag(paths);
  return (
    <div
      data-path={item.path}
      className={`tile2${isSelected ? ' selected' : ''}`}
      style={{ width: 220, height: TILE_H - 8, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 4 }}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onDragOver={(e) => { if (item.isDir) { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; } }}
      onDrop={(e) => { if (item.isDir) { e.preventDefault(); void dropInto(item.path, e.ctrlKey); } }}
      onClick={(ev) => { if (drag.guardClick()) return; handleClick(ev, item, allInOrder, useSelectionStore.getState()); }}
      onDoubleClick={() => { if (item.isDir) navigate(item.path); else openItem(item.path); }}
      onAuxClick={(e) => { if (e.button === 1 && item.isDir) { e.preventDefault(); useLocationStore.getState().addTab(item.path); } }}
    >
      <span><Thumbnail entry={item} size={40} /></span>
      <span style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <span className="tile2-name" style={{ fontSize: 13 }}>{displayName(item, showExtensions)}</span>
        <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{item.isDir ? '文件夹' : `${formatSize(item.size)} · ${item.typeLabel}`}</span>
      </span>
    </div>
  );
}, (prev, next) => {
  return (
    prev.item.path === next.item.path &&
    prev.item.size === next.item.size &&
    prev.item.modified === next.item.modified &&
    prev.item.isDir === next.item.isDir &&
    prev.isSelected === next.isSelected &&
    prev.showExtensions === next.showExtensions &&
    prev.allInOrder === next.allInOrder
  );
});

export function TilesView({ entries }: { entries: Entry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const showExtensions = useViewStore((s) => s.showExtensions);
  const selected = useSelectionStore((s) => s.selected);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const rowCount = Math.ceil(entries.length / perRow);
  const v = useVirtualizer({ count: rowCount, getScrollElement: () => parentRef.current, estimateSize: () => TILE_H, overscan: 8 });

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
      v.scrollToIndex(Math.floor(idx / perRow), { align: 'auto' });
    };
    window.addEventListener('lepton:scroll-to-index', onScrollTo as EventListener);
    return () => window.removeEventListener('lepton:scroll-to-index', onScrollTo as EventListener);
  }, [v]);

  return (
    <div className="tiles" ref={parentRef} style={{ overflow: 'auto', height: '100%', padding: 8 }}>
      <div style={{ height: `${v.getTotalSize()}px`, position: 'relative' }}>
        {v.getVirtualItems().map((vi) => {
          const start = vi.index * perRow;
          const row = entries.slice(start, start + perRow);
          return (
            <div
              key={vi.key}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: TILE_H, display: 'flex', gap: 8 }}
            >
              {row.map((item) => (
                <Tile2Item
                  key={item.path}
                  item={item}
                  showExtensions={showExtensions}
                  isSelected={selectedSet.has(item.path)}
                  allInOrder={entries}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
