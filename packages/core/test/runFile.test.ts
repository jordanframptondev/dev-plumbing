import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRunFile, removeRunFile, runFilePath, writeRunFile } from '../src/runFile';

describe('run file', () => {
  it('round-trips and is readable only by you', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-run-'));
    const info = { pid: 123, port: 4545, token: 't', startedAt: '2026-09-30T00:00:00Z', version: '0.1.0' };
    await writeRunFile(dir, info);
    expect(await readRunFile(dir)).toEqual(info);
    expect((await fs.stat(runFilePath(dir))).mode & 0o777).toBe(0o600);
  });

  it('only removes the file when the pid matches', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-run-'));
    await writeRunFile(dir, { pid: 1, port: 1, token: 't', startedAt: '', version: '' });
    await removeRunFile(dir, 2);
    expect(await readRunFile(dir)).not.toBeNull();
    await removeRunFile(dir, 1);
    expect(await readRunFile(dir)).toBeNull();
  });

  it('treats a garbled run file as missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-run-'));
    await fs.mkdir(path.join(dir, 'run'));
    await fs.writeFile(runFilePath(dir), 'nope');
    expect(await readRunFile(dir)).toBeNull();
  });
});
