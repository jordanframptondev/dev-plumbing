import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';

// The writer fails on the calls a test names ("file#n", counting from 1), so a restore can be made to fail too.
const failing = vi.hoisted(() => ({ calls: new Set<string>(), counts: new Map<string, number>() }));
vi.mock('../src/atomic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/atomic')>();
  return {
    ...actual,
    writeFileAtomic: (file: string, data: string | Uint8Array, mode?: number) => {
      const n = (failing.counts.get(file) ?? 0) + 1;
      failing.counts.set(file, n);
      if (failing.calls.has(`${file}#${n}`)) return Promise.reject(new Error('No space left on device'));
      return actual.writeFileAtomic(file, data, mode);
    },
  };
});

import { repoProfileSchema, type PlumbingType } from '../src/schemas';
import { acceptFinal } from '../src/store/accept';
import { finalName, pickUpFinalize, requestFinalize, saveProposal } from '../src/store/finalize';
import { ConflictError, readProjectFile } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { listType, makeRepo, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const PLAN = 'docs/specs/restock.md';
const types: PlumbingType[] = [...TYPES, listType('ui', { title: 'UI changes', screen: 'mockups', order: 3 })];
const profile = repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'], apps: [] });
const T = new Date('2026-10-04T11:30:00.000Z');

async function names(dir: string, out: string[] = []): Promise<string[]> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    out.push(e.name);
    if (e.isDirectory()) await names(path.join(dir, e.name), out);
  }
  return out;
}

it('keeps the archived earlier final, leaves no temp file, and says what was not put back', async () => {
  const clone = makeRepo({ plan: PLAN });
  const dir = await seedProject({
    pairs: [pair('ui-card', { type: 'ui', title: 'Restock card', status: 'resolved' })],
    project: { source: { path: PLAN, clone, branch: 'main', hashAtImport: 'x' } },
  });
  const finalFile = path.join(dir, 'docs', 'final.md');
  await fs.writeFile(finalFile, 'The earlier final.\n');
  await requestFinalize(dir, { types, now: T });
  const request = await pickUpFinalize(dir, 'w-1', T);
  const { source } = await readProjectFile(dir);
  await saveProposal(dir, { requestId: request!.id, markdown: '# Restock reminders\n\nNo screens change.\n', types, name: finalName(source.path), now: T });

  // The copy into the clone fails (a full disk), and then so does putting docs/final.md back (its second write).
  const real = await fs.realpath(clone);
  failing.counts.clear();
  failing.calls = new Set([`${path.join(real, 'docs', 'specs', 'restock.final.md')}#1`, `${finalFile}#2`]);

  const error = await acceptFinal({ dir, clone, profile, types, now: T }).then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(ConflictError);
  const message = (error as Error).message;
  expect(message).not.toContain('was put back');
  expect(message).toContain('No space left on device');
  expect(message).toContain('docs/final.md');
  expect(message).toContain('The previous final is kept in finals/2026-10-04T11-30-00-000Z.md.');
  expect(message).toContain("The project isn't finalized.");

  // The earlier final survives in the archive, and no temp file is left in the clone or the project.
  expect(await fs.readFile(path.join(dir, 'finals', '2026-10-04T11-30-00-000Z.md'), 'utf8')).toBe('The earlier final.\n');
  expect((await names(clone)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  expect((await names(dir)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  expect((await readProjectFile(dir)).status).toBe('active');
});
