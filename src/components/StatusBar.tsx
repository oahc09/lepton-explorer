import { useViewStore } from '../state/viewStore';
import { useSelectionStore } from '../state/selectionStore';
import { formatSize } from '../utils/format';
import type { Entry, ViewMode } from '../types';

const MODES: ViewMode[] = ['extra-large', 'large', 'medium', 'small', 'list', 'details', 'tiles', 'content'];

export function StatusBar({ count, entries }: { count: number; entries: Entry[] }) {
  const selectedPaths = useSelectionStore((s) => s.selected);
  const viewMode = useViewStore((s) => s.viewMode);
  const setViewMode = useViewStore((s) => s.setViewMode);
  const idx = MODES.indexOf(viewMode) + 1;

  const selEntries = entries.filter((e) => selectedPaths.includes(e.path));
  const selCount = selEntries.length;
  // Files contribute their byte size; folders are summed lazily elsewhere, so omit here.
  const filesBytes = selEntries.filter((e) => !e.isDir).reduce((sum, e) => sum + e.size, 0);

  let left: string;
  if (selCount === 0) {
    left = `${count} 个项目`;
  } else if (selCount === 1) {
    const e = selEntries[0];
    left = e.isDir ? `已选定 1 个项目` : `已选定 1 个项目   ${formatSize(e.size)}`;
  } else {
    left = filesBytes > 0 ? `已选定 ${selCount} 个项目   ${formatSize(filesBytes)}` : `已选定 ${selCount} 个项目`;
  }

  return (
    <footer className="status-bar">
      <span>{left}</span>
      <input
        className="view-slider"
        type="range"
        min={1}
        max={8}
        value={idx}
        onChange={(e) => setViewMode(MODES[parseInt(e.target.value, 10) - 1])}
        title="视图模式"
      />
    </footer>
  );
}
