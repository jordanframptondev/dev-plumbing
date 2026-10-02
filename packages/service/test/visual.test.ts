import fs from 'node:fs';
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
const P = '/api/projects/acme-app/restock-reminders';
const SCHEMA = `model Customer {
  id            String         @id @default(uuid())
  email         String         @unique
  subscriptions Subscription[]
}

model Subscription {
  id         String   @id @default(uuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id])
  status     String
}
`;

/** The job box points at a real file and symbol; the SMS box points at a file that isn't there. */
const system = {
  kind: 'system',
  groups: [{ id: 'jobs', label: 'Jobs' }],
  nodes: [
    { id: 'job', label: 'Daily reminder job', group: 'jobs', status: 'new', codeRef: { path: 'src/jobs/reminders.ts', symbol: 'sendReminders' } },
    { id: 'sms', label: 'SMS sender', status: 'new', codeRef: { path: 'src/sms/send.ts' } },
    { id: 'db', label: 'Subscriptions table', status: 'unchanged' },
  ],
  edges: [
    { id: 'reads', from: 'job', to: 'db', label: 'reads' },
    { id: 'sends', from: 'job', to: 'sms' },
  ],
};
/** status matches the schema, remindDays is new, and pausedAt claims to change a field the schema doesn't have. */
const subscription = {
  model: 'Subscription',
  change: 'changed',
  fields: [
    { name: 'status', type: 'String', change: 'unchanged' },
    { name: 'remindDays', type: 'Int', change: 'added', default: '3' },
    { name: 'pausedAt', type: 'DateTime?', change: 'changed' },
  ],
  schemaDiff: '+  remindDays Int @default(3)',
  migration: [{ kind: 'additive', text: 'Add remindDays with a default of 3.' }],
};
const turnOn = { kind: 'user', steps: [{ n: 1, label: 'Open account settings' }, { n: 2, label: 'Turn reminders on' }] };

/** Imports a plan whose clone has a Prisma schema and one source file: a diagram, a table and a flow, and "no changes" elsewhere. */
async function setup() {
  const s = await makeContext();
  const repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
  fs.mkdirSync(path.join(repo, 'packages', 'db', 'prisma'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'packages', 'db', 'prisma', 'schema.prisma'), SCHEMA);
  fs.mkdirSync(path.join(repo, 'src', 'jobs'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'jobs', 'reminders.ts'), 'export function sendReminders() {}\n');
  await writeJsonAtomic(path.join(s.ctx.configDir, 'repos', 'acme-app.json'), {
    name: 'acme-app',
    match: ['github.com/acme/acme-app'],
    schema: { type: 'prisma', path: 'packages/db/prisma/schema.prisma' },
  });
  const rt = createRuntime();
  const app = createApp(s.ctx, rt);
  const send = async (method: string, route: string, body?: unknown): Promise<{ status: number; body: Json }> => {
    const res = await call(app, route, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  };
  const batches: Record<string, unknown> = {
    architecture: { items: [{ key: 'system', title: 'System view', summary: 'The daily job and what it touches.', data: system }] },
    database: { items: [{ key: 'subscription', title: 'Subscription', summary: 'Reminder settings on each subscription.', data: subscription }] },
    flows: { items: [{ key: 'turn-on', title: 'Turning reminders on', summary: 'From account settings.', data: turnOn }] },
  };
  const open = await send('POST', '/api/claude/open', { cwd: repo, plan: 'docs/specs/restock-reminders.md' });
  for (const type of open.body.importTypes as { id: string }[]) {
    const r = await send('POST', '/api/claude/items', { repo: 'acme-app', project: 'restock-reminders', type: type.id, cwd: repo, ...((batches[type.id] as object | undefined) ?? { noChanges: 'None.' }) });
    expect(r.status).toBe(200);
  }
  return { ...s, rt, app, send, repo, dir: path.join(s.root, 'acme-app', 'restock-reminders') };
}

describe('checks against the code', () => {
  it("checks each table against the repo's Prisma schema when the screen loads", async () => {
    const t = await setup();
    const r = await t.send('GET', `${P}/types/database`);
    expect(r.status).toBe(200);
    const row = r.body.items[0];
    expect(row).toMatchObject({ title: 'Subscription', data: { model: 'Subscription' }, createdBy: 'import', anchor: null, checks: { kind: 'database', checked: true } });
    expect(row.checks.file).toContain('schema.prisma');
    expect(row.checks.warnings).toEqual([expect.stringMatching(/Subscription\.pausedAt/)]);
  });

  it('marks which diagram boxes point at real files, on the screen and in the thread', async () => {
    const t = await setup();
    const rows = (await t.send('GET', `${P}/types/architecture`)).body.items;
    expect(rows[0].checks).toEqual({ kind: 'diagram', checked: true, nodes: { job: true, sms: false } });
    const d = (await t.send('GET', `${P}/threads/t-architecture-system`)).body;
    expect(d.checks).toEqual({ kind: 'diagram', checked: true, nodes: { job: true, sms: false } });
    expect(d.anchorParent).toBeNull();
    expect(d.type).toMatchObject({ screen: 'diagram', timeline: false });
    expect((await t.send('GET', `${P}/types/flows`)).body.items[0]).toMatchObject({ data: { kind: 'user' }, checks: null });
  });

  it("says tables and diagrams aren't checked when the clone is gone", async () => {
    const t = await setup();
    fs.rmSync(t.repo, { recursive: true, force: true });
    const table = (await t.send('GET', `${P}/types/database`)).body.items[0];
    expect(table.checks).toEqual({ kind: 'database', checked: false, reason: "The plan's clone isn't on this Mac any more.", warnings: [] });
    const diagram = (await t.send('GET', `${P}/types/architecture`)).body.items[0];
    expect(diagram.checks).toEqual({ kind: 'diagram', checked: false, reason: "The plan's clone isn't on this Mac any more.", nodes: {} });
  });
});
