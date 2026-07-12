import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, memo, useMemo, useRef, useState } from 'react';
import type { Entry, IconSize } from '../../types';
import { useViewStore } from '../../state/viewStore';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { handleClick } from './detailsHelpers';
import { openItem } from '../../utils/open';
import { displayName } from '../../utils/display';
import { setDragged } from '../../utils/drag';
import { dropInto } from '../../utils/drop';
import { useTagStore, TAG_HEX } from '../../state/tagStore';
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
};

const IconTile = memo(function IconTile({ item, tileW, tileH, font, nameMax, showExtensions, renamingPath, onRenameCommit, isSelected, isDragOver, onDragOverChange }: IconTileProps) {
  const navigate = useLocationStore((s) => s.navigate);
  const tagColor = useTagStore((s) => s.tags[item.path] ?? null);

  return (
    <div
      data-path={item.path}
      className={`tile${isSelected ? ' selected' : ''}${isDragOver ? ' drag-over' : ''}`}
      style={{ width: tileW, height: tileH - 8 }}
      draggable
      onDragStart={(e) => {
        const selPaths = useSelectionStore.getState().selected;
        const paths = selPaths.includes(item.path) ? selPaths : [item.path];
        setDragged(paths);
        e.dataTransfer.effectAllowed = 'copyMove';
        e.dataTransfer.setData('text/plain', paths.join('\n'));
      }}
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
      onClick={(ev) => handleClick(ev, item, [] as Entry[], useSelectionStore.getState())}
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
        {tagColor && (
          <span className="tag-dot" style={{ background: TAG_HEX[tagColor] || '#888', position: 'absolute' }} />
        )}
        <Thumbnail entry={item} size={font} />
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
    prev.nameMax === next.nameMax
  );
});

export function IconsView({ entries, size = 'large', renamingPath, onRenameCommit }: { entries: Entry[]; size?: IconSize; renamingPath?: string | null; onRenameCommit?: (n: string) => void }) {
  const s = SIZES[size];
  const parentRef = useRef<HTMLDivElement>(null);
  const selected = useSelectionStore((s2) => s2.selected);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const showExtensions = useViewStore((s2) => s2.showExtensions);
  const entryMap = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) m.set(e.path, e);
    return m;
  }, [entries]);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const rowCount = Math.ceil(entries.length / s.perRow);
  const rowV = useVirtualizer({ count: rowCount, getScrollElement: () => parentRef.current, estimateSize: () => s.tileH, overscan: 8 });

  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const startMarquee = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.tile')) return;
    if (e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    setMarquee({ x: x0, y: y0, w: 0, h: 0 });
    useSelectionStore.getState().clear();
    const onMove = (ev: MouseEvent) => {
      const x = Math.min(ev.clientX, x0);
      const y = Math.min(ev.clientY, y0);
      const w = Math.abs(ev.clientX - x0);
      const h = Math.abs(ev.clientY - y0);
      setMarquee({ x, y, w, h });
      const tiles = parentRef.current?.querySelectorAll<HTMLElement>('.tile[data-path]');
      if (!tiles) return;
      const hit: Entry[] = [];
      tiles.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right >= x && r.left <= x + w && r.bottom >= y && r.top <= y + h) {
          const en = entryMap.get(el.dataset.path!);
          if (en) hit.push(en);
        }
      });
      useSelectionStore.getState().select(hit);
    };
    const onUp = () => {
      setMarquee(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

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
      rowV.scrollToIndex(Math.floor(idx / s.perRow), { align: 'auto' });
    };
    window.addEventListener('winfinder:scroll-to-index', onScrollTo as EventListener);
    return () => window.removeEventListener('winfinder:scroll-to-index', onScrollTo as EventListener);
  }, [rowV, s.perRow]);

  return (
    <div className="icons" ref={parentRef} style={{ overflow: 'auto', height: '100%' }} onMouseDown={startMarquee}>
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
                />
              ))}
            </div>
          );
        })}
      </div>
      {marquee && (
        <div
          style={{
            position: 'fixed',
            left: marquee.x,
            top: marquee.y,
            width: marquee.w,
            height: marquee.h,
            background: 'var(--accent-fill)',
            border: '1px solid var(--accent)',
            pointerEvents: 'none',
            zIndex: 500,
          }}
        />
      )}
    </div>
  );
}
