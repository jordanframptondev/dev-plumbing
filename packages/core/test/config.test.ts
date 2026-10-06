import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { installDefaults, loadConfig, resetToDefault, updateSettingsFile } from '../src/config';
import { importableTypes, PLAN_CHANGES_TYPE } from '../src/planChanges';
import { defaultSettings } from '../src/schemas';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

const defaultsDir = path.resolve(import.meta.dirname, '../../../defaults');
let dir: string;
const write = (rel: string, text: string) => fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true }).then(() => fs.writeFile(path.join(dir, rel), text));
const read = (rel: string) => fs.readFile(path.join(dir, rel), 'utf8');

beforeEach(async () => {
  dir = tempDir('dp-config-');
});

describe('config folder', () => {
  it('installs every default file into an empty folder', async () => {
    const r = await installDefaults({ configDir: dir, defaultsDir });
    expect(r.created).toContain('settings.json');
    expect(r.created).toContain(path.join('plumbing', 'database.md'));
    expect(r.created).toContain(path.join('outputs', 'whiteboard-defense.md'));
    expect(r.kept).toEqual([]);
  });

  it('never overwrites a file you edited (setup run twice)', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    await write('plumbing/database.md', 'MY EDIT');
    const r = await installDefaults({ configDir: dir, defaultsDir });
    expect(r.created).toEqual([]);
    expect(await read('plumbing/database.md')).toBe('MY EDIT');
  });

  it('loads the defaults with no problems', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    const c = await loadConfig(dir);
    expect(c.problems).toEqual([]);
    // The ten rules files, and the built-in Plan changes type first.
    expect(c.types).toHaveLength(11);
    expect(c.types[0]).toEqual(PLAN_CHANGES_TYPE);
    expect(importableTypes(c.types)).toHaveLength(10);
    expect(c.settings).toEqual(defaultSettings);
    expect(c.outputs).toEqual(['finalize.md', 'whiteboard-defense.md']);
  });

  it('works on an empty folder', async () => {
    const c = await loadConfig(dir);
    expect(c.settings).toEqual(defaultSettings);
    expect(c.types).toEqual([PLAN_CHANGES_TYPE]);
    expect(c.problems).toEqual([]);
  });

  it('keeps working when settings.json is not valid JSON', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    await write('settings.json', '{ "port": ');
    const c = await loadConfig(dir);
    expect(c.settings).toEqual(defaultSettings);
    expect(c.problems).toHaveLength(1);
    expect(c.problems[0].file).toBe('settings.json');
    expect(c.problems[0].message).toMatch(/isn't valid JSON/);
  });

  it('explains a bad value and the default it uses instead', async () => {
    await write('settings.json', JSON.stringify({ port: 80, colour: 'red' }));
    const c = await loadConfig(dir);
    expect(c.settings.port).toBe(4545);
    expect(c.problems).toEqual([
      { file: 'settings.json', key: 'port', message: 'Number must be greater than or equal to 1024. Using the default (4545).' },
      { file: 'settings.json', key: 'colour', message: 'Unknown setting. It is ignored.' },
    ]);
  });

  it('falls back to the default projects folder when a hand-edited one is relative', async () => {
    await write('settings.json', JSON.stringify({ ...defaultSettings, projectsFolder: 'dev-plumbing-projects' }));
    const c = await loadConfig(dir);
    expect(c.settings.projectsFolder).toBe('~/dev-plumbing-projects');
    expect(c.problems).toEqual([
      { file: 'settings.json', key: 'projectsFolder', message: 'Use a full path, like ~/dev-plumbing-projects. Using the default ("~/dev-plumbing-projects").' },
    ]);
  });

  it('skips a broken rules file but keeps the others', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    await write('plumbing/database.md', '---\nid: database\n---\nno screen');
    const c = await loadConfig(dir);
    expect(c.types.map((t) => t.id)).not.toContain('database');
    expect(importableTypes(c.types)).toHaveLength(9);
    expect(c.problems).toEqual([expect.objectContaining({ file: 'plumbing/database.md' })]);
  });

  it('lists a rules file with JavaScript front matter as a problem, without running it', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    const marker = path.join(dir, 'ran');
    await write('plumbing/database.md', `---js\n{ id: (require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran'), 'database'), title: 'x', order: 1, screen: 'list' }\n---\nbody`);
    const c = await loadConfig(dir);
    expect(c.types.map((t) => t.id)).not.toContain('database');
    expect(c.problems).toEqual([{ file: 'plumbing/database.md', message: expect.stringMatching(/JavaScript front matter is not allowed/) }]);
    await expect(fs.access(marker)).rejects.toThrow();
  });

  it('adds the built-in Plan changes type, which a rules file of yours replaces', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    const c = await loadConfig(dir);
    expect(c.types.filter((t) => t.builtIn)).toEqual([PLAN_CHANGES_TYPE]);
    expect(PLAN_CHANGES_TYPE).toMatchObject({
      id: 'plan-changes',
      title: 'Plan changes',
      order: 0,
      screen: 'list',
      emptyMessage: "Nothing in the repo's new version conflicts with your draft.",
      fields: [],
      answerPresets: ['Keep my draft', "Take the repo's version"],
      timeline: false,
      enabled: true,
      builtIn: true,
      file: '',
    });
    expect(Object.keys(PLAN_CHANGES_TYPE.sections)).toEqual(['What to look for', 'Rules', 'Done when']);
    expect(PLAN_CHANGES_TYPE.sections.Rules).toContain('When the thread has no message from the person yet, reply with three options, each with a `change`');
    expect(PLAN_CHANGES_TYPE.sections.Rules).toContain('`keep`, "Keep my draft": `change: { md: [] }`.');
    expect(importableTypes(c.types).map((t) => t.id)).not.toContain('plan-changes');
    // Yours wins, and no rules file is built in, whatever its header says.
    await write('plumbing/plan-changes.md', '---\nid: plan-changes\ntitle: Repo changes\norder: 12\nscreen: list\nemptyMessage: None.\nbuiltIn: true\n---\n\n## Rules\n- Keep it short.\n');
    await write('plumbing/rollout.md', '---\nid: rollout\ntitle: Rollout\norder: 11\nscreen: list\nemptyMessage: None.\nbuiltIn: true\n---\n\n## Rules\n- Say who flips the flag.\n');
    const mine = await loadConfig(dir);
    expect(mine.problems).toEqual([]);
    expect(mine.types.filter((t) => t.id === 'plan-changes')).toEqual([expect.objectContaining({ title: 'Repo changes', file: 'plan-changes.md', builtIn: false })]);
    expect(mine.types.filter((t) => t.builtIn)).toEqual([]);
    expect(importableTypes(mine.types).map((t) => t.id)).toContain('rollout');
  });

  it('never imports Plan changes, even from a rules file of yours', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    await write('plumbing/plan-changes.md', '---\nid: plan-changes\ntitle: Repo changes\norder: 12\nscreen: list\nemptyMessage: None.\n---\n\n## Rules\n- Keep it short.\n');
    const c = await loadConfig(dir);
    expect(c.types.find((t) => t.id === 'plan-changes')).toMatchObject({ title: 'Repo changes', enabled: true, builtIn: false });
    expect(importableTypes(c.types).map((t) => t.id)).not.toContain('plan-changes');
    expect(importableTypes(c.types)).toHaveLength(10);
  });

  it('reads repo profiles and reports broken or duplicate ones', async () => {
    await write('repos/acme.json', JSON.stringify({ name: 'acme', match: ['github.com/acme/acme'] }));
    await write('repos/copy.json', JSON.stringify({ name: 'acme', match: ['github.com/acme/other'] }));
    await write('repos/bad.json', JSON.stringify({ name: 'bad', match: [] }));
    const c = await loadConfig(dir);
    expect(c.repos.map((r) => r.name)).toEqual(['acme']);
    expect(c.problems.map((p) => p.file).sort()).toEqual(['repos/bad.json', 'repos/copy.json']);
  });

  it('resets one file to its default and refuses paths outside the folder', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    await write('plumbing/ideas.md', 'EDIT');
    await resetToDefault({ configDir: dir, defaultsDir, file: 'plumbing/ideas.md' });
    expect(await read('plumbing/ideas.md')).toMatch(/^---\nid: ideas/);
    await expect(resetToDefault({ configDir: dir, defaultsDir, file: '../etc/passwd' })).rejects.toThrow(/outside/);
    await expect(resetToDefault({ configDir: dir, defaultsDir, file: 'plumbing/mine.md' })).rejects.toThrow(/no default/);
  });

  it('updates settings without losing other values', async () => {
    await write('settings.json', JSON.stringify({ ...defaultSettings, homePageSize: 25 }));
    const s = await updateSettingsFile(dir, { projectsFolder: '~/x' });
    expect(s.homePageSize).toBe(25);
    expect(JSON.parse(await read('settings.json')).projectsFolder).toBe('~/x');
  });

  it('resetToDefault restores content and never clobbers on installDefaults', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    const original = await read('plumbing/ideas.md');
    await write('plumbing/ideas.md', 'CHANGED');
    expect(await read('plumbing/ideas.md')).toBe('CHANGED');
    await resetToDefault({ configDir: dir, defaultsDir, file: 'plumbing/ideas.md' });
    expect(await read('plumbing/ideas.md')).toBe(original);
    // Run installDefaults again—it must not overwrite the just-reset file
    const r = await installDefaults({ configDir: dir, defaultsDir });
    expect(r.kept).toContain('plumbing/ideas.md');
    expect(await read('plumbing/ideas.md')).toBe(original);
  });

  it('loadConfig does not reject when settings.json is a directory', async () => {
    await fs.mkdir(path.join(dir, 'settings.json'));
    const c = await loadConfig(dir);
    expect(c.settings).toEqual(defaultSettings);
    expect(c.problems).toEqual([expect.objectContaining({ file: 'settings.json', message: expect.stringMatching(/couldn't be read/) })]);
  });

  it('loadConfig does not reject when plumbing is a regular file', async () => {
    await write('plumbing', 'not a folder');
    const c = await loadConfig(dir);
    expect(c.types).toEqual([PLAN_CHANGES_TYPE]);
    expect(c.problems).toEqual([expect.objectContaining({ file: 'plumbing', message: expect.stringMatching(/couldn't be read/) })]);
  });

  it('updateSettingsFile throws on broken JSON and leaves file unchanged', async () => {
    const broken = '{ "port": ';
    await write('settings.json', broken);
    await expect(updateSettingsFile(dir, { homePageSize: 25 })).rejects.toThrow(/isn't valid JSON/);
    expect(await read('settings.json')).toBe(broken);
  });

  it('updateSettingsFile keeps unknown keys such as _comment and is not blocked by them', async () => {
    await write('settings.json', JSON.stringify({ _comment: 'mine', ...defaultSettings, homePageSize: 25, extra: { note: 'x' } }));
    const s = await updateSettingsFile(dir, { projectsFolder: '~/x' });
    expect(s.projectsFolder).toBe('~/x');
    const saved = JSON.parse(await read('settings.json'));
    expect(saved).toEqual({ _comment: 'mine', ...defaultSettings, homePageSize: 25, projectsFolder: '~/x', extra: { note: 'x' } });
    expect(Object.keys(saved)[0]).toBe('_comment');
  });

  it('updateSettingsFile throws on invalid values and leaves file unchanged', async () => {
    const invalid = JSON.stringify({ port: 80 });
    await write('settings.json', invalid);
    await expect(updateSettingsFile(dir, { homePageSize: 25 })).rejects.toThrow(/problems.*port.*greater than or equal to 1024/);
    expect(await read('settings.json')).toBe(invalid);
  });
});
