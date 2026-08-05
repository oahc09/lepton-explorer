import { useEffect } from 'react';
import { useViewStore } from '../state/viewStore';

const THEMES: { mode: 'auto' | 'light' | 'dark'; label: string }[] = [
  { mode: 'auto', label: '跟随系统' },
  { mode: 'light', label: '浅色' },
  { mode: 'dark', label: '深色' },
];

/**
 * Settings modal. Reads/writes the viewStore directly so every change applies
 * live (no "应用" button needed). Persisted fields survive restart via the
 * store's persist middleware.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const themeMode = useViewStore((s) => s.themeMode);
  const showHidden = useViewStore((s) => s.showHidden);
  const showExtensions = useViewStore((s) => s.showExtensions);
  const previewPane = useViewStore((s) => s.previewPane);
  const detailsPane = useViewStore((s) => s.detailsPane);
  const navPaneWidth = useViewStore((s) => s.navPaneWidth);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="设置">
        <h3>设置</h3>

        <section className="settings-section">
          <h4>外观</h4>
          <div className="setting-row">
            <span>主题</span>
            <div className="seg">
              {THEMES.map((t) => (
                <button
                  key={t.mode}
                  className={`seg-btn${themeMode === t.mode ? ' active' : ''}`}
                  onClick={() => useViewStore.getState().setThemeMode(t.mode)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h4>显示</h4>
          <label className="setting-row">
            <span>显示隐藏的文件和文件夹</span>
            <input type="checkbox" className="switch" checked={showHidden} onChange={() => useViewStore.getState().toggleHidden()} />
          </label>
          <label className="setting-row">
            <span>显示文件扩展名</span>
            <input type="checkbox" className="switch" checked={showExtensions} onChange={() => useViewStore.getState().toggleExtensions()} />
          </label>
          <label className="setting-row">
            <span>预览窗格</span>
            <input type="checkbox" className="switch" checked={previewPane} onChange={() => useViewStore.getState().togglePreview()} />
          </label>
          <label className="setting-row">
            <span>详细信息窗格</span>
            <input type="checkbox" className="switch" checked={detailsPane} onChange={() => useViewStore.getState().toggleDetails()} />
          </label>
        </section>

        <section className="settings-section">
          <h4>导航窗格</h4>
          <div className="setting-row">
            <span>宽度</span>
            <input
              type="range"
              min={160}
              max={480}
              value={navPaneWidth}
              onChange={(e) => useViewStore.getState().setNavPaneWidth(Number(e.target.value))}
            />
            <span className="setting-value">{navPaneWidth}px</span>
          </div>
        </section>

        <div className="modal-actions"><button className="cmd" onClick={onClose}>关闭</button></div>
      </div>
    </div>
  );
}
