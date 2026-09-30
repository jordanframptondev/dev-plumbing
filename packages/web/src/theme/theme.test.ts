import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';

describe('theme', () => {
  it('uses the saved choice, or the system setting for "system"', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});
