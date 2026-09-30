import os from 'node:os';
import path from 'node:path';

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.DEV_PLUMBING_HOME ? path.resolve(env.DEV_PLUMBING_HOME) : path.join(os.homedir(), '.dev-plumbing');
}

export function expandHome(p: string, home: string = os.homedir()): string {
  if (p === '~') return home;
  if (p.startsWith('~/')) return path.join(home, p.slice(2));
  return path.resolve(p);
}
