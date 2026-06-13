import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TitleBar } from './components/TitleBar';
import { Toolbar } from './components/Toolbar';
import { Breadcrumb } from './components/Breadcrumb';
import { NavPane } from './components/NavPane';
import { FileList } from './components/FileList';
import { StatusBar } from './components/StatusBar';
import { ContextMenu } from './components/ContextMenu';
import { CommandBar } from './components/CommandBar';
import { useLocationStore } from './state/locationStore';
import { useViewStore } from './state/viewStore';
import { useDirectory } from './hooks/useDirectory';
import { useFileOps } from './hooks/useFileOps';
import { useHistoryStore } from './state/historyStore';
import { useClipboardStore } from './state/clipboardStore';
import { useSelectionStore } from './state/selectionStore';
import type { Entry, SpecialFolder, ViewMode } from './types';
import { VIEW_SHORTCUTS } from './shortcuts';

export default function App() {
  const path = useLocationStore((s) => s.path);
  const navigate = useLocationStore((s) => s.navigate);
  const [refreshKey, setRefreshKey] = useState(0);
  const { entries, loading, error } = useDirectory(path);
  const entryRef = useRef(entries);
  entryRef.current = entries;
  const viewMode = useViewStore((s) => s.viewMode);
  const ops = useFileOps();
  const opsRef = useRef(ops);
  opsRef.current = ops;

  // Boot to the user's Documents folder on first run.
  useEffect(() => {
    if (!path) {
      invoke<SpecialFolder[]>('special_folders').then((f) => {
        const docs = f.find((x) => x.key === 'documents');
        if (docs) navigate(docs.path);
      });
    }
  }, [path, navigate]);

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

  // Ctrl+Shift+1..8 → view mode switch (Win11 mapping).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey && e.shiftKey && VIEW_SHORTCUTS[e.key]) {
        e.preventDefault();
        useViewStore.getState().setViewMode(VIEW_SHORTCUTS[e.key]);
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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TitleBar />
      <div className="toolbar-row">
        <Toolbar onRefresh={() => setRefreshKey((k) => k + 1)} />
        <select
          className="view-select"
          value={viewMode}
          onChange={(ev) => useViewStore.getState().setViewMode(ev.target.value as ViewMode)}
        >
          <option value="extra-large">超大图标</option>
          <option value="large">大图标</option>
          <option value="medium">中等图标</option>
          <option value="small">小图标</option>
          <option value="list">列表</option>
          <option value="details">详细信息</option>
          <option value="tiles">平铺</option>
          <option value="content">内容</option>
        </select>
        <CommandBar entries={entries} />
        <Breadcrumb />
      </div>
      <div className="body">
        <NavPane />
        <main className="main-view" key={`${path}-${refreshKey}`}>
          {loading ? <div className="empty">加载中…</div>
            : error ? <div className="empty">无法打开此位置：{error}</div>
            : entries.length === 0 ? <div className="empty">此文件夹为空。</div>
            : <FileList entries={entries} />}
        </main>
      </div>
      <StatusBar count={entries.length} />
      <ContextMenu entries={entries} />
    </div>
  );
}
