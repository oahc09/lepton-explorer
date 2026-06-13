import { useState } from 'react';
import { useLocationStore } from '../state/locationStore';
import { pathSegments } from '../utils/paths';

export function Breadcrumb() {
  const path = useLocationStore((s) => s.path);
  const navigate = useLocationStore((s) => s.navigate);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(path);

  if (editing) {
    return (
      <input
        className="breadcrumb-input"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { navigate(draft); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  const segs = pathSegments(path);
  return (
    <div className="breadcrumb" onDoubleClick={() => { setDraft(path); setEditing(true); }}>
      {segs.map((s, i) => (
        <span key={s.path} className="crumb-group">
          {i > 0 && <span className="chevron">›</span>}
          <button className="crumb" onClick={() => navigate(s.path)}>{s.name}</button>
        </span>
      ))}
    </div>
  );
}
