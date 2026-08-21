import type { Entry, IconSize } from '../types';
import { useViewStore } from '../state/viewStore';
import { useSorted } from './views/detailsHelpers';
import { DetailsView } from './views/DetailsView';
import { IconsView } from './views/IconsView';
import { ListView } from './views/ListView';
import { TilesView } from './views/TilesView';
import { ContentView } from './views/ContentView';

export function FileList({ entries, renamingPath, onRenameCommit }: { entries: Entry[]; renamingPath?: string | null; onRenameCommit?: (newName: string) => void; }) {
  const viewMode = useViewStore((s) => s.viewMode);
  // Sort once here so EVERY view (icons/list/details/tiles/content) honors the
  // active sort — previously only DetailsView sorted.
  const sorted = useSorted(entries);
  if (viewMode === 'details') return <DetailsView entries={sorted} renamingPath={renamingPath} onRenameCommit={onRenameCommit} />;
  if (viewMode === 'list') return <ListView entries={sorted} renamingPath={renamingPath} onRenameCommit={onRenameCommit} />;
  if (viewMode === 'tiles') return <TilesView entries={sorted} renamingPath={renamingPath} onRenameCommit={onRenameCommit} />;
  if (viewMode === 'content') return <ContentView entries={sorted} renamingPath={renamingPath} onRenameCommit={onRenameCommit} />;
  return <IconsView entries={sorted} size={viewMode as IconSize} renamingPath={renamingPath} onRenameCommit={onRenameCommit} />;
}
