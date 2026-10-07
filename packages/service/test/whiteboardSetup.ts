import path from 'node:path';
import { writeJsonAtomic } from '@dev-plumbing/core';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import { makeRepo } from '../../core/test/fixtures';
import { call, makeContext } from './helpers';

// The setup the Whiteboard Defense's service tests share. Each test file still calls afterAll(removeTempDirs).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;
export const P = '/api/projects/acme-app/restock-reminders';
export const PLAN = 'docs/specs/restock-reminders.md';
export const base = { repo: 'acme-app', project: 'restock-reminders' };
/** The architecture item's drawing: the one diagram a defense's Whiteboard diagram section may name. */
export const DIAGRAM = {
  kind: 'system',
  nodes: [
    { id: 'job', label: 'Daily reminder job', status: 'new' },
    { id: 'db', label: 'Subscriptions table', status: 'unchanged' },
  ],
  edges: [{ id: 'reads', from: 'job', to: 'db', label: 'reads' }],
};
const ITEMS: Record<string, unknown[]> = {
  architecture: [{ key: 'reminders', title: 'Reminder job', summary: 'A daily job sends the reminders.', data: DIAGRAM }],
  questions: [{ key: 'days', title: 'How many days before?', summary: 'Lead time.', message: { text: 'How many days?' } }],
};

/**
 * A clone, its repo profile, and a plumbing project with an architecture diagram (architecture-reminders) and a question
 * (questions-days). Every other type has no changes. `now` is the windows' clock.
 */
export async function setup(o: { now?: () => number } = {}) {
  const s = await makeContext();
  const repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
  await writeJsonAtomic(path.join(s.ctx.configDir, 'repos', 'acme-app.json'), { name: 'acme-app', match: ['github.com/acme/acme-app'] });
  const rt = createRuntime({ now: o.now });
  const app = createApp(s.ctx, rt);
  const send = async (method: string, route: string, body?: unknown): Promise<{ status: number; body: Json }> => {
    const res = await call(app, route, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  };
  const claude = (route: string, body: unknown) => send('POST', `/api/claude${route}`, body);
  const open = await claude('/open', { cwd: repo, plan: PLAN, windowId: 'w-a' });
  for (const type of open.body.importTypes as { id: string }[]) {
    const list = ITEMS[type.id];
    const r = await claude('/items', { ...base, type: type.id, ...(list ? { items: list } : { noChanges: 'None.' }) });
    if (r.status !== 200) throw new Error(`${type.id}: ${r.body.error}`);
  }
  return { ...s, rt, app, send, claude, repo, dir: path.join(s.root, 'acme-app', 'restock-reminders') };
}
export type Setup = Awaited<ReturnType<typeof setup>>;
