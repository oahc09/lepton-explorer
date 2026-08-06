import { useEffect, useMemo, useRef, useState } from 'react';
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
import { OpenWithDialog } from './components/OpenWithDialog';
import { ConflictModal } from './components/ConflictModal';
import { ProgressModal } from './components/ProgressModal';
import { SettingsDialog } from './components/SettingsDialog';
import { CommandBar } from './components/CommandBar';
import { SearchBox } from './components/SearchBox';
import { PreviewPane } from './components/PreviewPane';
import { DetailsPane } from './components/DetailsPane';
import { useLocationStore } from './state/locationStore';
import { useSearchStore } from './state/searchStore';
import { useViewStore } from './state/viewStore';
import { useDirectory } from './hooks/useDirectory';
import { useFileOps } from './hooks/useFileOps';
import { useHistoryStore } from './state/historyStore';
import { useClipboardStore } from './state/clipboardStore';
import { useSelectionStore } from './state/selectionStore';
import { usePinnedStore } from './state/pinnedStore';
import { useRecentStore } from './state/recentStore';
import type { Entry, FolderView } from './types';
import { isVirtualPath } from './types';
import { HomeView } from './components/views/HomeView';
import { VIEW_SHORTCUTS } from './shortcuts';
import { openItem } from './utils/open';
import { newWindow } from './utils/window';
import { cycleIconSize } from './utils/viewCycle';

export default function App() {
  const path = useLocationStore((s) => s.path);
  const navigate = useLocationStore((s) => s.navigate);
  const [refreshKey, setRefreshKey] = useState(0);
  const { entries, loading, error } = useDirectory(path, refreshKey);
  const searchResults = useSearchStore((s) => s.results);
  const showHidden = useViewStore((s) => s.showHidden);
  const themeMode = useViewStore((s) => s.themeMode);
  const bgColor = useViewStore((s) => s.bgColor);
  const visibleEntries = useMemo(() => entries.filter((e) => showHidden || !e.isHidden), [entries, showHidden]);
  const shownEntries = searchResults ?? visibleEntries;
  const previewPane = useViewStore((s) => s.previewPane);
  const detailsPane = useViewStore((s) => s.detailsPane);
  const sel = useSelectionStore((s) => s.selected);
  const previewEntry = useMemo(() => sel.length === 1 ? shownEntries.find((e) => e.path === sel[0]) ?? null : null, [sel, shownEntries]);
  const entryRef = useRef(entries);
  entryRef.current = entries;
  const shownRef = useRef(shownEntries);
  shownRef.current = shownEntries;
  const ops = useFileOps();
  const opsRef = useRef(ops);
  opsRef.current = ops;
  // F6 pane-focus cycling: 0 = nav pane, 1 = address bar, 2 = file list.
  const focusZone = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
  const [propsEntry, setPropsEntry] = useState<Entry | null>(null);
  const setPropsEntryRef = useRef(setPropsEntry);
  setPropsEntryRef.current = setPropsEntry;
  const [openWithEntry, setOpenWithEntry] = useState<Entry | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fs, setFs] = useState(false);

  // Per-folder view persistence: which folder's overrides are currently applied,
  // and a debounce timer for writes back to the backend.
  const appliedPathRef = useRef('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open-with initial ?path= query (set by a New Window so it starts on the same folder).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('path');
    if (p) navigate(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { getCurrentWindow().setFullscreen(fs).catch(() => {}); }, [fs]);

  // Clear selection when the active path (tab) changes; selection is global, so without this
  // switching tabs would leave stale selection that could act on the wrong folder.
  useEffect(() => {
    useSelectionStore.getState().clear();
    // Clear any active search on navigation so the new folder's contents show.
    const ss = useSearchStore.getState();
    if (ss.query) { ss.setQuery(''); ss.setResults(null); }
  }, [path]);

  // Per-folder view persistence: load saved overrides when entering a real folder.
  // Virtual roots (network:/gallery:) are not persisted.
  useEffect(() => {
    appliedPathRef.current = path;
    if (!path || isVirtualPath(path)) return;
    let cancelled = false;
    invoke<FolderView | null>('get_folder_view', { path })
      .then((fv) => {
        if (!cancelled && fv) useViewStore.getState().applyFolderOverrides(fv);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [path]);

  // Persist view changes (view mode / sort / column widths) back to the backend for
  // the currently-applied folder. Debounced; skipped for virtual roots.
  useEffect(() => {
    const unsub = useViewStore.subscribe((state, prev) => {
      if (state.viewMode === prev.viewMode && state.sort === prev.sort && state.colWidths === prev.colWidths) return;
      const p = appliedPathRef.current;
      if (!p || isVirtualPath(p)) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const { viewMode, sort, colWidths } = state;
      saveTimerRef.current = setTimeout(() => {
        void invoke('set_folder_view', {
          path: p,
          viewMode,
          sortField: sort.field,
          sortAsc: sort.asc,
          colWidths,
        });
      }, 400);
    });
    return () => {
      unsub();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);


  const onRenameCommit = (newName: string) => {
    if (renamingPath && newName.trim()) ops.renameEntry(renamingPath, newName.trim());
    setRenamingPath(null);
  };

  // Theme: manual override (light/dark) or follow the system (auto).
  useEffect(() => {
    const apply = (t: 'light' | 'dark') => {
      document.documentElement.classList.toggle('theme-dark', t === 'dark');
      document.documentElement.classList.toggle('theme-light', t === 'light');
    };
    if (themeMode !== 'auto') {
      apply(themeMode);
      return;
    }
    getCurrentWindow().theme().then((t) => t && apply(t as 'light' | 'dark')).catch(() => {});
    const unlisten = getCurrentWindow().onThemeChanged((e) => e.payload && apply(e.payload as 'light' | 'dark'));
    return () => { unlisten.then((u) => u()); };
  }, [themeMode]);

  // Custom background color: feed it to a CSS variable consumed by the theme.
  useEffect(() => {
    const root = document.documentElement;
    if (bgColor) root.style.setProperty('--app-bg', bgColor);
    else root.style.removeProperty('--app-bg');
  }, [bgColor]);

  // File ops dispatch lepton:refresh; re-list when it fires.
  useEffect(() => {
    const onRefresh = () => setRefreshKey((k) => k + 1);
    window.addEventListener('lepton:refresh', onRefresh);
    return () => window.removeEventListener('lepton:refresh', onRefresh);
  }, []);

  // Context menu dispatches lepton:properties; open the dialog when it fires.
  useEffect(() => {
    const onProps = (e: Event) => setPropsEntry((e as CustomEvent<Entry>).detail);
    window.addEventListener('lepton:properties', onProps as EventListener);
    return () => window.removeEventListener('lepton:properties', onProps as EventListener);
  }, []);

  // CommandBar/F2 dispatches lepton:rename (detail = path); start inline rename.
  useEffect(() => {
    const onRename = (e: Event) => setRenamingPath((e as CustomEvent<string>).detail);
    window.addEventListener('lepton:rename', onRename as EventListener);
    return () => window.removeEventListener('lepton:rename', onRename as EventListener);
  }, []);

  // Context menu dispatches lepton:open-with (detail = Entry); open the dialog.
  useEffect(() => {
    const onOpenWith = (e: Event) => setOpenWithEntry((e as CustomEvent<Entry>).detail);
    window.addEventListener('lepton:open-with', onOpenWith as EventListener);
    return () => window.removeEventListener('lepton:open-with', onOpenWith as EventListener);
  }, []);

  // Settings entry point: lepton:settings opens the settings dialog.
  useEffect(() => {
    const onSettings = () => setSettingsOpen(true);
    window.addEventListener('lepton:settings', onSettings as EventListener);
    return () => window.removeEventListener('lepton:settings', onSettings as EventListener);
  }, []);

  // Watch the current path for filesystem changes; re-list on fs-changed.
  useEffect(() => {
    if (!path || isVirtualPath(path)) return;
    invoke('watch_directory', { path }).catch(() => {});
    const un = listen<string>('fs-changed', (e) => {
      if (e.payload === path) setRefreshKey((k) => k + 1);
    });
    return () => { un.then((u) => u()); };
  }, [path]);

  // Live cross-window sync: when another window writes pinned/recent to localStorage,
  // rehydrate the persisted stores here so changes reflect immediately. The `storage`
  // event only fires in OTHER windows/tabs — never the one that made the change — which
  // is exactly the cross-window propagation we want (the writing window is already current).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'lepton-pinned') void usePinnedStore.persist.rehydrate();
      if (e.key === 'lepton-recent') void useRecentStore.persist.rehydrate();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Reset the pane-focus cycle to start at the nav pane after each navigation.
  useEffect(() => { focusZone.current = 0; }, [path]);

  // F6 file-list target: focus the main view when requested.
  useEffect(() => {
    const onFocus = () => mainRef.current?.focus();
    window.addEventListener('lepton:focus-filelist', onFocus);
    return () => window.removeEventListener('lepton:focus-filelist', onFocus);
  }, []);

  // Ctrl+mouse-wheel changes icon size (Win11 operating habit). Non-passive so we
  // can preventDefault the browser's ctrl+wheel page zoom. Scoped to the file list.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      const target = e.target as HTMLElement | null;
      if (!target || !target.closest('.main-view')) return;
      e.preventDefault();
      const vm = useViewStore.getState().viewMode;
      useViewStore.getState().setViewMode(cycleIconSize(vm, e.deltaY < 0));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  // Ctrl+Shift+1..8 → view mode switch (Win11 mapping).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L') && !e.shiftKey) { e.preventDefault(); window.dispatchEvent(new CustomEvent('lepton:focus-address')); return; }
      if (e.altKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); window.dispatchEvent(new CustomEvent('lepton:focus-address')); return; }
      if (e.key === 'F4' && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); window.dispatchEvent(new CustomEvent('lepton:focus-address')); return; }
      if (e.ctrlKey && !e.shiftKey && (e.key === ',' || e.key === '，')) { e.preventDefault(); window.dispatchEvent(new CustomEvent('lepton:settings')); return; }
      if (e.ctrlKey && (e.key === 'e' || e.key === 'E' || e.key === 'f' || e.key === 'F') && !e.shiftKey) { e.preventDefault(); window.dispatchEvent(new CustomEvent('lepton:focus-search')); return; }
      if (e.key === 'F6') {
        // Cycle focus between nav pane → address bar → file list (Shift = reverse).
        e.preventDefault();
        const ZONES = ['lepton:focus-navpane', 'lepton:focus-address', 'lepton:focus-filelist'] as const;
        focusZone.current = e.shiftKey
          ? (focusZone.current + ZONES.length - 1) % ZONES.length
          : (focusZone.current + 1) % ZONES.length;
        window.dispatchEvent(new CustomEvent(ZONES[focusZone.current]));
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Backspace') { e.preventDefault(); useLocationStore.getState().back(); return; }
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); useLocationStore.getState().back(); return; }
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); useLocationStore.getState().forward(); return; }
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 'ArrowUp') { e.preventDefault(); useLocationStore.getState().up(); return; }
      if (e.ctrlKey && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        useLocationStore.getState().addTab('');
        return;
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        const ok = useLocationStore.getState().closeTab(useLocationStore.getState().activeId);
        if (!ok) getCurrentWindow().close();
        return;
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const { tabs, activeId, setActive } = useLocationStore.getState();
        const i = tabs.findIndex((t) => t.id === activeId);
        const ni = e.shiftKey ? (i - 1 + tabs.length) % tabs.length : (i + 1) % tabs.length;
        setActive(tabs[ni].id);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const { tabs, setActive } = useLocationStore.getState();
        if (tabs[idx]) {
          e.preventDefault();
          setActive(tabs[idx].id);
        }
        return;
      }
      const list = shownRef.current;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!list.length) return;
        const cur = useSelectionStore.getState().focusIndex;
        let next = cur < 0 ? 0 : cur + (e.key === 'ArrowDown' ? 1 : -1);
        next = Math.max(0, Math.min(list.length - 1, next));
        const item = list[next];
        useSelectionStore.getState().select([item]);
        useSelectionStore.getState().setFocus(next);
        window.dispatchEvent(new CustomEvent('lepton:scroll-to-index', { detail: next }));
        return;
      }
      if (e.key === 'Enter' && !e.altKey) {
        const sel = useSelectionStore.getState().selected;
        if (sel.length === 1) {
          const it = list.find((en) => en.path === sel[0]);
          if (it) {
            if (it.isDir) useLocationStore.getState().navigate(it.path);
            else openItem(it.path);
          }
        }
        return;
      }
      if (e.altKey && e.shiftKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); useViewStore.getState().toggleDetails(); return; }
      if (e.altKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); useViewStore.getState().togglePreview(); return; }
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
          window.dispatchEvent(new CustomEvent('lepton:open-menu', { detail: { x, y } }));
        }
        return;
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); newWindow(isVirtualPath(path) ? '' : path); return; }
      if (e.ctrlKey && !e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        useSelectionStore.getState().select(shownRef.current);
        return;
      }
      const selected = useSelectionStore.getState().selected;
      const selEntries = shownRef.current.filter((en: Entry) => selected.includes(en.path));
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
        e.preventDefault();
        useClipboardStore.getState().copy(selEntries);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
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
      if (e.key === 'F5') { e.preventDefault(); window.dispatchEvent(new CustomEvent('lepton:refresh')); return; }
      if (e.key === 'F2' && selected.length === 1) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('lepton:rename', { detail: selected[0] }));
        return;
      }
      if (e.key === 'Home' || e.key === 'End') {
        window.dispatchEvent(new CustomEvent('lepton:scroll', { detail: e.key }));
        return;
      }
      if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        if (selected.length === 1) {
          const en = shownRef.current.find((x: Entry) => x.path === selected[0]);
          if (en) setPropsEntryRef.current(en);
        }
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Nav pane drag-to-resize: mouse-down on the splitter starts a drag that
  // adjusts navPaneWidth via the viewStore. Mirrors the DetailsView col
  // resize pattern (mousedown → window mousemove/mouseup).
  const startNavResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = useViewStore.getState().navPaneWidth;
    const onMove = (ev: MouseEvent) => {
      useViewStore.getState().setNavPaneWidth(startW + (ev.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="app">
      <TitleBar />
      <CommandBar entries={shownEntries} />
      <div className="address-row">
        <Toolbar onRefresh={() => setRefreshKey((k) => k + 1)} />
        <Breadcrumb />
        {path !== '' && <SearchBox />}
        <button className="cmd settings-btn" onClick={() => window.dispatchEvent(new CustomEvent('lepton:settings'))} title="设置">⚙</button>
      </div>
      <div className="body">
        <NavPane />
        <div className="nav-splitter" onMouseDown={startNavResize} />
        <main className="main-view" key={path} ref={mainRef} tabIndex={0}>
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
        {previewPane && <PreviewPane entry={previewEntry} />}
        {detailsPane && <DetailsPane entry={previewEntry} />}
      </div>
      <StatusBar count={shownEntries.length} entries={shownEntries} />
      <ContextMenu entries={shownEntries} />
      {propsEntry && <PropertiesDialog entry={propsEntry} onClose={() => setPropsEntry(null)} />}
      {openWithEntry && <OpenWithDialog entry={openWithEntry} onClose={() => setOpenWithEntry(null)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <ConflictModal />
      <ProgressModal />
    </div>
  );
}
