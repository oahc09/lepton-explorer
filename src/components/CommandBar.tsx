import type { Entry } from '../types';
import { useSelectionStore } from '../state/selectionStore';
import { useClipboardStore } from '../state/clipboardStore';
import { useLocationStore } from '../state/locationStore';
import { useFileOps } from '../hooks/useFileOps';

export function CommandBar({ entries }: { entries: Entry[] }) {
  const selected = useSelectionStore((s) => s.selected);
  const hasSel = selected.length > 0;
  const path = useLocationStore((s) => s.path);
  const ops = useFileOps();
  const selEntries = entries.filter((en) => selected.includes(en.path));

  return (
    <div className="command-bar">
      <button className="cmd" onClick={() => ops.newFolder(path)}>＋ 文件夹</button>
      <button className="cmd" disabled={!hasSel} onClick={() => useClipboardStore.getState().cut(selEntries)}>剪切</button>
      <button className="cmd" disabled={!hasSel} onClick={() => useClipboardStore.getState().copy(selEntries)}>复制</button>
      <button className="cmd" disabled={selected.length !== 1} onClick={() => window.dispatchEvent(new CustomEvent('winfinder:rename', { detail: selected[0] }))}>重命名</button>
      <button className="cmd" disabled={!hasSel} onClick={() => ops.remove(selected, false)}>删除</button>
      <button className="cmd" onClick={() => ops.paste(path)}>粘贴</button>
    </div>
  );
}
