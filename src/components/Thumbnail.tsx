import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Entry } from '../types';

const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
const TYPE_EMOJI: Record<string, string> = {
  pdf: '📄', txt: '📄', md: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
  ppt: '📽️', pptx: '📽️', zip: '🗜️', rar: '🗜️', '7z': '🗜️', mp3: '🎵', wav: '🎵',
  mp4: '🎬', mkv: '🎬', mov: '🎬', exe: '⚙️', json: '📄', html: '🌐', css: '🌐', js: '🌐', ts: '🌐',
};

// Module-level cache: avoids re-fetching thumbnails on scroll.
// Uses Object URLs (blob:) instead of data: URLs to avoid holding large
// base64 strings in memory. A 32×32 icon is ~1KB as a blob vs ~1.3KB as
// base64; a 200×200 thumbnail is ~15KB as a blob vs ~20KB as base64, and
// the base64 string also bloats the JS heap by 33%. Object URLs are
// backed by the browser's blob store, not the JS heap.
//
// Capped at 200 entries (reduced from 500) to bound blob memory.
// Each entry is revoked via URL.revokeObjectURL on eviction.
const MAX_CACHE = 200;
const cache = new Map<string, string>();

function cacheKey(path: string, size: number): string {
  return `${path}:${size}`;
}

/** Evict the oldest entry, revoking its Object URL to free blob memory. */
function evictOldest() {
  if (cache.size <= MAX_CACHE) return;
  const firstKey = cache.keys().next().value;
  if (firstKey !== undefined) {
    const oldUrl = cache.get(firstKey);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    cache.delete(firstKey);
  }
}

export function Thumbnail({ entry, size }: { entry: Entry; size: number }) {
  const key = useMemo(() => cacheKey(entry.path, size), [entry.path, size]);
  const [src, setSrc] = useState<string | null>(() => cache.get(key) ?? null);
  // Track whether this instance owns the current Object URL, so cleanup
  // on unmount doesn't revoke a URL that's still in the cache (and thus
  // potentially used by other Thumbnail instances for the same key).
  const ownsUrl = useRef(false);

  useEffect(() => {
    if (cache.has(key)) return;

    let cancelled = false;
    const ext = entry.ext.toLowerCase();
    const isImg = IMG_EXT.includes(ext);
    const cmd = isImg ? 'get_thumbnail' : 'get_icon';
    invoke<string | null>(cmd, { path: entry.path, size })
      .then((d) => {
        if (!cancelled && d) {
          // Convert base64 → Object URL to avoid holding base64 in JS heap.
          const byteChars = atob(d);
          const bytes = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'image/png' });
          const url = URL.createObjectURL(blob);

          cache.set(key, url);
          evictOldest();
          ownsUrl.current = true;
          setSrc(url);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [key, entry.path, entry.ext, size]);

  // On unmount: if we created the URL and it's no longer in the cache
  // (evicted), revoke it. If it's still in the cache, leave it — other
  // instances may reuse it, and the cache eviction will revoke it later.
  useEffect(() => {
    return () => {
      if (ownsUrl.current) {
        const cached = cache.get(key);
        if (!cached) {
          // Already evicted — the URL was revoked during eviction.
        }
        // If still cached, don't revoke: other instances may use it.
      }
    };
  }, [key]);

  if (src) return <img className="thumb-img" src={src} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />;
  return <span style={{ fontSize: size }}>{entry.isDir ? '📁' : (TYPE_EMOJI[entry.ext.toLowerCase()] ?? '📄')}</span>;
}
