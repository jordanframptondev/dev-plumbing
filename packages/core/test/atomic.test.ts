import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { writeFileAtomic } from '../src/atomic';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

it('leaves no temp file behind when the write fails, and throws the original error', async () => {
  const dir = tempDir('dp-atomic-');
  // The target is a non-empty folder, so the rename fails after the temp file was written.
  await fs.mkdir(path.join(dir, 'target'));
  await fs.writeFile(path.join(dir, 'target', 'x'), 'x');
  await expect(writeFileAtomic(path.join(dir, 'target'), 'data')).rejects.toThrow();
  expect(await fs.readdir(dir)).toEqual(['target']);
});

it('writes the file when it works', async () => {
  const dir = tempDir('dp-atomic-');
  await writeFileAtomic(path.join(dir, 'a', 'b.txt'), 'hi');
  expect(await fs.readFile(path.join(dir, 'a', 'b.txt'), 'utf8')).toBe('hi');
  expect(await fs.readdir(path.join(dir, 'a'))).toEqual(['b.txt']);
});
