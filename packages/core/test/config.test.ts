import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { installDefaults, loadConfig, resetToDefault, updateSettingsFile } from '../src/config';
import { defaultSettings } from '../src/schemas';

const defaultsDir = path.resolve(import.meta.dirname, '../../../defaults');
let dir: string;
const write = (rel: string, text: string) => fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true }).then(() => fs.writeFile(path.join(dir, rel), text));
const read = (rel: string) => fs.readFile(path.join(dir, rel), 'utf8');

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-config-'));
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
    expect(c.types).toHaveLength(10);
    expect(c.settings).toEqual(defaultSettings);
    expect(c.outputs).toEqual(['finalize.md', 'whiteboard-defense.md']);
  });

  it('works on an empty folder', async () => {
    const c = await loadConfig(dir);
    expect(c.settings).toEqual(defaultSettings);
    expect(c.types).toEqual([]);
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

  it('skips a broken rules file but keeps the others', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    await write('plumbing/database.md', '---\nid: database\n---\nno screen');
    const c = await loadConfig(dir);
    expect(c.types.map((t) => t.id)).not.toContain('database');
    expect(c.types).toHaveLength(9);
    expect(c.problems).toEqual([expect.objectContaining({ file: 'plumbing/database.md' })]);
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
});
