import { useViewStore } from '../state/viewStore';
import { useSelectionStore } from '../state/selectionStore';
import type { ViewMode } from '../types';

const MODES: ViewMode[] = ['extra-large', 'large', 'medium', 'small', 'list', 'details', 'tiles', 'content'];

export function StatusBar({ count }: { count: number }) {
  const selected = useSelectionStore((s) => s.selected.length);
  const viewMode = useViewStore((s) => s.viewMode);
  const setViewMode = useViewStore((s) => s.setViewMode);
  const idx = MODES.indexOf(viewMode) + 1;
  return (
    <footer className="status-bar">
      <span>{selected > 0 ? `已选 ${selected} 项` : `${count} 项`}</span>
      <input
        className="view-slider"
        type="range"
        min={1}
        max={8}
        value={idx}
        onChange={(e) => setViewMode(MODES[parseInt(e.target.value, 10) - 1])}
        title="视图大小"
      />
    </footer>
  );
}
