import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPlist, disableLoginItem, enableLoginItem, isLoginItemEnabled, loginItemPath } from '../src/loginItem';

describe('login item', () => {
  it('builds a LaunchAgent that runs `dev-plumbing start` at login', () => {
    const plist = buildPlist({ nodePath: '/usr/local/bin/node', cliPath: '/a & b/cli.js', configDir: '/Users/x/.dev-plumbing' });
    expect(plist).toContain('<string>dev.plumbing.service</string>');
    expect(plist).toContain('<string>/a &amp; b/cli.js</string>');
    expect(plist).toContain('<string>start</string>');
    expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>');
    expect(plist).toContain('<key>AbandonProcessGroup</key>');
  });

  it('writes and removes the plist in the given home', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-login-'));
    const file = await enableLoginItem({ nodePath: '/n', cliPath: '/c', configDir: path.join(home, 'config'), home });
    expect(file).toBe(loginItemPath(home));
    expect(await isLoginItemEnabled(home)).toBe(true);
    expect(await disableLoginItem(home)).toBe(true);
    expect(await isLoginItemEnabled(home)).toBe(false);
    expect(await disableLoginItem(home)).toBe(false);
  });

  it('creates the run folder the plist logs to, so launchd can start the job', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-login-'));
    const configDir = path.join(home, 'fresh-config');
    await enableLoginItem({ nodePath: '/n', cliPath: '/c', configDir, home });
    expect((await fs.stat(path.join(configDir, 'run'))).isDirectory()).toBe(true);
  });
});
