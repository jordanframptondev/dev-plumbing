import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '@dev-plumbing/core';
import { runSetup, type SetupOptions } from '../src/setup';

const DEFAULTS_DIR = path.resolve(import.meta.dirname, '../../../defaults');
let home: string;
let dir: string;
let calls: string[];

function options(over: Partial<SetupOptions> = {}): SetupOptions {
  return {
    configDir: dir,
    defaultsDir: DEFAULTS_DIR,
    home,
    loginItem: true,
    yes: true,
    ask: async (q, fallback) => {
      calls.push(`ask:${q}`);
      return fallback;
    },
    enableLogin: async () => {
      calls.push('enable');
    },
    disableLogin: async () => {
      calls.push('disable');
    },
    log: () => {},
    ...over,
  };
}

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-setup-'));
  dir = path.join(home, '.dev-plumbing');
  calls = [];
});

describe('setup', () => {
  it('creates the config, README and projects folder, and turns on the login item', async () => {
    const r = await runSetup(options());
    expect(r.created).toContain('settings.json');
    expect(await fs.readFile(path.join(dir, 'README.md'), 'utf8')).toMatch(/dev-plumbing configuration/);
    await fs.access(path.join(home, 'dev-plumbing-projects'));
    expect(calls).toEqual(['enable']);
  });

  it('stores the projects folder and port you pass, expanding ~', async () => {
    const r = await runSetup(options({ projectsFolder: '~/my projects', port: 45000 }));
    expect(r.settings.projectsFolder).toBe('~/my projects');
    expect(r.settings.port).toBe(45000);
    await fs.access(path.join(home, 'my projects'));
  });

  it('leaves the login item alone with --no-login-item', async () => {
    const r = await runSetup(options({ loginItem: false }));
    expect(r.settings.startAtLogin).toBe(false);
    expect(calls).toEqual([]);
  });

  it('asks when not told --yes', async () => {
    await runSetup(options({ yes: false }));
    expect(calls.filter((c) => c.startsWith('ask:'))).toHaveLength(2);
  });

  it('asks again when the projects folder answer is not a full path', async () => {
    const answers = ['dev-plumbing-projects', '~/plans'];
    const lines: string[] = [];
    const r = await runSetup(
      options({
        yes: false,
        ask: async (q, fallback) => {
          calls.push(`ask:${q}`);
          return q.startsWith('Where') ? (answers.shift() ?? fallback) : fallback;
        },
        log: (line) => lines.push(line),
      }),
    );
    expect(calls.filter((c) => c.startsWith('ask:Where'))).toHaveLength(2);
    expect(lines).toContain('Use a full path, like ~/dev-plumbing-projects.');
    expect(r.settings.projectsFolder).toBe('~/plans');
  });

  it('refuses a --projects-folder that is not a full path, before writing anything', async () => {
    await expect(runSetup(options({ projectsFolder: 'dev-plumbing-projects' }))).rejects.toThrow('Use a full path, like ~/dev-plumbing-projects.');
    await expect(fs.access(dir)).rejects.toThrow();
  });

  it('running setup twice keeps your edits', async () => {
    await runSetup(options());
    await fs.writeFile(path.join(dir, 'plumbing', 'ideas.md'), (await fs.readFile(path.join(dir, 'plumbing', 'ideas.md'), 'utf8')).replace('title: Ideas', 'title: My ideas'));
    const s = JSON.parse(await fs.readFile(path.join(dir, 'settings.json'), 'utf8'));
    await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ ...s, homePageSize: 33 }));
    await runSetup(options());
    const cfg = await loadConfig(dir);
    expect(cfg.types.find((t) => t.id === 'ideas')?.title).toBe('My ideas');
    expect(cfg.settings.homePageSize).toBe(33);
  });
});
