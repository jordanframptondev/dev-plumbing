import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gitHead } from '../src/git';
import type { PlanVersion } from '../src/schemas';
import { ConflictError, readProjectFile, writeProjectFile } from '../src/store/io';
import { openPlan } from '../src/store/open';
import { currentVersion, planHash, projectVersions, readVersionDoc, snapshotVersion, versionDocRel } from '../src/store/versions';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';
import { DRAFT, makeRepo, pair, seedProject } from './fixtures';

afterAll(removeTempDirs);

const V1: PlanVersion = { n: 1, at: '2026-10-01T09:00:00.000Z', hash: 'x', clone: '/tmp/acme', branch: 'main', commit: null };
const V2: PlanVersion = {
  n: 2,
  at: '2026-10-05T09:00:00.000Z',
  hash: 'y',
  clone: '~/Source/acme',
  branch: 'main',
  commit: '0123456789abcdef0123456789abcdef01234567',
  merge: { clean: 2, conflicts: 1 },
};

/** Every file under a folder, as bytes in base64, and every folder, by path relative to it. */
async function snapshot(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out[path.relative(root, p)] = 'folder';
        await walk(p);
      } else {
        out[path.relative(root, p)] = (await fs.readFile(p)).toString('base64');
      }
    }
  };
  await walk(root);
  return out;
}

const refusal = (p: Promise<unknown>) => p.then(() => null, (e: Error) => ({ type: e.constructor.name, message: e.message }));

describe('plan versions', () => {
  it('reads v1 from the source of a project that was never updated', async () => {
    const dir = await seedProject();
    const project = await readProjectFile(dir);
    expect(projectVersions(project)).toEqual([V1]);
    expect(currentVersion(project)).toEqual(V1);
    expect('merge' in currentVersion(project)).toBe(false);
  });

  it('loads a project.json from before versions', async () => {
    const dir = await seedProject();
    const file = path.join(dir, 'project.json');
    const { versions: _versions, ...old } = JSON.parse(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, JSON.stringify(old));
    const project = await readProjectFile(dir);
    expect(project.versions).toEqual([]);
    expect(project.reimporting).toBeUndefined();
    expect(currentVersion(project).n).toBe(1);
  });

  it('lists the versions oldest first, and the current one is the newest', async () => {
    const dir = await seedProject({ project: { versions: [V2, V1] } });
    const project = await readProjectFile(dir);
    expect(projectVersions(project)).toEqual([V1, V2]);
    expect(currentVersion(project)).toEqual(V2);
    expect(versionDocRel(2, 'draft')).toBe('docs/versions/v2/draft.md');
    expect(versionDocRel(1, 'original')).toBe('docs/versions/v1/original.md');
    expect(versionDocRel(2, 'merged')).toBe('docs/versions/v2/merged.md');
  });

  it('snapshots the plan and the draft byte for byte, and writes nothing else', async () => {
    const draft = 'Remind customers – before it runs out.\r\nNo newline at the end';
    const dir = await seedProject({ draft });
    await fs.writeFile(path.join(dir, 'docs', 'original.md'), DRAFT);
    const before = await snapshot(dir);
    expect(await snapshotVersion(dir, 1)).toEqual(['docs/versions/v1/original.md', 'docs/versions/v1/draft.md']);
    expect(await fs.readFile(path.join(dir, 'docs', 'versions', 'v1', 'original.md'))).toEqual(await fs.readFile(path.join(dir, 'docs', 'original.md')));
    expect(await fs.readFile(path.join(dir, 'docs', 'versions', 'v1', 'draft.md'))).toEqual(Buffer.from(draft));
    const after = await snapshot(dir);
    expect(Object.keys(after).filter((k) => !(k in before)).sort()).toEqual([
      path.join('docs', 'versions'),
      path.join('docs', 'versions', 'v1'),
      path.join('docs', 'versions', 'v1', 'draft.md'),
      path.join('docs', 'versions', 'v1', 'original.md'),
    ]);
    for (const [k, v] of Object.entries(before)) expect(after[k], k).toBe(v);
  });

  it('keeps a copy of the items too, so what the threads settled is kept', async () => {
    const dir = await seedProject({ pairs: [pair('q1'), pair('q2', { title: 'Who gets reminders?' })] });
    expect(await snapshotVersion(dir, 1)).toEqual([
      'docs/versions/v1/original.md',
      'docs/versions/v1/draft.md',
      'docs/versions/v1/items/q1.json',
      'docs/versions/v1/items/q2.json',
    ]);
    for (const id of ['q1', 'q2']) {
      expect(await fs.readFile(path.join(dir, 'docs', 'versions', 'v1', 'items', `${id}.json`))).toEqual(await fs.readFile(path.join(dir, 'items', `${id}.json`)));
    }
  });

  it('never overwrites a snapshot, but writes beside an update\'s merged draft', async () => {
    const dir = await seedProject();
    await snapshotVersion(dir, 1);
    await fs.writeFile(path.join(dir, 'docs', 'draft.md'), 'A newer draft.\n');
    const before = await snapshot(dir);
    expect(await refusal(snapshotVersion(dir, 1))).toEqual({ type: 'ConflictError', message: 'Version 1 is already saved in docs/versions/v1.' });
    expect(await snapshot(dir)).toEqual(before);
    await expect(snapshotVersion(dir, 1)).rejects.toBeInstanceOf(ConflictError);
    // v2's folder already holds the draft as its update merged it, and the next update's journal.
    await fs.mkdir(path.join(dir, 'docs', 'versions', 'v2'));
    await fs.writeFile(path.join(dir, 'docs', 'versions', 'v2', 'merged.md'), 'As merged.\n');
    await fs.writeFile(path.join(dir, 'docs', 'versions', 'v2', 'update.json'), '{}');
    expect(await snapshotVersion(dir, 2)).toEqual(['docs/versions/v2/original.md', 'docs/versions/v2/draft.md']);
    expect(await fs.readFile(path.join(dir, 'docs', 'versions', 'v2', 'merged.md'), 'utf8')).toBe('As merged.\n');
  });

  it('takes back what it wrote when a copy fails', async () => {
    const dir = await seedProject();
    await fs.rm(path.join(dir, 'docs', 'draft.md'));
    const before = await snapshot(dir);
    await expect(snapshotVersion(dir, 1)).rejects.toThrow(/ENOENT/);
    expect(await snapshot(dir)).toEqual(before);
  });

  it("reads the current version's working files, an older version's snapshot, and nothing for a version it doesn't have", async () => {
    const dir = await seedProject();
    await snapshotVersion(dir, 1);
    await fs.writeFile(path.join(dir, 'docs', 'original.md'), '# Restock reminders\n\nThe repo, v2.\n');
    await fs.writeFile(path.join(dir, 'docs', 'draft.md'), '# Restock reminders\n\nThe draft, v2.\n');
    await fs.mkdir(path.join(dir, 'docs', 'versions', 'v2'));
    await fs.writeFile(path.join(dir, 'docs', 'versions', 'v2', 'merged.md'), '# Restock reminders\n\nAs the update merged it.\n');
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), versions: [V1, V2] });
    const project = await readProjectFile(dir);
    expect(await readVersionDoc(dir, project, 2, 'original')).toBe('# Restock reminders\n\nThe repo, v2.\n');
    expect(await readVersionDoc(dir, project, 2, 'draft')).toBe('# Restock reminders\n\nThe draft, v2.\n');
    expect(await readVersionDoc(dir, project, 1, 'original')).toBe(DRAFT);
    expect(await readVersionDoc(dir, project, 1, 'draft')).toBe(DRAFT);
    // What the update to v2 left in the draft, kept in v2's own folder. v1 is the import, so it has none.
    expect(await readVersionDoc(dir, project, 2, 'merged')).toBe('# Restock reminders\n\nAs the update merged it.\n');
    expect(await readVersionDoc(dir, project, 1, 'merged')).toBeNull();
    expect(await readVersionDoc(dir, project, 3, 'draft')).toBeNull();
    expect(await readVersionDoc(dir, project, 0, 'draft')).toBeNull();
    await fs.rm(path.join(dir, 'docs', 'versions', 'v1', 'draft.md'));
    expect(await readVersionDoc(dir, project, 1, 'draft')).toBeNull();
  });

  it('hashes a plan with sha256, as the import always has', async () => {
    expect(planHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const folder = path.join(tempDir('dp-open-'), 'acme');
    const opened = await openPlan({ folder, repo: 'acme', clone: '/c', branch: 'main', plan: { rel: 'docs/specs/restock.md', text: DRAFT }, enabledTypes: [] });
    const project = await readProjectFile(opened.dir);
    expect(project.source.hashAtImport).toBe(planHash(DRAFT));
    expect(project.versions).toEqual([]);
    expect(currentVersion(project).hash).toBe(planHash(DRAFT));
  });
});

describe('the commit a version came from', () => {
  it("is the clone's HEAD, and null before the first commit or outside a clone", async () => {
    const repo = makeRepo();
    expect(await gitHead(repo)).toBeNull();
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Acme', '-c', 'user.email=dev@acme.test', '-c', 'commit.gpgsign=false', ...args], { cwd: repo }).toString().trim();
    git('add', '-A');
    git('commit', '-q', '-m', 'Add the plan');
    const head = git('rev-parse', 'HEAD');
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    expect(await gitHead(repo)).toBe(head);
    expect(await gitHead(path.join(repo, 'docs'))).toBe(head);
    expect(await gitHead(tempDir('dp-not-a-repo-'))).toBeNull();
  });
});
