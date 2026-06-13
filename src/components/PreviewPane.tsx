import type { Entry } from '../types';
import { Thumbnail } from './Thumbnail';
import { formatDate, formatSize } from '../utils/format';

export function PreviewPane({ entry }: { entry: Entry | null }) {
  return (
    <aside className="preview-pane">
      {entry ? (
        <>
          <div className="preview-thumb"><Thumbnail entry={entry} size={128} /></div>
          <h4 className="preview-name">{entry.name}</h4>
          <dl className="props">
            <dt>类型</dt><dd>{entry.isDir ? '文件夹' : entry.typeLabel}</dd>
            <dt>大小</dt><dd>{entry.isDir ? '—' : formatSize(entry.size)}</dd>
            <dt>修改日期</dt><dd>{formatDate(entry.modified) || '—'}</dd>
          </dl>
        </>
      ) : (
        <div className="empty">选择一个项目以预览</div>
      )}
    </aside>
  );
}
