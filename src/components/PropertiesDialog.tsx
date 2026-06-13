import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Entry } from '../types';
import { formatDate, formatSize } from '../utils/format';

export function PropertiesDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const [size, setSize] = useState<number>(entry.size);
  useEffect(() => {
    if (entry.isDir) { invoke<number>('get_properties', { path: entry.path }).then(setSize).catch(() => {}); }
  }, [entry]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal properties" onClick={(e) => e.stopPropagation()}>
        <h3>{entry.name} 属性</h3>
        <dl className="props">
          <dt>类型</dt><dd>{entry.isDir ? '文件夹' : entry.typeLabel}</dd>
          <dt>位置</dt><dd>{entry.path.replace(/\\[^\\]*$/, '')}</dd>
          <dt>大小</dt><dd>{formatSize(size)}</dd>
          <dt>修改日期</dt><dd>{formatDate(entry.modified) || '—'}</dd>
          <dt>创建日期</dt><dd>{formatDate(entry.created) || '—'}</dd>
          <dt>属性</dt><dd>{[entry.isReadOnly && '只读', entry.isHidden && '隐藏'].filter(Boolean).join(' ') || '常规'}</dd>
        </dl>
        <div className="modal-actions"><button className="cmd" onClick={onClose}>确定</button></div>
      </div>
    </div>
  );
}
