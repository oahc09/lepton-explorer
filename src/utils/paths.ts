// Split "C:\Users\caosh" into segments [{name:'C:',path:'C:\'},{name:'Users',path:'C:\Users'},...]
export function pathSegments(p: string): { name: string; path: string }[] {
  if (p === 'network:') return [{ name: '网络', path: 'network:' }];
  if (p === 'gallery:') return [{ name: 'Gallery', path: 'gallery:' }];
  if (!p) return [];
  const norm = p.replace(/\//g, '\\').replace(/\\+$/, '');
  const parts = norm.split('\\').filter(Boolean);
  const segs: { name: string; path: string }[] = [];
  let acc = '';
  parts.forEach((part, i) => {
    if (i === 0) {
      // Drive root: keep trailing separator ("C:\").
      acc = part + '\\';
    } else {
      // Strip any trailing backslash from acc, then add separator + part.
      acc = acc.replace(/\\+$/, '') + '\\' + part;
    }
    segs.push({ name: part, path: acc });
  });
  return segs;
}

export function joinPath(dir: string, name: string): string {
  const d = dir.replace(/[\\/]+$/, '');
  return d + '\\' + name;
}
