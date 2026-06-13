import type { Entry } from '../types';
import { formatDate, formatSize } from '../utils/format';

export function DetailsPane({ entry }: { entry: Entry | null }) {
  return (
    <aside className="details-pane">
      {entry ? (
        <dl className="props">
          <dt>名称</dt><dd>{entry.name}</dd>
          <dt>类型</dt><dd>{entry.isDir ? '文件夹' : entry.typeLabel}</dd>
          <dt>大小</dt><dd>{entry.isDir ? '—' : formatSize(entry.size)}</dd>
          <dt>修改日期</dt><dd>{formatDate(entry.modified) || '—'}</dd>
          <dt>创建日期</dt><dd>{formatDate(entry.created) || '—'}</dd>
          <dt>属性</dt><dd>{[entry.isReadOnly && '只读', entry.isHidden && '隐藏'].filter(Boolean).join(' ') || '常规'}</dd>
        </dl>
      ) : (
        <div className="empty">选择一个项目以查看详细信息</div>
      )}
    </aside>
  );
}
