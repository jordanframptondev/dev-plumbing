import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readInstallInfo, readRunFile, removeRunFile, runFilePath, writeInstallInfo, writeRunFile } from '../src/runFile';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

describe('run file', () => {
  it('round-trips and is readable only by you', async () => {
    const dir = tempDir('dp-run-');
    const info = { pid: 123, port: 4545, token: 't', startedAt: '2026-09-30T00:00:00Z', version: '0.1.0' };
    await writeRunFile(dir, info);
    expect(await readRunFile(dir)).toEqual(info);
    expect((await fs.stat(runFilePath(dir))).mode & 0o777).toBe(0o600);
  });

  it('only removes the file when the pid matches', async () => {
    const dir = tempDir('dp-run-');
    await writeRunFile(dir, { pid: 1, port: 1, token: 't', startedAt: '', version: '' });
    await removeRunFile(dir, 2);
    expect(await readRunFile(dir)).not.toBeNull();
    await removeRunFile(dir, 1);
    expect(await readRunFile(dir)).toBeNull();
  });

  it('treats a garbled run file as missing', async () => {
    const dir = tempDir('dp-run-');
    await fs.mkdir(path.join(dir, 'run'));
    await fs.writeFile(runFilePath(dir), 'nope');
    expect(await readRunFile(dir)).toBeNull();
  });

  it('records where Node and the CLI are, for the plugin to find', async () => {
    const dir = tempDir('dp-run-');
    const info = { nodePath: '/opt/node/bin/node', cliPath: '/repo/packages/cli/dist/index.js', repoRoot: '/repo', version: '0.1.0', installedAt: '2026-10-01T09:00:00.000Z' };
    await writeInstallInfo(dir, info);
    expect(await readInstallInfo(dir)).toEqual(info);
    expect(await fs.readFile(path.join(dir, 'run', 'node'), 'utf8')).toBe('/opt/node/bin/node\n');
    expect(await readInstallInfo(tempDir('dp-run-'))).toBeNull();
  });
});
