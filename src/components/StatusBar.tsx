import { useSelectionStore } from '../state/selectionStore';

export function StatusBar({ count }: { count: number }) {
  const selected = useSelectionStore((s) => s.selected.length);
  return (
    <footer className="status-bar">
      <span>{selected > 0 ? `已选 ${selected} 项` : `${count} 项`}</span>
    </footer>
  );
}
