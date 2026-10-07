import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Writing defense.json fails while `failing.defense` is set, so a test can make recording an export fail.
const failing = vi.hoisted(() => ({ defense: false }));
vi.mock('../src/atomic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/atomic')>();
  const fails = (file: string) => failing.defense && file.endsWith(path.join('whiteboard', 'defense.json'));
  return {
    ...actual,
    writeFileAtomic: (file: string, data: string | Uint8Array, mode?: number) =>
      fails(file) ? Promise.reject(new Error('No space left on device')) : actual.writeFileAtomic(file, data, mode),
    writeJsonAtomic: (file: string, value: unknown) => (fails(file) ? Promise.reject(new Error('No space left on device')) : actual.writeJsonAtomic(file, value)),
  };
});

import { diagramMermaid } from '../src/finalExport';
import { repoProfileSchema, type DiagramData } from '../src/schemas';
import { exportDefense } from '../src/store/defenseExport';
import { defenseMarkdown } from '../src/store/defenseMarkdown';
import { ConflictError, InputError, writeItem } from '../src/store/io';
import { tildify } from '../src/store/open';
import { readDefense, writeDefense } from '../src/store/whiteboard';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';
import { makeRepo, pair, seedProject, storedDefense } from './fixtures';

afterAll(removeTempDirs);

const PLAN = 'docs/specs/restock.md';
const TARGET = 'docs/specs/restock.whiteboard-defense.md';
const profile = repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'] });
const T1 = new Date('2026-10-06T10:00:00.000Z');
const T2 = new Date('2026-10-06T11:00:00.000Z');

const git = (clone: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Acme', '-c', 'user.email=dev@acme.test', '-c', 'commit.gpgsign=false', ...args], { cwd: clone, encoding: 'utf8' });

/** A clone of acme with the plan, an earlier final and its mockups committed, and its plumbing project with a defense. */
async function setup(o: { remote?: string | null; plan?: string } = {}): Promise<{ dir: string; clone: string }> {
  const plan = o.plan ?? PLAN;
  const clone = makeRepo({ plan, remote: o.remote });
  const folder = path.join(clone, path.dirname(plan));
  await fs.writeFile(path.join(folder, 'restock.final.md'), '# Restock reminders\n\nThe final.\n');
  await fs.mkdir(path.join(folder, 'restock.assets'));
  await fs.writeFile(path.join(folder, 'restock.assets', 'ui-card.after.html'), '<p>Soon</p>\n');
  git(clone, 'add', '-A');
  git(clone, 'commit', '-q', '-m', 'The plan and its final');
  const dir = await seedProject({ project: { source: { path: plan, clone, branch: 'main', hashAtImport: 'x' } } });
  await writeDefense(dir, storedDefense());
  return { dir, clone };
}

/** Every file and folder under these folders (except .git), with each file's text and each link's target. */
async function snapshot(...roots: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.name === '.git') continue;
      if (entry.isSymbolicLink()) {
        out[p] = `link to ${await fs.readlink(p)}`;
      } else if (entry.isDirectory()) {
        out[p] = 'folder';
        await walk(p);
      } else {
        out[p] = await fs.readFile(p, 'utf8');
      }
    }
  };
  for (const root of new Set(roots)) await walk(root);
  return out;
}

const read = (...parts: string[]) => fs.readFile(path.join(...parts), 'utf8');
const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

describe('exporting the Whiteboard Defense', () => {
  it('export writes one file next to the plan and nothing else', async () => {
    const { dir, clone } = await setup();
    const before = await snapshot(clone);
    const defense = (await readDefense(dir))!;

    const result = await exportDefense({ dir, clone, profile, now: T1 });
    const exportedTo = { clone: tildify(clone), path: TARGET, at: T1.toISOString() };
    expect(result).toEqual({ exportedTo });
    expect(await read(clone, TARGET)).toBe(defenseMarkdown(defense, { title: 'Restock reminders' }));
    // The only change in the clone is the new file: the plan, the final and its mockups are as they were.
    expect(git(clone, 'status', '--porcelain')).toBe(`?? ${TARGET}\n`);
    expect(await snapshot(clone)).toEqual({ ...before, [path.join(clone, TARGET)]: await read(clone, TARGET) });
    // The defense records where it went, and is otherwise as it was.
    expect(await readDefense(dir)).toEqual({ ...defense, exportedTo });
  });

  it('puts the file at the top of the clone when the plan is there, and reads ~ with the home it is given', async () => {
    const { dir, clone } = await setup({ plan: 'restock.md' });
    const home = path.dirname(clone);
    const tilde = `~/${path.basename(clone)}`;
    const { exportedTo } = await exportDefense({ dir, clone: tilde, profile, home, now: T1 });
    expect(exportedTo).toEqual({ clone: tilde, path: 'restock.whiteboard-defense.md', at: T1.toISOString() });
    expect(await read(clone, 'restock.whiteboard-defense.md')).toMatch(/^# Whiteboard Defense: Restock reminders\n/);
  });

  it('draws the diagram that section 2 names as Mermaid, for a reader of the repo', async () => {
    const { dir, clone } = await setup();
    const DIAGRAM: DiagramData = {
      kind: 'system',
      groups: [],
      nodes: [
        { id: 'job', label: 'Reminder job', status: 'new' },
        { id: 'db', label: 'Postgres', status: 'unchanged' },
      ],
      edges: [{ id: 'e1', from: 'job', to: 'db', label: 'reads' }],
    };
    await writeItem(dir, { ...pair('architecture-system', { type: 'architecture', title: 'System view' }).item, data: DIAGRAM });
    const base = storedDefense();
    const defense = storedDefense({ sections: base.sections.map((s) => (s.id === 'diagram' ? { ...s, diagramItemId: 'architecture-system' } : s)) });
    await writeDefense(dir, defense);
    await exportDefense({ dir, clone, profile, now: T1 });
    const written = await read(clone, TARGET);
    const diagrams = { 'architecture-system': diagramMermaid(DIAGRAM) };
    expect(written).toBe(defenseMarkdown(defense, { title: 'Restock reminders', itemTitles: { 'architecture-system': 'System view' }, diagrams }));
    expect(written).toContain('Diagram: System view (in dev-plumbing).\n\n```mermaid\nflowchart LR\n');
  });

  it('overwrites an earlier export', async () => {
    const { dir, clone } = await setup();
    await exportDefense({ dir, clone, profile, now: T1 });
    const regenerated = storedDefense({ id: 'w-again', level: 3, generatedAt: T2.toISOString() });
    await writeDefense(dir, regenerated);
    const { exportedTo } = await exportDefense({ dir, clone, profile, now: T2 });
    expect(exportedTo.at).toBe(T2.toISOString());
    expect(await read(clone, TARGET)).toBe(defenseMarkdown(regenerated, { title: 'Restock reminders' }));
    expect(await read(clone, TARGET)).toContain('Level 3 (High risk).');
  });

  it('refuses anywhere but the plan folder of a clone of this repo, and with no defense, writing nothing', async () => {
    const outside = await fs.realpath(tempDir('dp-outside-'));
    await fs.writeFile(path.join(outside, 'notes.md'), 'Mine.\n');
    await fs.mkdir(path.join(outside, 'specs'));
    const specs = (clone: string) => path.join(clone, 'docs', 'specs');
    const cases: { name: string; remote?: string | null; target: (clone: string, dir: string) => Promise<string>; error: RegExp; kind?: typeof ConflictError }[] = [
      {
        name: 'a folder that is not a git clone',
        target: async () => {
          const plain = await fs.realpath(tempDir('dp-plain-'));
          await fs.mkdir(path.join(plain, 'docs', 'specs'), { recursive: true });
          return plain;
        },
        error: /isn't a git clone\. Copy into a clone of acme\./,
      },
      { name: 'a folder inside the clone', target: async (c) => path.join(c, 'docs'), error: /docs is a folder inside a clone\. Pick the clone itself\./ },
      {
        name: 'a plan folder that links outside the clone',
        target: async (c) => {
          await fs.rm(specs(c), { recursive: true });
          await fs.symlink(path.join(outside, 'specs'), specs(c));
          return c;
        },
        error: /^docs\/specs in .+ is or goes through a link\. Export writes only into real folders inside the clone\.$/,
      },
      {
        name: 'a target that is a link',
        target: async (c) => {
          await fs.symlink(path.join(outside, 'notes.md'), path.join(c, TARGET));
          return c;
        },
        error: /^docs\/specs\/restock\.whiteboard-defense\.md in .+ is a link\. Export won't write through it: remove the link, then export again\.$/,
      },
      { name: 'a clone of another repo', remote: 'git@github.com:acme/other.git', target: async (c) => c, error: /is a clone of github\.com\/acme\/other, not github\.com\/acme\/acme\./ },
      {
        name: 'no defense',
        target: async (c, dir) => {
          await fs.rm(path.join(dir, 'whiteboard'), { recursive: true });
          return c;
        },
        error: /^There's no Whiteboard Defense to export yet\.$/,
        kind: ConflictError,
      },
    ];
    for (const c of cases) {
      const { dir, clone } = await setup({ remote: c.remote });
      const target = await c.target(clone, dir);
      const before = await snapshot(dir, clone, target, outside);
      const error = await failure(exportDefense({ dir, clone: target, profile, now: T1 }));
      expect(error, c.name).toBeInstanceOf(c.kind ?? InputError);
      expect((error as Error).message, c.name).toMatch(c.error);
      // Nothing was written anywhere: not the project folder, the clone, or outside it.
      expect(await snapshot(dir, clone, target, outside), c.name).toEqual(before);
    }
  });

  it('puts the file back as it was when recording the export fails', async () => {
    const { dir, clone } = await setup();
    const defense = await read(dir, 'whiteboard', 'defense.json');
    failing.defense = true;
    try {
      // With no earlier export, the new file is removed again.
      const first = await failure(exportDefense({ dir, clone, profile, now: T1 }));
      expect(first).toBeInstanceOf(ConflictError);
      expect((first as Error).message).toMatch(/^Export didn't finish \(No space left on device\)\. docs\/specs\/restock\.whiteboard-defense\.md in .+ is as it was\. Try again\.$/);
      expect(await fs.lstat(path.join(clone, TARGET)).catch(() => null)).toBeNull();

      // With one, it's put back.
      await fs.writeFile(path.join(clone, TARGET), 'An earlier export.\n');
      expect(await failure(exportDefense({ dir, clone, profile, now: T2 }))).toBeInstanceOf(ConflictError);
      expect(await read(clone, TARGET)).toBe('An earlier export.\n');
    } finally {
      failing.defense = false;
    }
    expect(await read(dir, 'whiteboard', 'defense.json')).toBe(defense);
  });
});
