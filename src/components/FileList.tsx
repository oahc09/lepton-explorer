import type { Entry, IconSize } from '../types';
import { useViewStore } from '../state/viewStore';
import { DetailsView } from './views/DetailsView';
import { IconsView } from './views/IconsView';
import { ListView } from './views/ListView';
import { TilesView } from './views/TilesView';
import { ContentView } from './views/ContentView';

export function FileList({ entries, renamingPath, onRenameCommit }: { entries: Entry[]; renamingPath?: string | null; onRenameCommit?: (newName: string) => void; }) {
  const viewMode = useViewStore((s) => s.viewMode);
  if (viewMode === 'details') return <DetailsView entries={entries} renamingPath={renamingPath} onRenameCommit={onRenameCommit} />;
  if (viewMode === 'list') return <ListView entries={entries} />;
  if (viewMode === 'tiles') return <TilesView entries={entries} />;
  if (viewMode === 'content') return <ContentView entries={entries} />;
  return <IconsView entries={entries} size={viewMode as IconSize} renamingPath={renamingPath} onRenameCommit={onRenameCommit} />;
}
