export interface Entry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
  created: number;
  accessed: number;
  typeLabel: string;
  ext: string;
  isHidden: boolean;
  isSystem: boolean;
  isReadOnly: boolean;
}

export type ViewMode =
  | 'extra-large' | 'large' | 'medium' | 'small'
  | 'list' | 'details' | 'tiles' | 'content';

export type SortField = 'name' | 'modified' | 'type' | 'size';
export interface Sort { field: SortField; asc: boolean; }

export interface SpecialFolder { key: string; name: string; path: string; }
export interface Drive { letter: string; path: string; }
