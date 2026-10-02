import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { installDefaults, loadConfig } from '../src/config';
import { writeDemoProjects } from '../src/demo';
import { defaultSettings, repoProfileSchema } from '../src/schemas';
import {
  discoverProjects,
  findProjects,
  listProjectSummaries,
  loadProjectHome,
  loadTypeItems,
  readProjectDocument,
  summarizeProject,
  type ProjectRef,
} from '../src/store/projects';
import { IMPORT_DID_NOT_FINISH } from '../src/store/importItems';
import { listType, seedProject, TYPES } from './fixtures';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

const NOW = new Date('2026-09-30T12:00:00Z');
const defaultsDir = path.resolve(import.meta.dirname, '../../../defaults');
let root: string;
const settings = () => ({ ...defaultSettings, projectsFolder: root });
const ref = (repo: string, id: string): ProjectRef => ({ repo, id, dir: path.join(root, repo, id) });

async function defaultTypes() {
  const dir = tempDir('dp-types-');
  await installDefaults({ configDir: dir, defaultsDir });
  return (await loadConfig(dir)).types;
}

beforeEach(async () => {
  root = tempDir('dp-projects-');
  await writeDemoProjects(root, NOW);
});

describe('project store', () => {
  it('finds the demo projects', async () => {
    const refs = await findProjects(settings(), []);
    expect(refs.map((r) => `${r.repo}/${r.id}`).sort()).toEqual([
      'acme/onboarding-emails',
      'acme/restock-reminders',
      'beta/checkout-redesign',
    ]);
  });

  it('does not overwrite a demo project that already exists', async () => {
    expect(await writeDemoProjects(root, NOW)).toEqual([]);
  });

  it('counts threads per status', async () => {
    const s = await summarizeProject(ref('acme', 'restock-reminders'));
    expect(s.title).toBe('Restock reminders');
    expect(s.counts).toEqual({ yourTurn: 2, drafts: 1, withClaude: 1, resolved: 1, parked: 1, total: 6 });
  });

  it('lists needs-you first, then most recent, with paging and tabs', async () => {
    const refs = await findProjects(settings(), []);
    const active = await listProjectSummaries(refs, { limit: 10 });
    expect(active.items.map((s) => s.id)).toEqual(['restock-reminders', 'checkout-redesign']);
    const all = await listProjectSummaries(refs, { tab: 'all', limit: 2 });
    expect(all.total).toBe(3);
    expect(all.items).toHaveLength(2);
    const finalized = await listProjectSummaries(refs, { tab: 'finalized', limit: 10 });
    expect(finalized.items.map((s) => s.id)).toEqual(['onboarding-emails']);
  });

  it('searches title, id, repo and source path', async () => {
    const refs = await findProjects(settings(), []);
    const q = async (text: string) => (await listProjectSummaries(refs, { q: text, tab: 'all', limit: 10 })).items.map((s) => s.id);
    expect(await q('ONBOARD')).toEqual(['onboarding-emails']);
    expect(await q('beta')).toEqual(['checkout-redesign']);
    expect(await q('specs/restock')).toEqual(['restock-reminders']);
  });

  it('lists a broken project with the reason instead of failing', async () => {
    const dir = path.join(root, 'beta', 'half-made');
    await fs.mkdir(path.join(dir, 'threads'), { recursive: true });
    await fs.writeFile(path.join(dir, 'project.json'), '{bad');
    await fs.writeFile(path.join(dir, 'threads', 'x.json'), '{');
    const refs = await findProjects(settings(), []);
    const all = await listProjectSummaries(refs, { tab: 'all', limit: 10 });
    const broken = all.items.find((s) => s.id === 'half-made');
    expect(broken?.status).toBe('broken');
    expect(broken?.error).toMatch(/project.json isn't valid JSON/);
    expect(broken?.error).toMatch(/1 thread file couldn't be read/);
    expect(all.total).toBe(4);
  });

  it('ignores folders that are not projects', async () => {
    await fs.mkdir(path.join(root, 'acme', 'notes'), { recursive: true });
    expect(await findProjects(settings(), [])).toHaveLength(3);
  });

  it('handles ~ and spaces in the projects folder', async () => {
    const home = tempDir('dp-home-');
    await writeDemoProjects(path.join(home, 'my projects'), NOW);
    const refs = await findProjects({ ...defaultSettings, projectsFolder: '~/my projects' }, [], home);
    expect(refs).toHaveLength(3);
  });

  it('uses a repo profile folder and lists each project once', async () => {
    const profile = repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'], projectsFolder: path.join(root, 'acme') });
    const refs = await findProjects(settings(), [profile]);
    expect(refs.filter((r) => r.id === 'restock-reminders')).toHaveLength(1);
    expect(refs).toHaveLength(3);
  });

  it('builds the project home model', async () => {
    const home = await loadProjectHome(ref('acme', 'restock-reminders'), await defaultTypes());
    expect(home.types).toHaveLength(10);
    expect(home.types.find((t) => t.id === 'security')?.noChanges?.reason).toMatch(/permissions/);
    expect(home.types.find((t) => t.id === 'flows')?.noChanges?.reason).toBe('No items were found for this plumbing type.');
    expect(home.types.find((t) => t.id === 'questions')).toMatchObject({ itemCount: 2, yourTurn: 1, resolved: 1, noChanges: null });
    expect(home.inbox.map((e) => e.status).sort()).toEqual(['draft', 'parked', 'resolved', 'with_claude', 'your_turn', 'your_turn']);
    expect(home.inbox.find((e) => e.itemTitle === 'Who gets reminders at launch?')?.blocking).toBe(true);
    expect(home.documents).toEqual({ original: true, draft: true, final: false });
  });

  it('lists the items of one plumbing type', async () => {
    const r = await loadTypeItems(ref('acme', 'restock-reminders'), await defaultTypes(), 'questions');
    expect(r?.items.map((i) => [i.title, i.status])).toEqual([
      ['Which channels?', 'resolved'],
      ['Who gets reminders at launch?', 'your_turn'],
    ]);
    expect(await loadTypeItems(ref('acme', 'restock-reminders'), await defaultTypes(), 'nope')).toBeNull();
  });

  it('reads documents and refuses paths outside the project', async () => {
    const r = ref('acme', 'restock-reminders');
    expect(await readProjectDocument(r, 'original')).toMatch(/^# Restock reminders/);
    expect(await readProjectDocument(r, 'final')).toBeNull();
    const pj = JSON.parse(await fs.readFile(path.join(r.dir, 'project.json'), 'utf8'));
    pj.docs.draft = '../../outside.md';
    await fs.writeFile(path.join(r.dir, 'project.json'), JSON.stringify(pj));
    await expect(readProjectDocument(r, 'draft')).rejects.toThrow(/outside the project/);
  });

  it('counts corrupt item files without rejecting the project', async () => {
    const dir = path.join(root, 'beta', 'item-corrupt');
    await fs.mkdir(path.join(dir, 'items'), { recursive: true });
    await fs.writeFile(path.join(dir, 'items', 'bad.json'), '{broken');
    await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify({
      id: 'item-corrupt', repo: 'beta', title: 'Item Corrupt', status: 'active',
      source: { path: 'test', clone: 'test', branch: 'test', hashAtImport: 'test' },
      docs: { original: 'test', draft: 'test' }, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    }));
    const refs = await findProjects(settings(), []);
    const all = await listProjectSummaries(refs, { tab: 'all', limit: 10 });
    const broken = all.items.find((s) => s.id === 'item-corrupt');
    expect(broken?.error).toMatch(/1 item file couldn't be read/);
    expect(all.total).toBe(4);
  });

  it('skips repo folders that are regular files', async () => {
    await fs.writeFile(path.join(root, 'broken-repo'), 'not a folder');
    const refs = await findProjects(settings(), []);
    expect(refs.map((r) => `${r.repo}/${r.id}`).sort()).toEqual([
      'acme/onboarding-emails',
      'acme/restock-reminders',
      'beta/checkout-redesign',
    ]);
  });

  it('handles threads path that is a regular file', async () => {
    const dir = path.join(root, 'beta', 'file-threads');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'threads'), 'not a folder');
    await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify({
      id: 'file-threads', repo: 'beta', title: 'File Threads', status: 'active',
      source: { path: 'test', clone: 'test', branch: 'test', hashAtImport: 'test' },
      docs: { original: 'test', draft: 'test' }, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    }));
    const s = await summarizeProject(ref('beta', 'file-threads'));
    expect(s.error).toMatch(/thread file couldn't be read/);
    expect(s.status).toBe('active');
  });

  it("marks types whose importer didn't finish, and timeline types", async () => {
    const dir = await seedProject({ project: { emptyTypes: [{ type: 'questions', reason: IMPORT_DID_NOT_FINISH }, { type: 'concerns', reason: 'No concerns in this plan.' }] } });
    const types = [...TYPES, listType('phases', { title: 'Phases & milestones', order: 8, timeline: true })];
    const home = await loadProjectHome({ repo: 'acme', id: 'restock', dir }, types);
    const entry = (id: string) => home.types.find((t) => t.id === id);
    expect(entry('questions')).toMatchObject({ importFailed: true, timeline: false, noChanges: { reason: IMPORT_DID_NOT_FINISH } });
    expect(entry('concerns')).toMatchObject({ importFailed: false, noChanges: { reason: 'No concerns in this plan.' } });
    expect(entry('architecture')).toMatchObject({ importFailed: false, noChanges: { reason: 'No items were found for this plumbing type.' } });
    expect(entry('phases')).toMatchObject({ timeline: true, importFailed: false });
  });
});

describe('discoverProjects', () => {
  it("says when a repo profile's projects folder doesn't exist", async () => {
    const profile = repoProfileSchema.parse({ name: 'ghost', match: ['github.com/acme/ghost'], projectsFolder: path.join(root, 'nowhere') });
    const { refs, problems } = await discoverProjects(settings(), [profile]);
    expect(refs).toHaveLength(3);
    expect(problems).toEqual([{ folder: path.join(root, 'nowhere'), message: expect.stringMatching(/repo profile "ghost".*doesn't exist/) }]);
  });

  it("stays quiet when the main projects folder doesn't exist yet", async () => {
    const { refs, problems } = await discoverProjects({ ...defaultSettings, projectsFolder: path.join(root, 'not-yet') }, []);
    expect(refs).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("says when the main projects folder can't be read", async () => {
    await fs.chmod(root, 0o000);
    try {
      const { problems } = await discoverProjects(settings(), []);
      expect(problems[0]?.message).toMatch(/can't be read/);
    } finally {
      await fs.chmod(root, 0o700);
    }
  });

  it('finds projects and repo folders reached through symlinks', async () => {
    const elsewhere = tempDir('dp-linked-');
    await writeDemoProjects(elsewhere, NOW);
    await fs.mkdir(path.join(root, 'linked'), { recursive: true });
    await fs.symlink(path.join(elsewhere, 'acme', 'restock-reminders'), path.join(root, 'linked', 'restock-copy'));
    await fs.symlink(path.join(elsewhere, 'beta'), path.join(root, 'beta-link'));
    const { refs } = await discoverProjects(settings(), []);
    const ids = refs.map((r) => `${r.repo}/${r.id}`);
    expect(ids).toContain('linked/restock-copy');
    expect(ids).toContain('beta-link/checkout-redesign');
  });
});
