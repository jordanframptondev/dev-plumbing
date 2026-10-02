import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { installDefaults, readRunFile, updateSettingsFile, writeRunFile } from '@dev-plumbing/core';
import { startService, stopService } from '../src/control';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

const repo = path.resolve(import.meta.dirname, '../../..');
let dir: string;
let port: number;

/** A port nothing listens on, so every health check there fails. */
async function quietPort(): Promise<number> {
  const s = net.createServer().listen(0, '127.0.0.1');
  await once(s, 'listening');
  const p = (s.address() as net.AddressInfo).port;
  s.close();
  await once(s, 'close');
  return p;
}

beforeEach(async () => {
  const tmp = tempDir('dp-control-');
  dir = path.join(tmp, '.dev-plumbing');
  port = await quietPort();
  await installDefaults({ configDir: dir, defaultsDir: path.join(repo, 'defaults') });
  await updateSettingsFile(dir, { port, projectsFolder: path.join(tmp, 'projects'), startAtLogin: false });
});

describe('the run file', () => {
  it('stays when the health check fails but its service is still running', async () => {
    const run = { pid: process.pid, port, token: 'live', startedAt: '', version: '' };
    await writeRunFile(dir, run);
    await expect(startService({ configDir: dir, serviceEntry: path.join(dir, 'missing.js') })).rejects.toThrow(/isn't built/);
    expect(await readRunFile(dir)).toEqual(run);
    expect(await stopService(dir)).toBe('not-running');
    expect(await readRunFile(dir)).toEqual(run);
  });

  it('goes when its service is gone', async () => {
    await writeRunFile(dir, { pid: 999_999, port, token: 'old', startedAt: '', version: '' });
    expect(await stopService(dir)).toBe('not-running');
    expect(await readRunFile(dir)).toBeNull();
    await writeRunFile(dir, { pid: 999_999, port, token: 'old', startedAt: '', version: '' });
    await expect(startService({ configDir: dir, serviceEntry: path.join(dir, 'missing.js') })).rejects.toThrow(/isn't built/);
    expect(await readRunFile(dir)).toBeNull();
  });
});
