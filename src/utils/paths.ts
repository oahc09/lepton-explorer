// Split "C:\Users\caosh" into segments [{name:'C:',path:'C:\'},{name:'Users',path:'C:\Users'},...]
export function pathSegments(p: string): { name: string; path: string }[] {
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
      // acc already ends with a backslash, so append the part directly.
      acc = acc + part;
    }
    segs.push({ name: part, path: acc });
  });
  return segs;
}
