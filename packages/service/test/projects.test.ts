import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { call, makeContext } from './helpers';

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
