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
    cli('setup', '--yes', '--no-login-item', '--no-start', '--no-plugin', '--projects-folder', path.join(tmp, 'projects'), '--port', String(E2E_PORT));
    const settingsFile = path.join(tmp, '.dev-plumbing', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    fs.writeFileSync(settingsFile, JSON.stringify({ ...settings, homePageSize: 2, theme: 'light', openBrowserOnImport: false }, null, 2));
    // A git clone for the Claude-loop tests, with a remote and a matching repo profile.
    const repo = path.join(tmp, 'acme-app');
    fs.mkdirSync(repo);
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/acme-app.git'], { cwd: repo });
    fs.mkdirSync(path.join(tmp, '.dev-plumbing', 'repos'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.dev-plumbing', 'repos', 'acme-app.json'), JSON.stringify({ name: 'acme-app', match: ['github.com/acme/acme-app'] }));
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
