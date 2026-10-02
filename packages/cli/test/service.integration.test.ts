import { once } from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDefaults, readRunFile, updateSettingsFile, writeRunFile } from '@dev-plumbing/core';
import { serviceStatus, startService, stopService } from '../src/control';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

const repo = path.resolve(import.meta.dirname, '../../..');
const SERVICE = path.join(repo, 'packages/service/dist/index.js');
let tmp: string;
let dir: string;
let port: number;

async function freePort(): Promise<number> {
  const s = net.createServer().listen(0, '127.0.0.1');
  await once(s, 'listening');
  const p = (s.address() as net.AddressInfo).port;
  s.close();
  await once(s, 'close');
  return p;
}
const start = () => startService({ configDir: dir, serviceEntry: SERVICE, env: { HOME: tmp } });

beforeEach(async () => {
  tmp = tempDir('dp-int-');
  dir = path.join(tmp, '.dev-plumbing');
  port = await freePort();
  await installDefaults({ configDir: dir, defaultsDir: path.join(repo, 'defaults') });
  await updateSettingsFile(dir, { port, projectsFolder: path.join(tmp, 'projects'), startAtLogin: false });
});
afterEach(async () => {
  await stopService(dir).catch(() => {});
});

describe('service control', () => {
  it('starts, reports already running, and stops', async () => {
    expect((await start()).status).toBe('started');
    expect((await start()).status).toBe('already-running');
    expect((await serviceStatus(dir)).running).toBe(true);
    expect(await stopService(dir)).toBe('stopped');
    expect((await serviceStatus(dir)).running).toBe(false);
    expect(await readRunFile(dir)).toBeNull();
  });

  it('recovers from a stale run file left by a crash', async () => {
    await writeRunFile(dir, { pid: 999_999, port, token: 'old', startedAt: '', version: '' });
    expect((await start()).status).toBe('started');
  });

  it('explains when the port is taken by another program', async () => {
    const blocker = net.createServer().listen(port, '127.0.0.1');
    await once(blocker, 'listening');
    try {
      await expect(start()).rejects.toThrow(/already in use by another program/);
    } finally {
      blocker.close();
    }
  });

  it('protects the API with the run-file token', async () => {
    await start();
    const run = await readRunFile(dir);
    expect((await fetch(`http://127.0.0.1:${port}/api/config`, { headers: { 'x-dev-plumbing-token': run!.token } })).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${port}/api/config`)).status).toBe(401);
  });
});
