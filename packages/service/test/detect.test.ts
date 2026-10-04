import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { writeJsonAtomic } from '@dev-plumbing/core';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import { makeRepo } from '../../core/test/fixtures';
import { call, makeContext, removeTempDirs } from './helpers';

afterAll(removeTempDirs);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const PLAN = 'docs/specs/restock-reminders.md';
const base = { repo: 'acme-app', project: 'restock-reminders', timeoutSeconds: 0 };
/** What the repo-setup subagent detects the second time: more plan folders, a new convention and an app. */
const DETECTED = {
  name: 'acme-app',
  match: ['github.com/acme/acme-app'],
  planFolders: ['docs/specs', 'docs/plans'],
  conventions: ['Ids use uuid()', 'Foreign keys are named <model>Id'],
  apps: [{ name: 'web', path: 'apps/web', kitFiles: ['apps/web/app/globals.css'] }],
};

/** A clone, and a repo profile with the user's own projects folder and link into clones. */
async function setup(o: { now?: () => number } = {}) {
  const s = await makeContext();
  const repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
  const profile = {
    name: 'acme-app',
    match: ['github.com/acme/acme-app'],
    projectsFolder: path.join(s.tmp, 'acme-projects'),
    linkIntoClones: { enabled: true, linkName: 'plumbing' },
    planFolders: ['docs/specs'],
    conventions: ['Ids use uuid()'],
  };
  await writeJsonAtomic(path.join(s.ctx.configDir, 'repos', 'acme-app.json'), profile);
  const rt = createRuntime({ now: o.now });
  const app = createApp(s.ctx, rt);
  const send = async (method: string, route: string, body?: unknown): Promise<{ status: number; body: Json }> => {
    const res = await call(app, route, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  };
  const claude = (route: string, body: unknown) => send('POST', `/api/claude${route}`, body);
  const detectState = async () => (await send('GET', '/api/config')).body.detect;
  return { ...s, rt, app, send, claude, repo, profile, detectState };
}

describe('Detect again', () => {
  it('is recorded for a repo profile, and shows in the config', async () => {
    const t = await setup();
    expect(await t.detectState()).toEqual({ pending: [], last: {} });
    expect((await t.send('POST', '/api/repos/acme-app/detect')).body).toEqual({ ok: true });
    expect(await t.detectState()).toEqual({ pending: ['acme-app'], last: {} });
    const missing = await t.send('POST', '/api/repos/nope/detect');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('Unknown repo profile.');
  });

  it("runs at the next /dev-plumbing in a clone, and keeps the user's own settings", async () => {
    const t = await setup();
    await t.send('POST', '/api/repos/acme-app/detect');
    const open = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    expect(open.body).toMatchObject({ kind: 'needs-profile', redetect: true, name: 'acme-app', clone: t.repo, remote: 'github.com/acme/acme-app', model: 'sonnet' });
    expect(open.body.next).toContain('dev-plumbing:repo-setup');
    expect((await t.claude('/repo-profile', { cwd: t.repo })).body).toMatchObject({ kind: 'redetect', profile: { name: 'acme-app' }, remote: 'github.com/acme/acme-app', clone: t.repo });

    // The agent still may not choose where the service writes.
    const sneaky = await t.claude('/repo-profile', { cwd: t.repo, profile: { ...DETECTED, projectsFolder: path.join(t.repo, 'inside') } });
    expect(sneaky.status).toBe(400);
    expect(sneaky.body.error).toMatch(/Leave out projectsFolder and linkIntoClones/);

    const saved = await t.claude('/repo-profile', { cwd: t.repo, profile: DETECTED });
    expect(saved.status).toBe(200);
    const merged = { ...t.profile, planFolders: DETECTED.planFolders, conventions: DETECTED.conventions, apps: DETECTED.apps, sensitiveData: [] };
    expect(saved.body).toEqual({ saved: 'repos/acme-app.json', profile: merged });
    expect(JSON.parse(await fs.readFile(path.join(t.ctx.configDir, 'repos', 'acme-app.json'), 'utf8'))).toEqual(merged);
    expect(await t.detectState()).toEqual({ pending: [], last: { 'acme-app': expect.any(String) } });

    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body.kind).toBe('created');
    // Without a request, a saved profile is never overwritten.
    expect((await t.claude('/repo-profile', { cwd: t.repo, profile: DETECTED })).status).toBe(400);
  });

  it("doesn't keep the project from opening when detection saves nothing", async () => {
    const t = await setup();
    await t.send('POST', '/api/repos/acme-app/detect');
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'needs-profile', redetect: true });
    // The repo-setup subagent couldn't save. The skill calls dp_open again once, and the project opens.
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body.kind).toBe('created');
    expect((await t.detectState()).pending).toEqual(['acme-app']);
    // It isn't handed out again until Detect again is pressed again.
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-b' })).body.kind).toBe('reopened');
    await t.send('POST', '/api/repos/acme-app/detect');
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-b' })).body).toMatchObject({ kind: 'needs-profile', redetect: true });
  });

  it('a window that got it through /open holds it while its repo-setup runs, for at least 10 minutes', async () => {
    let clock = Date.parse('2026-10-03T09:00:00Z');
    const t = await setup({ now: () => clock });
    await t.send('POST', '/api/repos/acme-app/detect');
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'needs-profile', redetect: true });
    // w-a isn't listening anywhere while its subagent runs, but it still holds the request: w-b just opens.
    clock += 9 * 60_000;
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-b' })).body.kind).toBe('created');
    // Ten minutes on, w-a never came back: the next window gets it.
    clock += 60_000;
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-c' })).body).toMatchObject({ kind: 'needs-profile', redetect: true });
  });

  it('a listening window runs it once per request', async () => {
    const t = await setup();
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body.kind).toBe('created');
    await t.send('POST', '/api/repos/acme-app/detect');
    const got = await t.claude('/wait', { ...base, windowId: 'w-a' });
    expect(got.body).toMatchObject({ kind: 'detect-profile', repo: 'acme-app', clone: t.repo, model: 'sonnet' });
    expect(got.body.next).toContain('finished: { detect: "acme-app" }');
    expect(t.rt.listeners.state('acme-app/restock-reminders')).toBe('busy');
    // Another window doesn't get it while w-a works on it.
    expect((await t.claude('/wait', { ...base, windowId: 'w-b' })).body).toEqual({ kind: 'timeout' });
    // w-a comes back without saving: nobody gets it again until Detect again is pressed again.
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', finished: { detect: 'acme-app' } })).body).toEqual({ kind: 'timeout' });
    expect((await t.claude('/wait', { ...base, windowId: 'w-b' })).body).toEqual({ kind: 'timeout' });
    await t.send('POST', '/api/repos/acme-app/detect');
    expect((await t.claude('/wait', { ...base, windowId: 'w-b' })).body.kind).toBe('detect-profile');
    expect((await t.claude('/repo-profile', { cwd: t.repo, profile: DETECTED })).status).toBe(200);
    expect((await t.claude('/wait', { ...base, windowId: 'w-b', finished: { detect: 'acme-app' } })).body).toEqual({ kind: 'timeout' });
    expect((await t.detectState()).pending).toEqual([]);
  });

  it('wakes a listening window', async () => {
    const t = await setup();
    await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    const waiting = t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 5 });
    await new Promise((r) => setTimeout(r, 50));
    await t.send('POST', '/api/repos/acme-app/detect');
    expect((await waiting).body).toMatchObject({ kind: 'detect-profile', repo: 'acme-app' });
  });

  it('records when a first profile was detected', async () => {
    const t = await setup();
    const other = makeRepo({ remote: 'https://github.com/acme/new-thing.git' });
    expect((await t.claude('/repo-profile', { cwd: other, profile: { name: 'new-thing', match: ['github.com/acme/new-thing'] } })).status).toBe(200);
    expect(await t.detectState()).toEqual({ pending: [], last: { 'new-thing': expect.any(String) } });
  });
});
