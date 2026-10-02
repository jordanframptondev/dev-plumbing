import { Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useLiveUpdates } from '../lib/useLiveUpdates';
import { useConfig } from '../lib/useConfig';
import { applyTheme } from '../theme/theme';

export function Root() {
  useLiveUpdates();
  const { data } = useConfig();
  const pref = data?.settings.theme;
  useEffect(() => (pref ? applyTheme(pref) : undefined), [pref]);
  return (
    <div className="min-h-screen bg-canvas font-sans text-ink">
      <Outlet />
    </div>
  );
}
