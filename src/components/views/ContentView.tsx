import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, memo, useMemo, useRef } from 'react';
import type { Entry } from '../../types';
import { useSelectionStore } from '../../state/selectionStore';
import { useLocationStore } from '../../state/locationStore';
import { useViewStore } from '../../state/viewStore';
import { formatDate, formatSize } from '../../utils/format';
import { handleClick } from './detailsHelpers';
import { openItem } from '../../utils/open';
import { displayName } from '../../utils/display';
import { dropInto } from '../../utils/drop';
import { useItemDrag } from '../../utils/fileDrag';
import { useMarquee } from '../../hooks/useMarquee';
import { MarqueeBox } from '../MarqueeBox';
import { Thumbnail } from '../Thumbnail';
import { ItemCheckBox } from './ItemCheckBox';

const ROW_H = 56;

type ContentRowProps = {
  item: Entry;
  showExtensions: boolean;
  isSelected: boolean;
  allInOrder: Entry[];
  renamingPath: string | null;
  onRenameCommit?: (n: string) => void;
};

const ContentRow = memo(function ContentRow({ item, showExtensions, isSelected, allInOrder, renamingPath, onRenameCommit }: ContentRowProps) {
  const navigate = useLocationStore((s) => s.navigate);
  const selPaths = useSelectionStore.getState().selected;
  const paths = selPaths.includes(item.path) ? selPaths : [item.path];
  const drag = useItemDrag(paths);
  const showCheckBoxes = useViewStore((s) => s.itemCheckBoxes);
  return (
    <div
      data-path={item.path}
      className={`content-row${isSelected ? ' selected' : ''}`}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: ROW_H, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onDragOver={(e) => { if (item.isDir) { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; } }}
      onDrop={(e) => { if (item.isDir) { e.preventDefault(); void dropInto(item.path, e.ctrlKey); } }}
      onClick={(ev) => { if (drag.guardClick()) return; handleClick(ev, item, allInOrder, useSelectionStore.getState()); }}
      onDoubleClick={() => { if (item.isDir) navigate(item.path); else openItem(item.path); }}
      onAuxClick={(e) => { if (e.button === 1 && item.isDir) { e.preventDefault(); useLocationStore.getState().addTab(item.path); } }}
    >
      {showCheckBoxes && <ItemCheckBox item={item} />}
      <span><Thumbnail entry={item} size={36} /></span>
      <span style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
        {renamingPath === item.path ? (
          <input
            className="rename-input"
            style={{ fontSize: 13 }}
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
          <span style={{ fontSize: 13 }}>{displayName(item, showExtensions)}</span>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{item.typeLabel}{item.isDir ? '' : ` · ${formatSize(item.size)}`}{item.modified ? ` · ${formatDate(item.modified)}` : ''}</span>
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
    prev.renamingPath === next.renamingPath &&
    prev.allInOrder === next.allInOrder
  );
});

export function ContentView({ entries, renamingPath, onRenameCommit }: { entries: Entry[]; renamingPath?: string | null; onRenameCommit?: (n: string) => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const showExtensions = useViewStore((s) => s.showExtensions);
  const selected = useSelectionStore((s) => s.selected);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const v = useVirtualizer({ count: entries.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_H, overscan: 15 });
  const { onMouseDown: onMarqueeMouseDown, marquee } = useMarquee({ containerRef: parentRef, itemSelector: '.content-row', entries });

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
    <div className="content" ref={parentRef} style={{ overflow: 'auto', height: '100%' }} onMouseDown={onMarqueeMouseDown}>
      <div style={{ height: `${v.getTotalSize()}px`, position: 'relative' }}>
        {v.getVirtualItems().map((vi) => {
          const item = entries[vi.index];
          return (
            <div
              key={item.path}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, height: ROW_H }}
            >
              <ContentRow
                item={item}
                showExtensions={showExtensions}
                isSelected={selectedSet.has(item.path)}
                allInOrder={entries}
                renamingPath={renamingPath ?? null}
                onRenameCommit={onRenameCommit}
              />
            </div>
          );
        })}
      </div>
      <MarqueeBox rect={marquee} />
    </div>
  );
}
