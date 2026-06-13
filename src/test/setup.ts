import '@testing-library/jest-dom/vitest';

// jsdom does not implement document.elementFromPoint; provide a harmless
// stub so components (e.g. ContextMenu) that call it during effects don't
// throw under test.
if (typeof document !== 'undefined' && typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}
