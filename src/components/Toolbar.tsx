import { useLocationStore, parentOf } from '../state/locationStore';
import { ICON_BACK, ICON_FORWARD, ICON_REFRESH, ICON_UP } from '../utils/icons';

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
      <button className="fi" title="后退" disabled={!canBack} onClick={back}>{ICON_BACK}</button>
      <button className="fi" title="前进" disabled={!canForward} onClick={forward}>{ICON_FORWARD}</button>
      <button className="fi" title="向上" disabled={!canUp} onClick={up}>{ICON_UP}</button>
      <button className="fi" title="刷新" onClick={onRefresh}>{ICON_REFRESH}</button>
    </div>
  );
}
