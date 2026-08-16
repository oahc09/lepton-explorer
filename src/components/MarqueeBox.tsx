import type { MarqueeRect } from '../hooks/useMarquee';

/** Renders the rubber-band selection rectangle (viewport-fixed, pointer-transparent). */
export function MarqueeBox({ rect }: { rect: MarqueeRect | null }) {
  if (!rect) return null;
  return (
    <div
      style={{
        position: 'fixed',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        background: 'var(--accent-fill)',
        border: '1px solid var(--accent)',
        pointerEvents: 'none',
        zIndex: 500,
      }}
    />
  );
}
