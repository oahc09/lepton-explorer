import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, memo, useMemo, useRef, useState } from 'react';
import type { Entry, IconSize } from '../../types';
import { useViewStore } from '../../state/viewStore';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { handleClick } from './detailsHelpers';
import { openItem } from '../../utils/open';
import { displayName } from '../../utils/display';
import { dropInto } from '../../utils/drop';
import { useItemDrag } from '../../utils/fileDrag';
import { useMetadataStore, TAG_HEX, STATUS_ICON } from '../../state/metadataStore';
import { useMarquee } from '../../hooks/useMarquee';
import { MarqueeBox } from '../MarqueeBox';
import { Thumbnail } from '../Thumbnail';

const SIZES: Record<IconSize, { tileW: number; tileH: number; font: number; perRow: number; nameMax: number }> = {
  'extra-large': { tileW: 160, tileH: 136, font: 72, perRow: 4, nameMax: 150 },
  large: { tileW: 112, tileH: 104, font: 48, perRow: 6, nameMax: 100 },
  medium: { tileW: 88, tileH: 88, font: 32, perRow: 8, nameMax: 80 },
  small: { tileW: 72, tileH: 64, font: 16, perRow: 10, nameMax: 66 },
};

type IconTileProps = {
  item: Entry;
  tileW: number;
  tileH: number;
  font: number;
  nameMax: number;
  showExtensions: boolean;
  renamingPath?: string | null;
  onRenameCommit?: (n: string) => void;
  isSelected: boolean;
  isDragOver: boolean;
  onDragOverChange: (path: string | null) => void;
  allInOrder: Entry[];
};

const IconTile = memo(function IconTile({ item, tileW, tileH, font, nameMax, showExtensions, renamingPath, onRenameCommit, isSelected, isDragOver, onDragOverChange, allInOrder }: IconTileProps) {
  const navigate = useLocationStore((s) => s.navigate);
  const meta = useMetadataStore((s) => s.cache[item.path]);
  const selPaths = useSelectionStore.getState().selected;
  const paths = selPaths.includes(item.path) ? selPaths : [item.path];
  const drag = useItemDrag(paths);

  return (
    <div
      data-path={item.path}
      className={`tile${isSelected ? ' selected' : ''}${isDragOver ? ' drag-over' : ''}`}
      style={{ width: tileW, height: tileH - 8 }}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onDragOver={(e) => {
        if (item.isDir) {
          e.preventDefault();
          e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
          onDragOverChange(item.path);
        }
      }}
      onDragLeave={() => onDragOverChange(null)}
      onDrop={(e) => {
        if (item.isDir) {
          e.preventDefault();
          onDragOverChange(null);
          void dropInto(item.path, e.ctrlKey);
        }
      }}
      onClick={(ev) => { if (drag.guardClick()) return; handleClick(ev, item, allInOrder, useSelectionStore.getState()); }}
      onDoubleClick={() => {
        if (item.isDir) navigate(item.path); else openItem(item.path);
      }}
      onAuxClick={(e) => {
        if (e.button === 1 && item.isDir) {
          e.preventDefault();
          useLocationStore.getState().addTab(item.path);
        }
      }}
    >
      <div className="tile-icon">
        {meta?.color && (
          <span className="tag-dot" style={{ background: TAG_HEX[meta.color as keyof typeof TAG_HEX] || '#888', position: 'absolute' }} />
        )}
        {meta?.status && (
          <span className="status-badge" style={{ position: 'absolute' }}>{STATUS_ICON[meta.status] ?? ''}</span>
        )}
        <Thumbnail entry={item} size={font} />
        {meta && meta.rating > 0 && (
          <span className="rating-badge" style={{ position: 'absolute' }}>{'★'.repeat(meta.rating)}</span>
        )}
      </div>
      {renamingPath === item.path ? (
        <input
          className="rename-input"
          style={{ maxWidth: nameMax }}
          autoFocus
          defaultValue={item.name}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).dataset.committed = '1';
              onRenameCommit?.(e.currentTarget.value);
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).dataset.committed = '1';
              onRenameCommit?.(item.name);
            }
          }}
          onBlur={(e) => {
            if (!e.currentTarget.dataset.committed) onRenameCommit?.(e.currentTarget.value);
          }}
        />
      ) : (
        <div className="tile-name" style={{ maxWidth: nameMax }}>{displayName(item, showExtensions)}</div>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.item.path === next.item.path &&
    prev.item.size === next.item.size &&
    prev.item.modified === next.item.modified &&
    prev.item.isDir === next.item.isDir &&
    prev.isSelected === next.isSelected &&
    prev.isDragOver === next.isDragOver &&
    prev.renamingPath === next.renamingPath &&
    prev.showExtensions === next.showExtensions &&
    prev.tileW === next.tileW &&
    prev.tileH === next.tileH &&
    prev.font === next.font &&
    prev.nameMax === next.nameMax &&
    prev.allInOrder === next.allInOrder
  );
});

export function IconsView({ entries, size = 'large', renamingPath, onRenameCommit }: { entries: Entry[]; size?: IconSize; renamingPath?: string | null; onRenameCommit?: (n: string) => void }) {
  const s = SIZES[size];
  const parentRef = useRef<HTMLDivElement>(null);
  const selected = useSelectionStore((s2) => s2.selected);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const showExtensions = useViewStore((s2) => s2.showExtensions);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const rowCount = Math.ceil(entries.length / s.perRow);
  const rowV = useVirtualizer({ count: rowCount, getScrollElement: () => parentRef.current, estimateSize: () => s.tileH, overscan: 8 });

  const { onMouseDown: onMarqueeMouseDown, marquee } = useMarquee({ containerRef: parentRef, itemSelector: '.tile', entries });

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
      rowV.scrollToIndex(Math.floor(idx / s.perRow), { align: 'auto' });
    };
    window.addEventListener('lepton:scroll-to-index', onScrollTo as EventListener);
    return () => window.removeEventListener('lepton:scroll-to-index', onScrollTo as EventListener);
  }, [rowV, s.perRow]);

  return (
    <div className="icons" ref={parentRef} style={{ overflow: 'auto', height: '100%' }} onMouseDown={onMarqueeMouseDown}>
      <div style={{ height: `${rowV.getTotalSize()}px`, position: 'relative' }}>
        {rowV.getVirtualItems().map((vi) => {
          const start = vi.index * s.perRow;
          const row = entries.slice(start, start + s.perRow);
          return (
            <div
              key={vi.key}
              className="icon-row"
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: s.tileH }}
            >
              {row.map((item) => (
                <IconTile
                  key={item.path}
                  item={item}
                  tileW={s.tileW}
                  tileH={s.tileH}
                  font={s.font}
                  nameMax={s.nameMax}
                  showExtensions={showExtensions}
                  renamingPath={renamingPath}
                  onRenameCommit={onRenameCommit}
                  isSelected={selectedSet.has(item.path)}
                  isDragOver={dragOver === item.path}
                  onDragOverChange={setDragOver}
                  allInOrder={entries}
                />
              ))}
            </div>
          );
        })}
      </div>
      {marquee && (
        <MarqueeBox rect={marquee} />
      )}
    </div>
  );
}
