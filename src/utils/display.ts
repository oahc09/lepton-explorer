import type { Entry } from '../types';

export function displayName(item: Entry, showExtensions: boolean): string {
  if (showExtensions || !item.ext) return item.name;
  return item.name.slice(0, item.name.length - item.ext.length - 1);
}
