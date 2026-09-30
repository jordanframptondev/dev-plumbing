import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cliPath, E2E_PORT, e2eEnv, marker, setE2eTmp } from './env';

export default function globalSetup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-e2e-'));
  setE2eTmp(tmp);
  const env = e2eEnv(tmp);
  const cli = (...args: string[]) => execFileSync(process.execPath, [cliPath, ...args], { env, stdio: 'inherit' });
  try {
    cli('setup', '--yes', '--no-login-item', '--no-start', '--projects-folder', path.join(tmp, 'projects'), '--port', String(E2E_PORT));
    const settingsFile = path.join(tmp, '.dev-plumbing', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    fs.writeFileSync(settingsFile, JSON.stringify({ ...settings, homePageSize: 2, theme: 'light' }, null, 2));
    cli('demo');
    cli('start');
  } catch (err) {
    // Playwright skips globalTeardown when setup throws, so clean up here.
    try {
      cli('stop');
    } catch {
      /* best effort */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
    throw err;
  }
}
