import { describe, expect, it, vi } from 'vitest';
import { applyTheme, resolveTheme } from './theme';

describe('theme', () => {
  it('uses the saved choice, or the system setting for "system"', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('stores the preference for the pre-paint script', () => {
    const mq = { matches: false, addEventListener() {}, removeEventListener() {} };
    vi.stubGlobal('matchMedia', () => mq);
    window.matchMedia = (() => mq) as unknown as typeof window.matchMedia;
    applyTheme('dark');
    expect(localStorage.getItem('dev-plumbing-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
