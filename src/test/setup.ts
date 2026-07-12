import '@testing-library/jest-dom/vitest';

// jsdom does not implement document.elementFromPoint; provide a harmless
// stub so components (e.g. ContextMenu) that call it during effects don't
// throw under test.
if (typeof document !== 'undefined' && typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}

// jsdom does not implement ResizeObserver; provide a minimal mock so
// components (e.g. CommandBar) that use it for overflow measurement don't
// throw under test.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
