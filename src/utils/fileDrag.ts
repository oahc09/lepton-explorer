import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { setDragged } from './drag';

// Threshold (CSS px) the pointer must travel before we treat the gesture as a
// drag rather than a click.
const DRAG_THRESHOLD = 4;

/**
 * Pointer-based file drag that hands off to a native OS drag (CF_HDROP) so the
 * item can be dropped onto ANY application (Explorer, desktop, other programs).
 *
 * Replaces the previous HTML5 `draggable` approach, which only carried
 * `text/plain` and was ignored by external apps. In-app drops still work: when
 * the native drag is released over our own window, WebView2 fires native drop
 * events and `dropInto` reads the source paths from the `dragged` store.
 *
 * Returns pointer handlers to spread onto the row/tile, plus `guardClick` which
 * the row's `onClick` must call first — it returns true when the click is just
 * the tail of a real drag and should be ignored (so we don't toggle selection).
 */
export function useItemDrag(paths: string[]) {
  const state = useRef<{ x: number; y: number; active: boolean; moved: boolean } | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    // Prevent the browser from starting a native text/image selection, which
    // would fight our custom drag gesture.
    e.preventDefault();
    state.current = { x: e.clientX, y: e.clientY, active: true, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const s = state.current;
    if (!s || !s.active || s.moved) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      s.moved = true;
      setDragged(paths);
      // Hand off to the OS drag loop (blocks the main thread until drop).
      void invoke('start_os_drag', { paths }).catch(() => {});
    }
  };

  const onPointerUp = () => {
    if (state.current) state.current.active = false;
  };

  // Call at the very start of the element's onClick. Returns true if the click
  // should be swallowed because it ended a drag gesture.
  const guardClick = () => {
    const s = state.current;
    if (s && s.moved) {
      s.moved = false;
      return true;
    }
    return false;
  };

  return { onPointerDown, onPointerMove, onPointerUp, guardClick };
}
