import type { Entry } from '../types';
import { useViewStore } from '../state/viewStore';
import { DetailsView } from './views/DetailsView';
import { IconsView } from './views/IconsView';

export function FileList({ entries }: { entries: Entry[] }) {
  const viewMode = useViewStore((s) => s.viewMode);
  if (viewMode === 'large' || viewMode === 'extra-large' || viewMode === 'medium' || viewMode === 'small') {
    return <IconsView entries={entries} />;
  }
  return <DetailsView entries={entries} />;
}
