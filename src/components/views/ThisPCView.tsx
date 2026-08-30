import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DriveInfo } from '../../types';
import { ICON_USB, ICON_NETWORK, ICON_STORAGE_OPTICAL } from '../../utils/icons';

function formatBytes(bytes: number): string {
  const TB = 1024 ** 4;
  const GB = 1024 ** 3;
  const MB = 1024 ** 2;
  const KB = 1024;
  if (bytes >= TB) return `${(bytes / TB).toFixed(2)} TB`;
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(0)} KB`;
  return `${bytes} B`;
}

/**
 * Returns the Fluent glyph for a drive kind, or null for a plain hard drive —
 * Segoe Fluent Icons has no bare hard-drive glyph, so those are drawn in CSS
 * (`.thispc-drive-icon`) to avoid falling back to an Emoji that clashes.
 */
function driveIcon(kind: string): string | null {
  switch (kind) {
    case 'removable': return ICON_USB;
    case 'network': return ICON_NETWORK;
    case 'cdrom': return ICON_STORAGE_OPTICAL;
    default: return null;
  }
}

/**
 * "此电脑" (This PC) view — lists drives with their capacity / used / free space,
 * mirroring Windows Explorer's This PC page.
 */
export function ThisPCView({ onOpen }: { onOpen: (path: string) => void }) {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    invoke<DriveInfo[]>('list_thispc')
      .then((d) => { if (!cancelled) setDrives(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="empty">加载中…</div>;

  return (
    <div className="thispc">
      <h2 className="home-section">设备和驱动器</h2>
      <div className="thispc-grid">
        {drives.map((d) => {
          const pct = d.total > 0 ? Math.min(100, (d.used / d.total) * 100) : 0;
          const glyph = driveIcon(d.kind);
          return (
            <button key={d.letter} className="thispc-card" onClick={() => onOpen(d.path)} title={d.path}>
              <span className="thispc-icon">
                {glyph
                  ? <span aria-hidden className="fi">{glyph}</span>
                  : <span aria-hidden className="thispc-drive-icon" />}
              </span>
              <div className="thispc-body">
                <span className="thispc-name">{d.label} ({d.letter})</span>
                <div className="thispc-bar">
                  <div className="thispc-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="thispc-size">{formatBytes(d.free)} 可用，共 {formatBytes(d.total)}</span>
              </div>
            </button>
          );
        })}
      </div>
      {drives.length === 0 && <div className="empty">没有检测到可用驱动器。</div>}
    </div>
  );
}
