import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { writeJsonAtomic } from '@dev-plumbing/core';
import { createApp } from '../src/app';
import { call, makeContext, removeTempDirs } from './helpers';

afterAll(removeTempDirs);

describe('projects API', () => {
  it('lists active projects, needs-you first', async () => {
    const { ctx } = await makeContext();
    const body = (await (await call(createApp(ctx), '/api/projects')).json()) as Record<string, unknown>;
    expect((body.items as Array<{ id: string }>).map((s) => s.id)).toEqual(['restock-reminders', 'checkout-redesign']);
    expect(body.total).toBe(2);
  });

  it('pages, searches and switches tabs', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const page = (await (await call(app, '/api/projects?tab=all&limit=2')).json()) as Record<string, unknown>;
    expect((page.items as unknown[]).length).toBe(2);
    expect(page.total).toBe(3);
    const found = (await (await call(app, '/api/projects?tab=all&q=onboarding')).json()) as Record<string, unknown>;
    expect((found.items as Array<{ id: string }>).map((s) => s.id)).toEqual(['onboarding-emails']);
  });

  it('lists project folders that could not be read', async () => {
    const { ctx } = await makeContext();
    await writeJsonAtomic(path.join(ctx.configDir, 'repos', 'ghost.json'), { name: 'ghost', match: ['github.com/acme/ghost'], projectsFolder: '/no/such/folder' });
    const res = await call(createApp(ctx), '/api/projects?tab=all');
    const body = (await res.json()) as { problems: { folder: string; message: string }[] };
    expect(body.problems).toEqual([{ folder: '/no/such/folder', message: expect.stringMatching(/"ghost".*doesn't exist/) }]);
  });

  it('returns the project home, and 404 for an unknown project', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const home = (await (await call(app, '/api/projects/acme/restock-reminders')).json()) as Record<string, unknown>;
    expect((home.project as Record<string, unknown>).title).toBe('Restock reminders');
    expect((home.types as unknown[]).length).toBe(10);
    expect((await call(app, '/api/projects/acme/nope')).status).toBe(404);
  });

  it('returns 422 with the reason for a broken project', async () => {
    const { ctx, root } = await makeContext();
    await fs.writeFile(path.join(root, 'acme', 'restock-reminders', 'project.json'), '{bad');
    const res = await call(createApp(ctx), '/api/projects/acme/restock-reminders');
    expect(res.status).toBe(422);
    const errBody = (await res.json()) as Record<string, unknown>;
    expect((errBody.error as string)).toMatch(/isn't valid JSON/);
  });

  it('lists one plumbing type and 404s an unknown type', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const body = (await (await call(app, '/api/projects/acme/restock-reminders/types/security')).json()) as Record<string, unknown>;
    expect(((body.type as Record<string, unknown>).noChanges as Record<string, unknown>).reason).toMatch(/permissions/);
    expect(body.items).toEqual([]);
    expect((await call(app, '/api/projects/acme/restock-reminders/types/nope')).status).toBe(404);
  });

  it('returns documents', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const draftBody = (await (await call(app, '/api/projects/acme/restock-reminders/docs/draft')).json()) as Record<string, unknown>;
    expect((draftBody.text as string)).toMatch(/SMS and email/);
    const finalBody = (await (await call(app, '/api/projects/acme/restock-reminders/docs/final')).json()) as Record<string, unknown>;
    expect(finalBody.text).toBeNull();
    expect((await call(app, '/api/projects/acme/restock-reminders/docs/secrets')).status).toBe(404);
  });

  it('opens the config folder, and explains a missing plan file', async () => {
    const { ctx, opened } = await makeContext();
    const app = createApp(ctx);
    expect((await call(app, '/api/open', { method: 'POST', body: JSON.stringify({ target: 'config' }) })).status).toBe(200);
    expect(opened).toEqual([ctx.configDir]);
    const res = await call(app, '/api/open', { method: 'POST', body: JSON.stringify({ target: 'source', repo: 'acme', id: 'restock-reminders' }) });
    expect(res.status).toBe(404);
    const errBody = (await res.json()) as Record<string, unknown>;
    expect((errBody.error as string)).toMatch(/isn't at .*restock-reminders.md/);
  });
});

describe('opening the plan file', () => {
  const openSource = (app: ReturnType<typeof createApp>) =>
    call(app, '/api/open', { method: 'POST', body: JSON.stringify({ target: 'source', repo: 'acme', id: 'restock-reminders' }) });

  /** Points the restock-reminders project at `path` inside `clone`, and makes a clone folder under the temp home. */
  async function setup(source: { clone?: string; path: string }) {
    const made = await makeContext();
    const clone = path.join(made.tmp, 'Source', 'acme');
    await fs.mkdir(path.join(clone, 'docs', 'specs'), { recursive: true });
    const projectFile = path.join(made.root, 'acme', 'restock-reminders', 'project.json');
    const project = JSON.parse(await fs.readFile(projectFile, 'utf8'));
    await fs.writeFile(projectFile, JSON.stringify({ ...project, source: { ...project.source, clone: source.clone ?? clone, path: source.path } }));
    return { ...made, clone, app: createApp(made.ctx) };
  }

  it('opens a real .md file inside the clone', async () => {
    const { app, clone, opened } = await setup({ path: 'docs/specs/Plan.MD' });
    await fs.writeFile(path.join(clone, 'docs', 'specs', 'Plan.MD'), '# Plan');
    const res = await openSource(app);
    expect(res.status).toBe(200);
    expect(opened).toEqual([await fs.realpath(path.join(clone, 'docs', 'specs', 'Plan.MD'))]);
  });

  it('refuses a path that escapes the clone with ..', async () => {
    const { app, tmp, opened } = await setup({ path: '../outside.md' });
    await fs.writeFile(path.join(tmp, 'Source', 'outside.md'), '# Not in the clone');
    const res = await openSource(app);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/inside/);
    expect(opened).toEqual([]);
  });

  it('refuses a symlink that points outside the clone', async () => {
    const { app, tmp, clone, opened } = await setup({ path: 'docs/link.md' });
    await fs.writeFile(path.join(tmp, 'secret.md'), '# Secret');
    await fs.symlink(path.join(tmp, 'secret.md'), path.join(clone, 'docs', 'link.md'));
    expect((await openSource(app)).status).toBe(400);
    expect(opened).toEqual([]);
  });

  it('refuses a file that is not markdown', async () => {
    const { app, clone, opened } = await setup({ path: 'run.command' });
    await fs.writeFile(path.join(clone, 'run.command'), 'echo hi', { mode: 0o755 });
    const res = await openSource(app);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Markdown/);
    expect(opened).toEqual([]);
  });

  it('refuses a directory, even one named like a .md file', async () => {
    const { app, clone, opened } = await setup({ path: 'docs/folder.md' });
    await fs.mkdir(path.join(clone, 'docs', 'folder.md'));
    expect((await openSource(app)).status).toBe(400);
    expect(opened).toEqual([]);
  });

  it('refuses a clone of / pointing at an app', async () => {
    const made = await setup({ clone: '/', path: 'placeholder' });
    const bundle = path.join(made.tmp, 'Fake.app');
    await fs.mkdir(path.join(bundle, 'Contents'), { recursive: true });
    const projectFile = path.join(made.root, 'acme', 'restock-reminders', 'project.json');
    const project = JSON.parse(await fs.readFile(projectFile, 'utf8'));
    await fs.writeFile(projectFile, JSON.stringify({ ...project, source: { ...project.source, path: path.relative('/', bundle) } }));
    const { app, opened } = made;
    expect((await openSource(app)).status).toBe(400);
    expect(opened).toEqual([]);
  });

  it('says so when the file cannot be opened', async () => {
    const { app, clone, ctx } = await setup({ path: 'docs/specs/plan.md' });
    await fs.writeFile(path.join(clone, 'docs', 'specs', 'plan.md'), '# Plan');
    ctx.open = async () => {
      throw new Error('no app for this file');
    };
    const res = await openSource(app);
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toMatch(/couldn't be opened.*no app for this file/);
  });
});
