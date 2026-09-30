import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { call, makeContext } from './helpers';

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
    expect(((await bad.json()) as Record<string, unknown>).errors).toBeDefined();
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
