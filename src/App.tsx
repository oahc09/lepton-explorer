import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { TitleBar } from './components/TitleBar';
import { Toolbar } from './components/Toolbar';
import { Breadcrumb } from './components/Breadcrumb';
import { NavPane } from './components/NavPane';
import { FileList } from './components/FileList';
import { StatusBar } from './components/StatusBar';
import { ContextMenu } from './components/ContextMenu';
import { PropertiesDialog } from './components/PropertiesDialog';
import { CommandBar } from './components/CommandBar';
import { SearchBox } from './components/SearchBox';
import { useLocationStore } from './state/locationStore';
import { useSearchStore } from './state/searchStore';
import { useViewStore } from './state/viewStore';
import { useDirectory } from './hooks/useDirectory';
import { useFileOps } from './hooks/useFileOps';
import { useHistoryStore } from './state/historyStore';
import { useClipboardStore } from './state/clipboardStore';
import { useSelectionStore } from './state/selectionStore';
import type { Entry } from './types';
import { HomeView } from './components/views/HomeView';
import { VIEW_SHORTCUTS } from './shortcuts';

export default function App() {
  const path = useLocationStore((s) => s.path);
  const navigate = useLocationStore((s) => s.navigate);
  const [refreshKey, setRefreshKey] = useState(0);
  const { entries, loading, error } = useDirectory(path);
  const searchResults = useSearchStore((s) => s.results);
  const shownEntries = searchResults ?? entries;
  const entryRef = useRef(entries);
  entryRef.current = entries;
  const ops = useFileOps();
  const opsRef = useRef(ops);
  opsRef.current = ops;
  const [propsEntry, setPropsEntry] = useState<Entry | null>(null);
  const setPropsEntryRef = useRef(setPropsEntry);
  setPropsEntryRef.current = setPropsEntry;
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [fs, setFs] = useState(false);

  useEffect(() => { getCurrentWindow().setFullscreen(fs).catch(() => {}); }, [fs]);

  const onRenameCommit = (newName: string) => {
    if (renamingPath && newName.trim()) ops.renameEntry(renamingPath, newName.trim());
    setRenamingPath(null);
  };

  // Follow system light/dark theme.
  useEffect(() => {
    const apply = (t: 'light' | 'dark') => {
      document.documentElement.classList.toggle('theme-dark', t === 'dark');
      document.documentElement.classList.toggle('theme-light', t === 'light');
    };
    getCurrentWindow().theme().then((t) => t && apply(t as 'light' | 'dark')).catch(() => {});
    const unlisten = getCurrentWindow().onThemeChanged((e) => e.payload && apply(e.payload as 'light' | 'dark'));
    return () => { unlisten.then((u) => u()); };
  }, []);

  // File ops dispatch winfinder:refresh; re-list when it fires.
  useEffect(() => {
    const onRefresh = () => setRefreshKey((k) => k + 1);
    window.addEventListener('winfinder:refresh', onRefresh);
    return () => window.removeEventListener('winfinder:refresh', onRefresh);
  }, []);

  // Context menu dispatches winfinder:properties; open the dialog when it fires.
  useEffect(() => {
    const onProps = (e: Event) => setPropsEntry((e as CustomEvent<Entry>).detail);
    window.addEventListener('winfinder:properties', onProps as EventListener);
    return () => window.removeEventListener('winfinder:properties', onProps as EventListener);
  }, []);

  // CommandBar/F2 dispatches winfinder:rename (detail = path); start inline rename.
  useEffect(() => {
    const onRename = (e: Event) => setRenamingPath((e as CustomEvent<string>).detail);
    window.addEventListener('winfinder:rename', onRename as EventListener);
    return () => window.removeEventListener('winfinder:rename', onRename as EventListener);
  }, []);

  // Watch the current path for filesystem changes; re-list on fs-changed.
  useEffect(() => {
    if (!path) return;
    invoke('watch_directory', { path });
    const un = listen<string>('fs-changed', (e) => {
      if (e.payload === path) setRefreshKey((k) => k + 1);
    });
    return () => { un.then((u) => u()); };
  }, [path]);

  // Ctrl+Shift+1..8 → view mode switch (Win11 mapping).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey && e.shiftKey && VIEW_SHORTCUTS[e.key]) {
        e.preventDefault();
        useViewStore.getState().setViewMode(VIEW_SHORTCUTS[e.key]);
      }
      if (e.key === 'F11') {
        e.preventDefault();
        setFs((f) => !f);
        return;
      }
      if (e.key === 'F10' && e.shiftKey) {
        e.preventDefault();
        const sel = useSelectionStore.getState().selected;
        if (sel.length) {
          const el = document.querySelector(`[data-path="${CSS.escape(sel[0])}"]`) as HTMLElement | null;
          const r = el?.getBoundingClientRect();
          const x = r ? r.left + 40 : window.innerWidth / 2;
          const y = r ? r.bottom : window.innerHeight / 2;
          window.dispatchEvent(new CustomEvent('winfinder:open-menu', { detail: { x, y } }));
        }
        return;
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        useSelectionStore.getState().select(entryRef.current);
        return;
      }
      const selected = useSelectionStore.getState().selected;
      const selEntries = entryRef.current.filter((en: Entry) => selected.includes(en.path));
      if (e.key === 'Delete') {
        e.preventDefault();
        if (e.shiftKey) opsRef.current.remove(selected, true);
        else opsRef.current.remove(selected, false);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        opsRef.current.remove(selected, false);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        useClipboardStore.getState().copy(selEntries);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === 'x' || e.key === 'X')) {
        useClipboardStore.getState().cut(selEntries);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        opsRef.current.paste(useLocationStore.getState().path);
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        opsRef.current.newFolder(useLocationStore.getState().path);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        useHistoryStore.getState().undo();
        return;
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        useHistoryStore.getState().redo();
        return;
      }
      if (e.key === 'F2' && selected.length === 1) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('winfinder:rename', { detail: selected[0] }));
        return;
      }
      if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        if (selected.length === 1) {
          const en = entryRef.current.find((x: Entry) => x.path === selected[0]);
          if (en) setPropsEntryRef.current(en);
        }
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TitleBar />
      <div className="toolbar-row">
        <Toolbar onRefresh={() => setRefreshKey((k) => k + 1)} />
        <CommandBar entries={shownEntries} />
        <Breadcrumb />
        {path !== '' && <SearchBox />}
      </div>
      <div className="body">
        <NavPane />
        <main className="main-view" key={`${path}-${refreshKey}`}>
          {path === '' ? (
            <HomeView onOpen={(p) => navigate(p)} />
          ) : loading ? (
            <div className="empty">加载中…</div>
          ) : error ? (
            <div className="empty">无法打开此位置：{error}</div>
          ) : entries.length === 0 ? (
            <div className="empty">此文件夹为空。</div>
          ) : (
            <FileList entries={shownEntries} renamingPath={renamingPath} onRenameCommit={onRenameCommit} />
          )}
        </main>
      </div>
      <StatusBar count={entries.length} />
      <ContextMenu entries={entries} />
      {propsEntry && <PropertiesDialog entry={propsEntry} onClose={() => setPropsEntry(null)} />}
    </div>
  );
}
