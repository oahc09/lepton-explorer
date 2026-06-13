import type { ViewMode } from './types';

// Ctrl+Shift+1..8 → view mode (Win11 mapping).
export const VIEW_SHORTCUTS: Record<string, ViewMode> = {
  '1': 'extra-large', '2': 'large', '3': 'medium', '4': 'small',
  '5': 'list', '6': 'details', '7': 'tiles', '8': 'content',
};
