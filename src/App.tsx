import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TitleBar } from './components/TitleBar';
import { Toolbar } from './components/Toolbar';
import { Breadcrumb } from './components/Breadcrumb';
import { NavPane } from './components/NavPane';
import { FileList } from './components/FileList';
import { StatusBar } from './components/StatusBar';
import { ContextMenu } from './components/ContextMenu';
import { useLocationStore } from './state/locationStore';
import { useViewStore } from './state/viewStore';
import { useDirectory } from './hooks/useDirectory';
import type { SpecialFolder } from './types';

export default function App() {
  const path = useLocationStore((s) => s.path);
  const navigate = useLocationStore((s) => s.navigate);
  const [refreshKey, setRefreshKey] = useState(0);
  const { entries, loading, error } = useDirectory(path);

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

  return (
    <div className="app">
      <TitleBar />
      <div className="toolbar-row">
        <Toolbar onRefresh={() => setRefreshKey((k) => k + 1)} />
        <button className="view-toggle" onClick={() => {
          const m = useViewStore.getState().viewMode;
          useViewStore.getState().setViewMode(m === 'details' ? 'large' : 'details');
        }}>切换视图</button>
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
      <ContextMenu />
    </div>
  );
}
