import { useConfirmStore } from '../state/confirmStore';

/**
 * Generic yes/no confirm dialog (Win11 modal). Used for destructive actions
 * such as deleting files. Renders nothing when no confirm is pending.
 */
export function ConfirmDialog() {
  const pending = useConfirmStore((s) => s.pending);
  const answer = useConfirmStore((s) => s.answer);
  if (!pending) return null;
  const { title, message, names, confirmLabel, danger } = pending;
  const n = names?.length ?? 0;
  const confirm = () => answer(true);
  const cancel = () => answer(false);
  return (
    <div className="modal-overlay" onClick={cancel}>
      <div className="modal confirm" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="confirm-msg">{message}</p>
        {n > 0 && (
          <ul className="confirm-names">
            {names!.slice(0, 8).map((name) => (
              <li key={name} title={name}>{name}</li>
            ))}
            {n > 8 && <li className="confirm-more">…还有 {n - 8} 项</li>}
          </ul>
        )}
        <div className="modal-actions confirm-actions">
          <button className="cmd" onClick={cancel}>取消</button>
          <button className={`cmd${danger ? ' confirm-danger' : ''}`} onClick={confirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
