import { create } from 'zustand';

export function parentOf(p: string): string {
  if (!p) return '';
  // Virtual roots (network:/gallery:) have no parent.
  if (p === 'network:' || p === 'gallery:') return '';
  const norm = p.replace(/\//g, '\\').replace(/\\+$/, '');
  if (/^[A-Za-z]:$/.test(norm)) return norm + '\\';
  const idx = norm.lastIndexOf('\\');
  if (idx <= 2) return norm.slice(0, 3);
  return norm.slice(0, idx);
}

const titleOf = (p: string) => {
  if (p === 'network:') return '网络';
  if (p === 'gallery:') return 'Gallery';
  return p ? p.replace(/^.*[\\/]/, '') || p : '主页';
};

export interface Tab {
  id: string;
  title: string;
  path: string;
  backStack: string[];
  forwardStack: string[];
}

let seq = 0;
const makeTab = (path = ''): Tab => ({
  id: `t${++seq}`,
  title: titleOf(path),
  path,
  backStack: [],
  forwardStack: [],
});

interface LocationState {
  // active tab's current values (what existing components read):
  path: string;
  backStack: string[];
  forwardStack: string[];
  tabs: Tab[];
  activeId: string;
  navigate: (p: string) => void;
  back: () => boolean;
  forward: () => boolean;
  up: () => boolean;
  canBack: () => boolean;
  canForward: () => boolean;
  addTab: (path?: string) => string; // returns new tab id
  closeTab: (id: string) => boolean; // returns false if it was the last tab (caller should close window)
  setActive: (id: string) => void;
  moveTab: (fromId: string, toId: string) => void;
}

const initial = makeTab();
export const useLocationStore = create<LocationState>((set, get) => {
  const sync = (tabs: Tab[], activeId: string) => {
    const t = tabs.find((x) => x.id === activeId) ?? tabs[0];
    return {
      tabs,
      activeId: t.id,
      path: t.path,
      backStack: t.backStack,
      forwardStack: t.forwardStack,
    };
  };
  const patch = (fn: (t: Tab) => Tab) => {
    const { tabs, activeId } = get();
    return sync(
      tabs.map((t) => (t.id === activeId ? fn(t) : t)),
      activeId,
    );
  };
  const active = () => get().tabs.find((t) => t.id === get().activeId)!;
  return {
    path: '',
    backStack: [],
    forwardStack: [],
    tabs: [initial],
    activeId: initial.id,
    navigate: (p) =>
      set(
        patch((t) => ({
          ...t,
          path: p,
          backStack: [...t.backStack, t.path],
          forwardStack: [],
          title: titleOf(p),
        })),
      ),
    back: () => {
      const t = active();
      if (!t.backStack.length) return false;
      set(
        patch((tb) => {
          const prev = tb.backStack[tb.backStack.length - 1];
          return {
            ...tb,
            path: prev,
            backStack: tb.backStack.slice(0, -1),
            forwardStack: [tb.path, ...tb.forwardStack],
            title: titleOf(prev),
          };
        }),
      );
      return true;
    },
    forward: () => {
      const t = active();
      if (!t.forwardStack.length) return false;
      set(
        patch((tb) => {
          const nx = tb.forwardStack[0];
          return {
            ...tb,
            path: nx,
            forwardStack: tb.forwardStack.slice(1),
            backStack: [...tb.backStack, tb.path],
            title: titleOf(nx),
          };
        }),
      );
      return true;
    },
    up: () => {
      const parent = parentOf(get().path);
      if (!parent || parent === get().path) return false;
      get().navigate(parent);
      return true;
    },
    canBack: () => active().backStack.length > 0,
    canForward: () => active().forwardStack.length > 0,
    addTab: (path) => {
      const t = makeTab(path);
      set(sync([...get().tabs, t], t.id));
      return t.id;
    },
    closeTab: (id) => {
      const { tabs, activeId } = get();
      const idx = tabs.findIndex((t) => t.id === id);
      if (idx === -1) return true;
      const next = tabs.filter((t) => t.id !== id);
      if (next.length === 0) return false;
      const newActive =
        activeId === id ? next[Math.min(idx, next.length - 1)].id : activeId;
      set(sync(next, newActive));
      return true;
    },
    setActive: (id) => {
      if (get().tabs.some((t) => t.id === id)) set(sync(get().tabs, id));
    },
    moveTab: (fromId, toId) => {
      const { tabs, activeId } = get();
      const from = tabs.findIndex((t) => t.id === fromId);
      const to = tabs.findIndex((t) => t.id === toId);
      if (from === -1 || to === -1 || from === to) return;
      const next = [...tabs];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      set({ tabs: next, activeId }); // active tab unchanged → path/stacks stay valid
    },
  };
});
