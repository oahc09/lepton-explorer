import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLocationStore } from '../state/locationStore';
import { pathSegments } from '../utils/paths';
import type { PathSuggestion } from '../types';

export function Breadcrumb() {
  const path = useLocationStore((s) => s.path);
  const navigate = useLocationStore((s) => s.navigate);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(path);
  const [suggestions, setSuggestions] = useState<PathSuggestion[]>([]);
  const [selIdx, setSelIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onFocus = () => { setDraft(path); setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); };
    window.addEventListener('winfinder:focus-address', onFocus);
    return () => window.removeEventListener('winfinder:focus-address', onFocus);
  }, [path]);

  // Debounced address-bar autocomplete while editing.
  useEffect(() => {
    if (!editing) return;
    if (tRef.current) clearTimeout(tRef.current);
    if (!draft.trim()) { setSuggestions([]); setSelIdx(-1); return; }
    tRef.current = setTimeout(() => {
      invoke<PathSuggestion[]>('suggest_paths', { prefix: draft })
        .then((s) => { setSuggestions(s); setSelIdx(-1); })
        .catch(() => setSuggestions([]));
    }, 150);
    return () => { if (tRef.current) clearTimeout(tRef.current); };
  }, [draft, editing]);

  const go = (p: string) => { navigate(p); setEditing(false); setSuggestions([]); };

  if (editing) {
    return (
      <div className="breadcrumb-edit">
        <input
          className="breadcrumb-input"
          autoFocus
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setSelIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
            else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setSelIdx((i) => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); go(selIdx >= 0 ? suggestions[selIdx].path : draft); }
            else if (e.key === 'Escape') setEditing(false);
          }}
        />
        {suggestions.length > 0 && (
          <ul className="breadcrumb-suggest">
            {suggestions.map((s, i) => (
              <li
                key={s.path}
                className={`sug-item${i === selIdx ? ' active' : ''}`}
                // mousedown + preventDefault keeps input focus so onBlur doesn't fire before the pick.
                onMouseDown={(e) => { e.preventDefault(); go(s.path); }}
                onMouseEnter={() => setSelIdx(i)}
              >
                {s.isDir ? '📁 ' : '📄 '}{s.name}
              </li>
            ))}
          </ul>
        )}
      </div>
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
