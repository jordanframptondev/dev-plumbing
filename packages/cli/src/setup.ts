import fs from 'node:fs/promises';
import { expandHome, installDefaults, loadConfig, updateSettingsFile, writeReadme, type Settings } from '@dev-plumbing/core';

export type SetupOptions = {
  configDir: string;
  defaultsDir: string;
  home?: string;
  projectsFolder?: string;
  port?: number;
  loginItem: boolean;
  yes: boolean;
  ask: (question: string, fallback: string) => Promise<string>;
  enableLogin: () => Promise<void>;
  disableLogin: () => Promise<void>;
  log: (line: string) => void;
};

export async function runSetup(o: SetupOptions): Promise<{ settings: Settings; created: string[] }> {
  const { created } = await installDefaults({ configDir: o.configDir, defaultsDir: o.defaultsDir });
  const { settings: current } = await loadConfig(o.configDir);

  const projectsFolder = o.projectsFolder ?? (o.yes ? current.projectsFolder : await o.ask('Where should plumbing projects be stored?', current.projectsFolder));

  let startAtLogin = current.startAtLogin;
  if (!o.loginItem) startAtLogin = false;
  else if (!o.yes) startAtLogin = !/^n/i.test(await o.ask('Start dev-plumbing when you log in? (y/n)', current.startAtLogin ? 'y' : 'n'));

  const settings = await updateSettingsFile(o.configDir, { projectsFolder, startAtLogin, ...(o.port ? { port: o.port } : {}) });
  await fs.mkdir(expandHome(projectsFolder, o.home), { recursive: true });
  await writeReadme(o.configDir);
  if (o.loginItem) await (settings.startAtLogin ? o.enableLogin() : o.disableLogin());

  o.log(`Config folder: ${o.configDir}${created.length ? ` (added ${created.length} files)` : ''}`);
  o.log(`Plumbing projects: ${projectsFolder}`);
  o.log(`Start at login: ${settings.startAtLogin ? 'on' : 'off'}`);
  return { settings, created };
}
