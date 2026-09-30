import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic } from './atomic';

export const LOGIN_ITEM_LABEL = 'dev.plumbing.service';
export type LoginItemOptions = { nodePath: string; cliPath: string; configDir: string; home?: string };

export const loginItemPath = (home: string = os.homedir()) => path.join(home, 'Library', 'LaunchAgents', `${LOGIN_ITEM_LABEL}.plist`);

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildPlist(o: Omit<LoginItemOptions, 'home'>): string {
  const log = xml(path.join(o.configDir, 'run', 'login.log'));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LOGIN_ITEM_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(o.nodePath)}</string>
    <string>${xml(o.cliPath)}</string>
    <string>start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DEV_PLUMBING_HOME</key>
    <string>${xml(o.configDir)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>AbandonProcessGroup</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${log}</string>
  <key>StandardErrorPath</key>
  <string>${log}</string>
</dict>
</plist>
`;
}

export async function enableLoginItem(o: LoginItemOptions): Promise<string> {
  const file = loginItemPath(o.home);
  // The plist logs to <configDir>/run/login.log. launchd won't start the job if that folder is missing.
  await fs.mkdir(path.join(o.configDir, 'run'), { recursive: true });
  await writeFileAtomic(file, buildPlist(o));
  return file;
}

export async function disableLoginItem(home?: string): Promise<boolean> {
  try {
    await fs.unlink(loginItemPath(home));
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}

export const isLoginItemEnabled = (home?: string) => fs.access(loginItemPath(home)).then(() => true, () => false);
