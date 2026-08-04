import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useProgressStore } from '../state/progressStore';

type ProgressPayload = { current: number; total: number; file: string };

/**
 * File-op progress dialog. Listens to `fs-copy-progress` (copy/move) and
 * `fs-zip-progress` (compress/extract) and shows a determinate bar + current
 * file. The `kind` in the store selects the title and which cancel command to
 * invoke (copy → cancel_copy; compress/extract → cancel_zip).
 */
export function ProgressModal() {
  const active = useProgressStore((s) => s.active);
  const kind = useProgressStore((s) => s.kind);
  const current = useProgressStore((s) => s.current);
  const total = useProgressStore((s) => s.total);
  const file = useProgressStore((s) => s.file);

  useEffect(() => {
    const onProgress = (p: ProgressPayload) => {
      useProgressStore.getState().update(p.current, p.total, p.file);
    };
    const un1 = listen<ProgressPayload>('fs-copy-progress', (e) => onProgress(e.payload));
    const un2 = listen<ProgressPayload>('fs-zip-progress', (e) => onProgress(e.payload));
    return () => {
      un1.then((u) => u());
      un2.then((u) => u());
    };
  }, []);

  if (!active) return null;
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const title =
    kind === 'extract' ? '正在解压'
    : kind === 'compress' ? '正在压缩'
    : kind === 'move' ? '正在移动'
    : '正在复制';
  const onCancel = () => {
    if (kind === 'copy' || kind === 'move') void invoke('cancel_copy');
    else void invoke('cancel_zip');
  };
  return (
    <div className="modal-overlay">
      <div className="modal progress-modal">
        <h3>{title}</h3>
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        <p className="progress-file" title={file}>{file || '准备中…'}</p>
        <p className="progress-count">{current} / {total} 项（{pct}%）</p>
        <div className="modal-actions"><button className="cmd" onClick={onCancel}>取消</button></div>
      </div>
    </div>
  );
}
