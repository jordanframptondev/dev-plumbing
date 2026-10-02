import fs from 'node:fs/promises';
import { expandHome, FULL_PATH_MESSAGE, installDefaults, isFullPath, loadConfig, updateSettingsFile, writeInstallInfo, writeReadme, type InstallInfo, type Settings } from '@dev-plumbing/core';

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
  plugin: boolean;
  install: Omit<InstallInfo, 'installedAt'>;
  installPlugin: () => Promise<string>;
};

const MAX_ASKS = 3;

/** Asks for the projects folder until the answer is ~, ~/… or absolute. */
async function askProjectsFolder(o: SetupOptions, fallback: string): Promise<string> {
  for (let i = 0; i < MAX_ASKS; i++) {
    const answer = (await o.ask('Where should plumbing projects be stored?', fallback)).trim();
    if (isFullPath(answer)) return answer;
    o.log(FULL_PATH_MESSAGE);
  }
  throw new Error(`${FULL_PATH_MESSAGE} Run dev-plumbing setup again.`);
}

export async function runSetup(o: SetupOptions): Promise<{ settings: Settings; created: string[] }> {
  if (o.projectsFolder !== undefined && !isFullPath(o.projectsFolder.trim())) {
    throw new Error(`--projects-folder "${o.projectsFolder}": ${FULL_PATH_MESSAGE}`);
  }
  const { created } = await installDefaults({ configDir: o.configDir, defaultsDir: o.defaultsDir });
  const { settings: current } = await loadConfig(o.configDir);

  const projectsFolder = o.projectsFolder?.trim() ?? (o.yes ? current.projectsFolder : await askProjectsFolder(o, current.projectsFolder));

  let startAtLogin = current.startAtLogin;
  if (!o.loginItem) startAtLogin = false;
  else if (!o.yes) startAtLogin = !/^n/i.test(await o.ask('Start dev-plumbing when you log in? (y/n)', current.startAtLogin ? 'y' : 'n'));

  const settings = await updateSettingsFile(o.configDir, { projectsFolder, startAtLogin, ...(o.port ? { port: o.port } : {}) });
  await fs.mkdir(expandHome(projectsFolder, o.home), { recursive: true });
  await writeReadme(o.configDir);
  if (o.loginItem) await (settings.startAtLogin ? o.enableLogin() : o.disableLogin());
  await writeInstallInfo(o.configDir, { ...o.install, installedAt: new Date().toISOString() });
  o.log(`Config folder: ${o.configDir}${created.length ? ` (added ${created.length} files)` : ''}`);
  o.log(`Plumbing projects: ${projectsFolder}`);
  o.log(`Start at login: ${settings.startAtLogin ? 'on' : 'off'}`);
  if (o.plugin) {
    try {
      o.log(await o.installPlugin());
    } catch (e) {
      o.log(`The Claude Code plugin wasn't installed: ${(e as Error).message}`);
    }
  }

  return { settings, created };
}
