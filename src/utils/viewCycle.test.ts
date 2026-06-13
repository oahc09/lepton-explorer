import { describe, it, expect } from 'vitest';
import { cycleIconSize } from './viewCycle';

describe('cycleIconSize (Ctrl+wheel icon-size)', () => {
  it('scroll up grows the icon size', () => {
    expect(cycleIconSize('small', true)).toBe('medium');
    expect(cycleIconSize('medium', true)).toBe('large');
    expect(cycleIconSize('large', true)).toBe('extra-large');
  });

  it('scroll down shrinks the icon size', () => {
    expect(cycleIconSize('extra-large', false)).toBe('large');
    expect(cycleIconSize('large', false)).toBe('medium');
    expect(cycleIconSize('medium', false)).toBe('small');
  });

  it('clamps at the extremes', () => {
    expect(cycleIconSize('extra-large', true)).toBe('extra-large');
    expect(cycleIconSize('small', false)).toBe('small');
  });

  it('from a non-icon view, scrolling up enters "large" icons', () => {
    expect(cycleIconSize('details', true)).toBe('large');
    expect(cycleIconSize('list', true)).toBe('large');
    expect(cycleIconSize('tiles', true)).toBe('large');
  });

  it('from a non-icon view, scrolling down is a no-op', () => {
    expect(cycleIconSize('details', false)).toBe('details');
    expect(cycleIconSize('content', false)).toBe('content');
  });
});
