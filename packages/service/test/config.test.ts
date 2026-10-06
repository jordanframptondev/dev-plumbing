import fs from 'node:fs/promises';
import path from 'node:path';
import { disableLoginItem, enableLoginItem, isLoginItemEnabled, loginItemPath } from '@dev-plumbing/core';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import { call, makeContext, removeTempDirs } from './helpers';

afterAll(removeTempDirs);

const put = (body: unknown) => ({ method: 'PUT', body: JSON.stringify(body) });
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

describe('config API', () => {
  it('returns settings, agents, types and problems', async () => {
    const { ctx } = await makeContext();
    const body = (await (await call(createApp(ctx), '/api/config')).json()) as Record<string, unknown>;
    expect((body.settings as Record<string, unknown>).port).toBe(4545);
    expect((body.agents as Record<string, unknown>).maxParallel).toBe(4);
    expect(body.types).toHaveLength(10);
    expect((body.types as unknown[])[0]).toEqual({ file: 'architecture.md', id: 'architecture', title: 'Architecture', order: 1, screen: 'diagram', enabled: true });
    expect(body.problems).toEqual([]);
  });

  it('saves valid settings, and refuses invalid ones without writing', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const current = (await (await call(app, '/api/config')).json() as Record<string, unknown>).settings as Record<string, unknown>;
    const ok = await call(app, '/api/settings', put({ ...current, homePageSize: 5 }));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as Record<string, unknown>).restartRequired).toBe(false);
    const bad = await call(app, '/api/settings', put({ ...current, port: 80 }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { errors: { key: string }[] }).errors[0]).toMatchObject({ key: 'port' });
    const saved = JSON.parse(await fs.readFile(path.join(ctx.configDir, 'settings.json'), 'utf8'));
    expect(saved.homePageSize).toBe(5);
    expect(saved.port).toBe(4545);
  });

  it('turns the login item off and on, and flags a port change', async () => {
    const { ctx, login } = await makeContext();
    const app = createApp(ctx);
    const current = (await (await call(app, '/api/config')).json() as Record<string, unknown>).settings as Record<string, unknown>;
    await call(app, '/api/settings', put({ ...current, startAtLogin: false }));
    await call(app, '/api/settings', put({ ...current, startAtLogin: true }));
    expect(login).toEqual(['disable', 'enable']);
    expect((await (await call(app, '/api/settings', put({ ...current, port: 5050 }))).json() as Record<string, unknown>).restartRequired).toBe(true);
  });

  it('saves agents and repo profiles, with validation', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    expect((await call(app, '/api/agents', put({ maxParallel: 2 }))).status).toBe(200);
    expect((await call(app, '/api/agents', put({ maxParallel: 99 }))).status).toBe(400);
    const profile = { name: 'acme', match: ['github.com/acme/acme'] };
    expect((await call(app, '/api/repos/acme', put(profile))).status).toBe(200);
    expect((await call(app, '/api/repos/acme', put({ ...profile, match: [] }))).status).toBe(400);
    const renamed = await call(app, '/api/repos/acme', put({ ...profile, name: 'other' }));
    expect(((await renamed.json()) as Record<string, unknown>).error).toMatch(/must stay "acme"/);
  });

  it('saves a repo profile under the repos lock, so it never lands inside a Detect again merge', async () => {
    const { ctx } = await makeContext();
    const rt = createRuntime();
    const app = createApp(ctx, rt);
    const file = path.join(ctx.configDir, 'repos', 'acme.json');
    let release = () => {};
    const merging = rt.withLock('config:repos', () => new Promise<void>((resolve) => (release = resolve)));
    const saving = call(app, '/api/repos/acme', put({ name: 'acme', match: ['github.com/acme/acme'] }));
    await new Promise((r) => setTimeout(r, 50));
    expect(await fs.access(file).then(() => true, () => false)).toBe(false);
    release();
    await merging;
    expect((await saving).status).toBe(200);
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toMatchObject({ name: 'acme' });
  });

  it('reads and saves a rules file, and refuses a broken header', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const ruleBody = (await (await call(app, '/api/rules/ideas.md')).json()) as Record<string, unknown>;
    const text = ruleBody.text as string;
    const hasDefault = ruleBody.hasDefault as boolean;
    expect(hasDefault).toBe(true);
    const bad = await call(app, '/api/rules/ideas.md', put({ text: 'no header' }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as Record<string, unknown>).error).toMatch(/Header field/);
    expect((await call(app, '/api/rules/ideas.md', put({ text: text.replace('title: Ideas', 'title: Ideas and wishes') }))).status).toBe(200);
    const configBody = (await (await call(app, '/api/config')).json()) as Record<string, unknown>;
    const types = configBody.types as Array<{ id: string; title: string }>;
    expect(types.find((t) => t.id === 'ideas')?.title).toBe('Ideas and wishes');
  });

  it('leaves the built-in Plan changes type out of the rules and settings lists', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const ids = async (route: string) => ((await (await call(app, route)).json()) as { types: { id: string }[] }).types.map((t) => t.id);
    expect(await ids('/api/rules')).toHaveLength(10);
    expect(await ids('/api/rules')).not.toContain('plan-changes');
    expect(await ids('/api/config')).not.toContain('plan-changes');
    expect((await call(app, '/api/rules/plan-changes.md')).status).toBe(404);
  });

  it('lists rules files that are broken on disk', async () => {
    const { ctx } = await makeContext();
    await fs.writeFile(path.join(ctx.configDir, 'plumbing', 'ideas.md'), 'broken');
    const body = (await (await call(createApp(ctx), '/api/rules')).json()) as Record<string, unknown>;
    expect((body.types as unknown[]).length).toBe(9);
    expect(body.broken).toEqual([{ file: 'ideas.md', error: expect.stringMatching(/Header field/) }]);
    expect(body.outputs).toEqual(['finalize.md', 'whiteboard-defense.md']);
  });

  it('creates a new plumbing type once', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const res = await call(app, '/api/rules', post({ id: 'rollout', title: 'Rollout' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ file: 'rollout.md' });
    expect((await call(app, '/api/rules', post({ id: 'rollout', title: 'Rollout' }))).status).toBe(409);
    expect((await call(app, '/api/rules', post({ id: 'Bad Id', title: 'x' }))).status).toBe(400);
    const configBody = (await (await call(app, '/api/config')).json()) as Record<string, unknown>;
    const types = configBody.types as Array<{ id: string; order: number }>;
    expect(types.at(-1)).toMatchObject({ id: 'rollout', order: 11 });
  });

  it('edits output rules and resets files to their defaults', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    expect((await call(app, '/api/outputs/finalize.md', put({ text: '# Mine' }))).status).toBe(200);
    expect(((await (await call(app, '/api/outputs/finalize.md')).json()) as Record<string, unknown>).text).toBe('# Mine');
    expect((await call(app, '/api/reset', post({ file: 'outputs/finalize.md' }))).status).toBe(200);
    expect(((await (await call(app, '/api/outputs/finalize.md')).json()) as Record<string, unknown>).text as string).toMatch(/Finalize spec rules/);
    expect((await call(app, '/api/reset', post({ file: '../../etc/passwd' }))).status).toBe(400);
  });
});

describe('JSON bodies', () => {
  const routes: [string, string][] = [
    ['PUT', '/api/settings'],
    ['PUT', '/api/agents'],
    ['PUT', '/api/repos/acme'],
    ['POST', '/api/rules'],
    ['PUT', '/api/rules/ideas.md'],
    ['PUT', '/api/outputs/finalize.md'],
    ['POST', '/api/reset'],
    ['POST', '/api/open'],
  ];
  const bodies = ['null', '[]', '"x"', '{ not json', ''];

  it('refuses anything that is not a JSON object on every JSON route, and writes nothing', async () => {
    const { ctx, opened, login } = await makeContext();
    const app = createApp(ctx);
    const settingsBefore = await fs.readFile(path.join(ctx.configDir, 'settings.json'));
    const agentsBefore = await fs.readFile(path.join(ctx.configDir, 'agents.json'));
    for (const [method, route] of routes) {
      for (const body of bodies) {
        const res = await call(app, route, { method, body });
        expect({ route, body, status: res.status }).toEqual({ route, body, status: 400 });
        expect(await res.json()).toEqual({ error: 'Expected a JSON object.' });
      }
    }
    expect(await fs.readFile(path.join(ctx.configDir, 'settings.json'))).toEqual(settingsBefore);
    expect(await fs.readFile(path.join(ctx.configDir, 'agents.json'))).toEqual(agentsBefore);
    expect(opened).toEqual([]);
    expect(login).toEqual([]);
  });
});

describe('settings and agents PUT merge onto the file', () => {
  const settingsFile = (dir: string) => path.join(dir, 'settings.json');

  it('a partial settings PUT keeps every other field, including unknown keys', async () => {
    const { ctx, root } = await makeContext();
    const before = JSON.parse(await fs.readFile(settingsFile(ctx.configDir), 'utf8'));
    await fs.writeFile(settingsFile(ctx.configDir), JSON.stringify({ _comment: 'mine', ...before, port: 5051 }, null, 2));
    const res = await call(createApp(ctx), '/api/settings', put({ theme: 'light' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { value: Record<string, unknown>; restartRequired: boolean };
    expect(body.value).toMatchObject({ theme: 'light', port: 5051, projectsFolder: root });
    expect(body.restartRequired).toBe(false);
    const saved = JSON.parse(await fs.readFile(settingsFile(ctx.configDir), 'utf8'));
    expect(saved).toEqual({ _comment: 'mine', ...before, port: 5051, theme: 'light' });
  });

  it('keeps a broken untouched field broken, and still lists it as a problem', async () => {
    const { ctx } = await makeContext();
    const before = JSON.parse(await fs.readFile(settingsFile(ctx.configDir), 'utf8'));
    await fs.writeFile(settingsFile(ctx.configDir), JSON.stringify({ ...before, homePageSize: 'lots' }));
    const app = createApp(ctx);
    expect((await call(app, '/api/settings', put({ theme: 'dark' }))).status).toBe(200);
    expect(JSON.parse(await fs.readFile(settingsFile(ctx.configDir), 'utf8')).homePageSize).toBe('lots');
    const cfg = (await (await call(app, '/api/config')).json()) as { problems: { key?: string }[] };
    expect(cfg.problems.map((p) => p.key)).toEqual(['homePageSize']);
  });

  it('an empty object is a no-op that leaves the file as it is', async () => {
    const { ctx } = await makeContext();
    const text = '{"theme":"dark","_comment":"mine","port":4545}';
    await fs.writeFile(settingsFile(ctx.configDir), text);
    const res = await call(createApp(ctx), '/api/settings', put({}));
    expect(res.status).toBe(200);
    expect(await fs.readFile(settingsFile(ctx.configDir), 'utf8')).toBe(text);
  });

  it('refuses an unknown key and writes nothing', async () => {
    const { ctx } = await makeContext();
    const before = await fs.readFile(settingsFile(ctx.configDir), 'utf8');
    const res = await call(createApp(ctx), '/api/settings', put({ theme: 'light', colour: 'red' }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { errors: { key: string }[] }).errors).toEqual([{ key: 'colour', message: 'Unknown setting', unknown: true }]);
    expect(await fs.readFile(settingsFile(ctx.configDir), 'utf8')).toBe(before);
  });

  it('refuses an invalid value and names the field', async () => {
    const { ctx } = await makeContext();
    const before = await fs.readFile(settingsFile(ctx.configDir), 'utf8');
    const res = await call(createApp(ctx), '/api/settings', put({ homePageSize: 0 }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { errors: { key: string }[] }).errors[0].key).toBe('homePageSize');
    const rel = await call(createApp(ctx), '/api/settings', put({ projectsFolder: 'dev-plumbing-projects' }));
    expect(rel.status).toBe(400);
    expect(((await rel.json()) as { errors: { key: string; message: string }[] }).errors[0]).toEqual({ key: 'projectsFolder', message: 'Use a full path, like ~/dev-plumbing-projects.' });
    expect(await fs.readFile(settingsFile(ctx.configDir), 'utf8')).toBe(before);
  });

  it('a partial agents PUT keeps the other agent settings', async () => {
    const { ctx } = await makeContext();
    const file = path.join(ctx.configDir, 'agents.json');
    const before = JSON.parse(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, JSON.stringify({ ...before, _comment: 'mine' }));
    const res = await call(createApp(ctx), '/api/agents', put({ models: { thread: 'haiku' } }));
    expect(res.status).toBe(200);
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({ ...before, _comment: 'mine', models: { ...before.models, thread: 'haiku' } });
    const bad = await call(createApp(ctx), '/api/agents', put({ models: { thread: 'gpt' } }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { errors: { key: string }[] }).errors[0].key).toBe('models.thread');
  });
});

describe('login item follows startAtLogin', () => {
  /** Points the login item at a temp LaunchAgents folder under the test's temp home. */
  async function withTempLoginItem() {
    const made = await makeContext();
    const { ctx, tmp } = made;
    ctx.loginItem = {
      enable: async () => {
        await enableLoginItem({ nodePath: '/n', cliPath: '/c', configDir: ctx.configDir, home: tmp });
      },
      disable: async () => {
        await disableLoginItem(tmp);
      },
      isEnabled: () => isLoginItemEnabled(tmp),
    };
    return made;
  }

  it('resetting settings.json turns the login item on when startAtLogin is true and the plist is missing', async () => {
    const { ctx, tmp } = await withTempLoginItem();
    expect(await isLoginItemEnabled(tmp)).toBe(false);
    const res = await call(createApp(ctx), '/api/reset', post({ file: 'settings.json' }));
    expect(res.status).toBe(200);
    expect(await isLoginItemEnabled(tmp)).toBe(true);
    await fs.access(loginItemPath(tmp));
  });

  it('a PUT that does not change startAtLogin still turns the login item on when the plist is missing', async () => {
    const { ctx, tmp } = await withTempLoginItem();
    const res = await call(createApp(ctx), '/api/settings', put({ theme: 'light' }));
    expect(res.status).toBe(200);
    expect(await isLoginItemEnabled(tmp)).toBe(true);
  });

  it('turns the login item off when startAtLogin is false and the plist is there', async () => {
    const { ctx, tmp } = await withTempLoginItem();
    await ctx.loginItem.enable();
    expect((await call(createApp(ctx), '/api/settings', put({ startAtLogin: false }))).status).toBe(200);
    expect(await isLoginItemEnabled(tmp)).toBe(false);
  });

  it('keeps the settings and says so when the login item cannot be changed', async () => {
    const { ctx, loginState } = await makeContext();
    loginState.enabled = false;
    ctx.loginItem.enable = async () => {
      throw new Error('launchd said no');
    };
    const app = createApp(ctx);
    const res = await call(app, '/api/settings', put({ theme: 'dark' }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { loginItemError?: string }).loginItemError).toMatch(/settings were saved.*launchd said no/);
    expect(JSON.parse(await fs.readFile(path.join(ctx.configDir, 'settings.json'), 'utf8')).theme).toBe('dark');
    const reset = await call(app, '/api/reset', post({ file: 'settings.json' }));
    expect(reset.status).toBe(200);
    expect(((await reset.json()) as { loginItemError?: string }).loginItemError).toMatch(/launchd said no/);
  });
});
