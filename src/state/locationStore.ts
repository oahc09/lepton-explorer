import { create } from 'zustand';

export function parentOf(p: string): string {
  if (!p) return '';
  const norm = p.replace(/\//g, '\\').replace(/\\+$/, '');
  // Drive root like "C:\" normalises to "C:" after stripping trailing slashes; restore root form.
  if (/^[A-Za-z]:$/.test(norm)) return norm + '\\';
  const idx = norm.lastIndexOf('\\');
  if (idx <= 2) return norm.slice(0, 3); // drive root, e.g. "C:\\"
  return norm.slice(0, idx);
}

interface LocationState {
  path: string;
  backStack: string[];
  forwardStack: string[];
  navigate: (p: string) => void;
  back: () => boolean;
  forward: () => boolean;
  up: () => boolean;
  canBack: () => boolean;
  canForward: () => boolean;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  path: '',
  backStack: [],
  forwardStack: [],
  navigate: (p) =>
    set((s) => ({
      path: p,
      backStack: [...s.backStack, s.path],
      forwardStack: [],
    })),
  back: () => {
    const { backStack, forwardStack, path } = get();
    if (!backStack.length) return false;
    const prev = backStack[backStack.length - 1];
    set({
      path: prev,
      backStack: backStack.slice(0, -1),
      forwardStack: [path, ...forwardStack],
    });
    return true;
  },
  forward: () => {
    const { forwardStack, backStack, path } = get();
    if (!forwardStack.length) return false;
    const next = forwardStack[0];
    set({
      path: next,
      forwardStack: forwardStack.slice(1),
      backStack: [...backStack, path],
    });
    return true;
  },
  up: () => {
    const parent = parentOf(get().path);
    if (!parent || parent === get().path) return false;
    get().navigate(parent);
    return true;
  },
  canBack: () => get().backStack.length > 0,
  canForward: () => get().forwardStack.length > 0,
}));
