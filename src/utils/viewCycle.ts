import type { ViewMode } from '../types';

/** Icon-view sizes, ascending (smallest → largest). */
const ICON = ['small', 'medium', 'large', 'extra-large'] as const;

/**
 * Resolve the next view mode for a Ctrl+mouse-wheel step (Win11 habit:
 * scroll up = larger icons, scroll down = smaller).
 *
 * - Within an icon view: steps along small → medium → large → extra-large,
 *   clamped at the ends.
 * - From a non-icon view scrolling up: enters icon view at "large".
 * - From a non-icon view scrolling down: no change.
 */
export function cycleIconSize(vm: ViewMode, up: boolean): ViewMode {
  if ((ICON as readonly string[]).includes(vm)) {
    const idx = ICON.indexOf(vm as (typeof ICON)[number]);
    const next = Math.max(0, Math.min(ICON.length - 1, idx + (up ? 1 : -1)));
    return ICON[next];
  }
  return up ? 'large' : vm;
}
