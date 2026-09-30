export type ThemePreference = 'light' | 'dark' | 'system';

export function resolveTheme(pref: ThemePreference, prefersDark: boolean): 'light' | 'dark' {
  return pref === 'system' ? (prefersDark ? 'dark' : 'light') : pref;
}

/** Sets <html data-theme>. For "system" it follows OS changes until the returned function is called. */
export function applyTheme(pref: ThemePreference): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const set = () => {
    document.documentElement.dataset.theme = resolveTheme(pref, mq.matches);
  };
  set();
  if (pref !== 'system') return () => {};
  mq.addEventListener('change', set);
  return () => mq.removeEventListener('change', set);
}
