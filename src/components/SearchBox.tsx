import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSearchStore } from '../state/searchStore';
import { useLocationStore } from '../state/locationStore';
import type { Entry } from '../types';

export function SearchBox() {
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setResults = useSearchStore((s) => s.setResults);
  const path = useLocationStore((s) => s.path);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onFocus = () => inputRef.current?.focus();
    window.addEventListener('lepton:focus-search', onFocus);
    return () => window.removeEventListener('lepton:focus-search', onFocus);
  }, []);

  useEffect(() => {
    if (t.current) clearTimeout(t.current);
    if (!query.trim()) { setResults(null); return; }
    t.current = setTimeout(() => {
      invoke<Entry[]>('search', { root: path, query }).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => { if (t.current) clearTimeout(t.current); };
  }, [query, path, setResults]);

  const folderName = path ? path.replace(/^.*[\\/]/, '') : '';
  return (
    <input
      className="search-box"
      ref={inputRef}
      placeholder={folderName ? `搜索 ${folderName}` : '搜索'}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  );
}
