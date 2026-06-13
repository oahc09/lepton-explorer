import { useConflictStore } from '../state/conflictStore';
import type { ConflictStrategy } from '../types';

/**
 * Win11 "替换或跳过文件" conflict dialog. Shown when a paste would overwrite
 * existing items. One strategy is applied to all conflicting items (the
 * "do this for all" common case). Renders nothing when no conflict is pending.
 */
export function ConflictModal() {
  const pending = useConflictStore((s) => s.pending);
  const answer = useConflictStore((s) => s.answer);
  if (!pending) return null;
  const { names } = pending;
  const n = names.length;
  const pick = (s: ConflictStrategy) => answer(s);
  const cancel = () => answer(null);
  return (
    <div className="modal-overlay" onClick={cancel}>
      <div className="modal conflict" onClick={(e) => e.stopPropagation()}>
        <h3>替换或跳过文件</h3>
        <p className="conflict-msg">
          目标位置已存在 {n} 个同名{n === 1 ? '文件' : '文件'}：
        </p>
        <ul className="conflict-names">
          {names.slice(0, 8).map((name) => (
            <li key={name} title={name}>{name}</li>
          ))}
          {n > 8 && <li className="conflict-more">…还有 {n - 8} 项</li>}
        </ul>
        <p className="conflict-all">将应用于全部 {n} 个冲突项</p>
        <div className="modal-actions conflict-actions">
          <button className="cmd" onClick={() => pick('skip')}>跳过</button>
          <button className="cmd" onClick={() => pick('rename')}>保留两者</button>
          <button className="cmd conflict-replace" onClick={() => pick('replace')}>替换</button>
          <button className="cmd" onClick={cancel}>取消</button>
        </div>
      </div>
    </div>
  );
}
