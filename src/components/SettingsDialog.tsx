import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useViewStore } from '../state/viewStore';

const THEMES: { mode: 'auto' | 'light' | 'dark'; label: string }[] = [
  { mode: 'auto', label: '跟随系统' },
  { mode: 'light', label: '浅色' },
  { mode: 'dark', label: '深色' },
];

// Curated background presets. First entry doubles as the "default" tint.
const BG_PRESETS: { color: string; label: string }[] = [
  { color: '#f3f3f3', label: '浅灰' },
  { color: '#ffffff', label: '纯白' },
  { color: '#e8f0fe', label: '天蓝' },
  { color: '#e6f4ea', label: '薄荷' },
  { color: '#fce8e6', label: '暖橙' },
  { color: '#f3e8fd', label: '薰衣草' },
  { color: '#202124', label: '深空' },
  { color: '#1e1e2e', label: '深蓝灰' },
];

const GITHUB_URL = 'https://github.com/oahc09/lepton-explorer';

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
  const bgColor = useViewStore((s) => s.bgColor);

  const [version, setVersion] = useState('1.0.0');
  const [autostart, setAutostart] = useState(false);
  const [logMsg, setLogMsg] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Load the app version and the current auto-start state on open.
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
    invoke<boolean>('get_autostart')
      .then(setAutostart)
      .catch(() => setAutostart(false));
  }, []);

  const toggleAutostart = async (next: boolean) => {
    const prev = autostart;
    setAutostart(next); // optimistic
    try {
      await invoke('set_autostart', { enabled: next });
    } catch {
      setAutostart(prev); // revert on failure
    }
  };

  // Open the crash-log directory in the system file manager.
  const openLogs = async () => {
    try {
      await invoke('open_logs_dir');
      setLogMsg('已打开日志目录');
    } catch (e) {
      setLogMsg(`打开失败：${String(e)}`);
    }
    window.setTimeout(() => setLogMsg(null), 3000);
  };

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
          <div className="setting-row">
            <span>背景颜色</span>
            <div className="swatch-row">
              {BG_PRESETS.map((p) => (
                <button
                  key={p.color}
                  type="button"
                  title={p.label}
                  aria-label={`背景色 ${p.label}`}
                  className={`swatch${bgColor === p.color ? ' active' : ''}`}
                  style={{ background: p.color }}
                  onClick={() => useViewStore.getState().setBgColor(p.color)}
                />
              ))}
              <label className="swatch swatch-custom" title="自定义颜色">
                <input
                  type="color"
                  value={bgColor ?? '#ffffff'}
                  onChange={(e) => useViewStore.getState().setBgColor(e.target.value)}
                />
              </label>
              {bgColor && (
                <button type="button" className="swatch-reset" onClick={() => useViewStore.getState().setBgColor(null)}>
                  重置
                </button>
              )}
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

        <section className="settings-section">
          <h4>启动</h4>
          <label className="setting-row">
            <span>开机自动启动</span>
            <input type="checkbox" className="switch" checked={autostart} onChange={(e) => toggleAutostart(e.target.checked)} />
          </label>
        </section>

        <section className="settings-section">
          <h4>排查 / 日志</h4>
          <div className="setting-row">
            <span>崩溃与异常日志目录</span>
            <button type="button" className="link-btn" onClick={openLogs}>
              打开日志目录
            </button>
          </div>
          <p className="setting-hint">
            日志位于 <code>%LOCALAPPDATA%\com.lepton.explorer\logs\</code>，用于排查软件崩溃。
          </p>
          {logMsg && <p className="setting-hint">{logMsg}</p>}
        </section>

        <section className="settings-section">
          <h4>关于</h4>
          <div className="about-row">
            <span>应用名称</span>
            <span className="setting-value">Lepton Explorer</span>
          </div>
          <div className="about-row">
            <span>版本</span>
            <span className="setting-value">{version}</span>
          </div>
          <div className="about-row">
            <span>开源仓库</span>
            <button type="button" className="link-btn" onClick={() => openUrl(GITHUB_URL).catch(() => {})}>
              GitHub ↗
            </button>
          </div>
        </section>

        <div className="modal-actions"><button className="cmd" onClick={onClose}>关闭</button></div>
      </div>
    </div>
  );
}
