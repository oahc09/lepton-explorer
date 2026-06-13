import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';
import type { Entry, IconSize } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { useViewStore } from '../../state/viewStore';
import { handleClick } from './detailsHelpers';
import { openItem } from '../../utils/open';
import { displayName } from '../../utils/display';
import { setDragged } from '../../utils/drag';
import { dropInto } from '../../utils/drop';
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
  const showExtensions = useViewStore((s) => s.showExtensions);
  const rowCount = Math.ceil(entries.length / s.perRow);
  const rowV = useVirtualizer({ count: rowCount, getScrollElement: () => parentRef.current, estimateSize: () => s.tileH, overscan: 8 });

  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const startMarquee = (e: React.MouseEvent) => {
    // Only start when pressing on empty space (not on a tile or its children).
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
          const en = entries.find((en2) => en2.path === el.dataset.path);
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
            <div key={vi.key} className="icon-row" style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: s.tileH }}>
              {row.map((item) => (
                <div
                  key={item.path}
                  data-path={item.path}
                  className={`tile${sel.selected.includes(item.path) ? ' selected' : ''}`}
                  style={{ width: s.tileW, height: s.tileH - 8 }}
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
                  onAuxClick={(e) => { if (e.button === 1 && item.isDir) { e.preventDefault(); useLocationStore.getState().addTab(item.path); } }}
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
                    <div className="tile-name" style={{ maxWidth: s.nameMax }}>{displayName(item, showExtensions)}</div>
                  )}
                </div>
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
