import { useLocationStore, parentOf } from '../state/locationStore';

export function Toolbar({ onRefresh }: { onRefresh: () => void }) {
  const back = useLocationStore((s) => s.back);
  const forward = useLocationStore((s) => s.forward);
  const up = useLocationStore((s) => s.up);
  const path = useLocationStore((s) => s.path);
  const canBack = useLocationStore((s) => s.backStack.length > 0);
  const canForward = useLocationStore((s) => s.forwardStack.length > 0);
  const canUp = path !== '' && parentOf(path) !== path;

  return (
    <div className="toolbar">
      <button title="后退" disabled={!canBack} onClick={back}>←</button>
      <button title="前进" disabled={!canForward} onClick={forward}>→</button>
      <button title="向上" disabled={!canUp} onClick={up}>↑</button>
      <button title="刷新" onClick={onRefresh}>↻</button>
    </div>
  );
}
