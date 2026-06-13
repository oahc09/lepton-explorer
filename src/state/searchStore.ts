import { create } from 'zustand';
import type { Entry } from '../types';

interface SearchState {
  query: string;
  results: Entry[] | null; // null = not searching
  setQuery: (q: string) => void;
  setResults: (r: Entry[] | null) => void;
  clear: () => void;
}
export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  results: null,
  setQuery: (q) => set({ query: q }),
  setResults: (r) => set({ results: r }),
  clear: () => set({ query: '', results: null }),
}));
