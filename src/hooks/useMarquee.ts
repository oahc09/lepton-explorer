import { useMemo, useRef, useState } from 'react';
import type { RefObject, MouseEvent as ReactMouseEvent } from 'react';
import type { Entry } from '../types';
import { useSelectionStore } from '../state/selectionStore';

/** Viewport-coordinate rectangle describing the rubber-band selection box. */
export interface MarqueeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface UseMarqueeOptions {
  /** The scroll container whose rendered items are hit-tested. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** CSS selector matching item elements that carry a `data-path` attribute. */
  itemSelector: string;
  /** All entries currently shown in this view (for path → Entry lookup). */
  entries: Entry[];
  /** Optional selector for regions where a marquee should NOT start (e.g. a column header). */
  excludeSelector?: string;
}

/**
 * Rubber-band (marquee) selection shared by all file views.
 *
 * A marquee only starts when the left button is pressed on empty space
 * (not on an item, and not inside `excludeSelector`). Pressing on an item
 * is left to the item's own pointer handlers (select / OS drag), so the two
 * gestures never conflict. Holding Ctrl/Cmd makes the marquee *add* to the
 * current selection instead of replacing it.
 */
export function useMarquee({ containerRef, itemSelector, entries, excludeSelector }: UseMarqueeOptions) {
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);

  const entryMap = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) m.set(e.path, e);
    return m;
  }, [entries]);

  // Keep latest values reachable from the once-registered window listeners.
  const latest = useRef({ containerRef, itemSelector, entryMap, excludeSelector });
  latest.current = { containerRef, itemSelector, entryMap, excludeSelector };

  const onMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const { containerRef: cr, itemSelector: sel, excludeSelector: excl } = latest.current;
    if (target.closest(sel)) return;
    if (excl && target.closest(excl)) return;

    const x0 = e.clientX;
    const y0 = e.clientY;
    const additive = e.ctrlKey || e.metaKey;
    const base = additive ? new Set(useSelectionStore.getState().selected) : new Set<string>();
    if (!additive) useSelectionStore.getState().clear();

    setMarquee({ x: x0, y: y0, w: 0, h: 0 });

    const onMove = (ev: MouseEvent) => {
      const x = Math.min(ev.clientX, x0);
      const y = Math.min(ev.clientY, y0);
      const w = Math.abs(ev.clientX - x0);
      const h = Math.abs(ev.clientY - y0);
      setMarquee({ x, y, w, h });

      const els = cr.current?.querySelectorAll<HTMLElement>(`${sel}[data-path]`);
      if (!els) return;
      const hits: Entry[] = [];
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right >= x && r.left <= x + w && r.bottom >= y && r.top <= y + h) {
          const en = latest.current.entryMap.get(el.dataset.path!);
          if (en) hits.push(en);
        }
      });

      if (additive) {
        const merged = new Set(base);
        for (const en of hits) merged.add(en.path);
        useSelectionStore.getState().setSelectedPaths([...merged]);
      } else {
        useSelectionStore.getState().select(hits);
      }
    };

    const onUp = () => {
      setMarquee(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return { onMouseDown, marquee };
}
