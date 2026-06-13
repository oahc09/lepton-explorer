import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useProgressStore } from '../state/progressStore';

/**
 * Copy-progress dialog. Listens to the `fs-copy-progress` event (emitted by the
 * `copy_with_progress` Rust command) and shows a determinate bar + current file.
 * Shown while a copy is in flight; auto-hidden when the copy completes.
 */
export function ProgressModal() {
  const active = useProgressStore((s) => s.active);
  const current = useProgressStore((s) => s.current);
  const total = useProgressStore((s) => s.total);
  const file = useProgressStore((s) => s.file);

  useEffect(() => {
    const un = listen<{ current: number; total: number; file: string }>('fs-copy-progress', (e) => {
      const { current: c, total: t, file: f } = e.payload;
      useProgressStore.getState().update(c, t, f);
    });
    return () => { un.then((u) => u()); };
  }, []);

  if (!active) return null;
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className="modal-overlay">
      <div className="modal progress-modal">
        <h3>正在复制</h3>
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        <p className="progress-file" title={file}>{file || '准备中…'}</p>
        <p className="progress-count">{current} / {total} 项（{pct}%）</p>
      </div>
    </div>
  );
}
