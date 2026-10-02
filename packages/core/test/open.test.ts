import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gitInfo, NotAGitRepoError } from '../src/git';
import { defaultSettings, repoProfileSchema } from '../src/schemas';
import { readProjectFile } from '../src/store/io';
import { linkIntoClone, matchProfile, openPlan, PlanError, repoProjectsFolder, resolvePlan, slugify, suggestRepoName } from '../src/store/open';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';
import { DRAFT, makeRepo } from './fixtures';

afterAll(removeTempDirs);

const acme = repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'] });

describe('git and repo profiles', () => {
  it('reads the clone root, remote and branch from anywhere inside the clone', async () => {
    const repo = makeRepo();
    const info = await gitInfo(path.join(repo, 'docs', 'specs'));
    expect(info).toEqual({ root: repo, remote: 'git@github.com:acme/acme.git', branch: 'main', excludeFile: path.join(repo, '.git', 'info', 'exclude') });
  });

  it('explains a folder that is not a git repo', async () => {
    await expect(gitInfo(tempDir('dp-nogit-'))).rejects.toThrow(NotAGitRepoError);
  });

  it('matches a profile whatever form the remote takes', () => {
    expect(matchProfile('git@github.com:acme/acme.git', [acme])?.name).toBe('acme');
    expect(matchProfile('https://github.com/Acme/acme', [acme])?.name).toBe('acme');
    expect(matchProfile('git@github.com:acme/other.git', [acme])).toBeUndefined();
    expect(matchProfile(null, [acme])).toBeUndefined();
  });

  it('suggests a profile name from the remote, or the folder', () => {
    expect(suggestRepoName('git@github.com:acme/acme-app.git', '/x/y')).toBe('acme-app');
    expect(suggestRepoName(null, '/Users/a/Source/My App')).toBe('my-app');
  });

  it("puts a repo's projects in its profile folder, or under the main folder", () => {
    const settings = { ...defaultSettings, projectsFolder: '/p' };
    expect(repoProjectsFolder(settings, acme)).toBe('/p/acme');
    expect(repoProjectsFolder(settings, { ...acme, projectsFolder: '~/shared' }, '/Users/a')).toBe('/Users/a/shared');
  });

  it('slugifies plan names', () => {
    expect(slugify('Restock Reminders (v2)')).toBe('restock-reminders-v2');
    expect(slugify('Café ünd Co')).toBe('cafe-und-co');
    expect(slugify('???')).toBe('plan');
  });
});

describe('opening a plan', () => {
  it('resolves the plan relative to where you are, inside the clone only', async () => {
    const repo = makeRepo();
    const r = await resolvePlan({ root: repo, cwd: path.join(repo, 'docs'), plan: 'specs/restock-reminders.md' });
    expect(r).toEqual({ rel: 'docs/specs/restock-reminders.md', text: DRAFT });
    await expect(resolvePlan({ root: repo, cwd: repo, plan: '../elsewhere.md' })).rejects.toThrow(/inside the repo/);
    await expect(resolvePlan({ root: repo, cwd: repo, plan: 'docs/specs/missing.md' })).rejects.toThrow(/no plan at docs\/specs\/missing.md/);
    await fs.writeFile(path.join(repo, 'notes.txt'), 'x');
    await expect(resolvePlan({ root: repo, cwd: repo, plan: 'notes.txt' })).rejects.toThrow(PlanError);
  });

  it('finds the plan when the window reached the clone through a symlink', async () => {
    const repo = makeRepo();
    const link = path.join(tempDir('dp-link-'), 'acme');
    await fs.symlink(repo, link);
    expect((await resolvePlan({ root: repo, cwd: link, plan: 'docs/specs/restock-reminders.md' })).rel).toBe('docs/specs/restock-reminders.md');
  });

  it('creates a plumbing project with an untouched original and a draft', async () => {
    const folder = path.join(tempDir('dp-open-'), 'acme');
    const now = new Date('2026-10-01T09:00:00Z');
    const r = await openPlan({ folder, repo: 'acme', clone: '/Users/a/Source/acme', branch: 'main', plan: { rel: 'docs/specs/restock-reminders.md', text: DRAFT }, enabledTypes: ['architecture', 'questions'], home: '/Users/a', now });
    expect(r).toEqual({ id: 'restock-reminders', dir: path.join(folder, 'restock-reminders'), created: true });
    expect(await fs.readFile(path.join(r.dir, 'docs', 'original.md'), 'utf8')).toBe(DRAFT);
    expect(await fs.readFile(path.join(r.dir, 'docs', 'draft.md'), 'utf8')).toBe(DRAFT);
    const project = await readProjectFile(r.dir);
    expect(project).toMatchObject({
      title: 'Restock reminders',
      status: 'importing',
      importPending: ['architecture', 'questions'],
      source: { path: 'docs/specs/restock-reminders.md', clone: '~/Source/acme', branch: 'main' },
    });
    expect(project.source.hashAtImport).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reopens the same plan, and keeps a different plan with the same name apart', async () => {
    const folder = path.join(tempDir('dp-open-'), 'acme');
    const open = (rel: string) => openPlan({ folder, repo: 'acme', clone: '/c', branch: 'main', plan: { rel, text: DRAFT }, enabledTypes: [] });
    expect((await open('docs/specs/restock-reminders.md')).created).toBe(true);
    expect(await open('docs/specs/restock-reminders.md')).toMatchObject({ id: 'restock-reminders', created: false });
    expect(await open('docs/old/restock-reminders.md')).toMatchObject({ id: 'restock-reminders-2', created: true });
  });

  it('links the projects folder into the clone and hides it from git', async () => {
    const repo = makeRepo();
    const folder = tempDir('dp-shared-');
    const info = await gitInfo(repo);
    const o = { clone: repo, excludeFile: info.excludeFile, folder, linkName: 'dev-plumbing' };
    expect(await linkIntoClone(o)).toBe('created');
    expect(await linkIntoClone(o)).toBe('exists');
    expect(await fs.realpath(path.join(repo, 'dev-plumbing'))).toBe(await fs.realpath(folder));
    const exclude = await fs.readFile(info.excludeFile, 'utf8');
    expect(exclude.split('\n').filter((l) => l === '/dev-plumbing')).toHaveLength(1);
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' })).not.toMatch(/dev-plumbing/);
  });

  it("never replaces a real file or folder that has the link's name", async () => {
    const repo = makeRepo();
    await fs.mkdir(path.join(repo, 'dev-plumbing'));
    const info = await gitInfo(repo);
    expect(await linkIntoClone({ clone: repo, excludeFile: info.excludeFile, folder: tempDir('dp-shared-'), linkName: 'dev-plumbing' })).toBe('blocked');
  });

  it('refuses a link name that is not a single folder name, and creates nothing outside the clone', async () => {
    const parent = tempDir('dp-parent-');
    const repo = makeRepo();
    const info = await gitInfo(repo);
    const folder = tempDir('dp-shared-');
    for (const linkName of ['../x', 'a/b', '..', '/abs']) {
      expect(repoProfileSchema.safeParse({ name: 'acme', match: ['github.com/acme/acme'], linkIntoClones: { enabled: true, linkName } }).success).toBe(false);
      expect(await linkIntoClone({ clone: repo, excludeFile: info.excludeFile, folder, linkName })).toBe('blocked');
    }
    expect(await fs.readdir(parent)).toEqual([]);
    expect(await fs.lstat(path.join(path.dirname(repo), 'x')).catch(() => null)).toBeNull();
    expect(repoProfileSchema.safeParse({ name: 'acme', match: ['github.com/acme/acme'], linkIntoClones: { enabled: true, linkName: 'dev-plumbing' } }).success).toBe(true);
  });
});
