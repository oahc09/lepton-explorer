import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Entry } from '../types';
import { formatDate, formatSize } from '../utils/format';
import { parentOf } from '../state/locationStore';
import { useMetadataStore } from '../state/metadataStore';

export function PropertiesDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const [size, setSize] = useState<number>(entry.size);
  const meta = useMetadataStore((s) => s.cache[entry.path]);
  const [tagsText, setTagsText] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (entry.isDir) { invoke<number>('get_properties', { path: entry.path }).then(setSize).catch(() => {}); }
  }, [entry]);

  // Sync editing buffers when the metadata loads/changes.
  useEffect(() => {
    setTagsText(meta?.tags.join(', ') ?? '');
    setDescription(meta?.description ?? '');
  }, [meta?.tags, meta?.description]);

  const saveRating = (n: number) => useMetadataStore.getState().setRating(entry.path, n);
  const saveTags = () =>
    useMetadataStore.getState().setTags(
      entry.path,
      tagsText.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    );
  const saveDescription = () => useMetadataStore.getState().setDescription(entry.path, description.trim());

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal properties" onClick={(e) => e.stopPropagation()}>
        <h3>{entry.name} 属性</h3>
        <dl className="props">
          <dt>类型</dt><dd>{entry.isDir ? '文件夹' : entry.typeLabel}</dd>
          <dt>位置</dt><dd>{parentOf(entry.path)}</dd>
          <dt>大小</dt><dd>{formatSize(size)}</dd>
          <dt>修改日期</dt><dd>{formatDate(entry.modified) || '—'}</dd>
          <dt>创建日期</dt><dd>{formatDate(entry.created) || '—'}</dd>
          <dt>属性</dt><dd>{[entry.isReadOnly && '只读', entry.isHidden && '隐藏'].filter(Boolean).join(' ') || '常规'}</dd>
          <dt>星级</dt>
          <dd className="star-row">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className="star-btn"
                onClick={() => saveRating(n)}
                title={`${n} 星`}
              >
                {n <= (meta?.rating ?? 0) ? '★' : '☆'}
              </button>
            ))}
          </dd>
          <dt>标签</dt>
          <dd>
            <input
              className="prop-input"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              onBlur={saveTags}
              placeholder="逗号分隔"
            />
          </dd>
          <dt>描述</dt>
          <dd>
            <textarea
              className="prop-input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescription}
              placeholder="添加描述…"
            />
          </dd>
        </dl>
        <div className="modal-actions"><button className="cmd" onClick={onClose}>确定</button></div>
      </div>
    </div>
  );
}
