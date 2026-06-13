import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Entry } from '../types';

const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
const TYPE_EMOJI: Record<string, string> = {
  pdf: '📄', txt: '📄', md: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
  ppt: '📽️', pptx: '📽️', zip: '🗜️', rar: '🗜️', '7z': '🗜️', mp3: '🎵', wav: '🎵',
  mp4: '🎬', mkv: '🎬', mov: '🎬', exe: '⚙️', json: '📄', html: '🌐', css: '🌐', js: '🌐', ts: '🌐',
};

export function Thumbnail({ entry, size }: { entry: Entry; size: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const ext = entry.ext.toLowerCase();
    const isImg = IMG_EXT.includes(ext);
    const cmd = isImg ? 'get_thumbnail' : 'get_icon';
    invoke<string | null>(cmd, { path: entry.path, size: isImg ? size : 32 })
      .then((d) => { if (!cancelled && d) setSrc(`data:image/png;base64,${d}`); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [entry.path, entry.ext, size]);

  if (src) return <img className="thumb-img" src={src} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />;
  return <span style={{ fontSize: size }}>{entry.isDir ? '📁' : (TYPE_EMOJI[entry.ext.toLowerCase()] ?? '📄')}</span>;
}
