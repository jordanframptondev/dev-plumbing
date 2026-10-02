import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  addOwnItem,
  applyPendingChange,
  formatZodError,
  InputError,
  loadChanges,
  loadThreadDetail,
  saveDraft,
  setParked,
  submit,
  submitMessage,
  undoChange,
  type ProjectRef,
  type SubmitResponse,
} from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { handle } from '../errors';
import { EXPECTED_OBJECT, readJsonObject } from '../json';
import { locateProject } from '../locate';
import { projectKey, type Runtime } from '../runtime';

// `{ clear: true }` clears a draft. Anything else must name at least one known field, so a typo can't erase one.
const draftBody = z.union([
  z.object({ clear: z.literal(true) }),
  z
    .object({ optionId: z.string().max(100).optional(), note: z.string().max(20_000).optional(), text: z.string().max(20_000).optional() })
    .strict()
    .refine((d) => d.optionId !== undefined || d.note !== undefined || d.text !== undefined, 'Send optionId, note or text, or clear: true.'),
]);
const parkBody = z.object({ parked: z.boolean() });
const submitBody = z.union([z.object({ scope: z.literal('all') }), z.object({ scope: z.literal('thread'), threadId: z.string().min(1) })]);
const itemBody = z.object({ type: z.string().min(1), title: z.string().min(1).max(200), text: z.string().min(1).max(20_000), fields: z.record(z.string().max(500)).optional() });

async function parse<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  const body = await readJsonObject(c);
  if (!body) throw new InputError(EXPECTED_OBJECT.error);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new InputError(formatZodError(parsed.error));
  return parsed.data;
}

export function threadRoutes(ctx: AppContext, rt: Runtime): Hono {
  const r = new Hono();
  const base = '/projects/:repo/:id';
  const find = (c: Context) => locateProject(ctx, c.req.param('repo')!, c.req.param('id')!);
  /** Runs a write under the project's lock, then tells the browser. */
  const write = async <T>(ref: ProjectRef, fn: () => Promise<T>): Promise<T> => {
    const result = await rt.withLock(projectKey(ref.repo, ref.id), fn);
    rt.events.projectChanged(ref.repo, ref.id);
    return result;
  };
  const respond = (ref: ProjectRef, r: { resolved: string[]; sent: string[]; skipped: { threadId: string; reason: string }[] }): SubmitResponse => {
    const key = projectKey(ref.repo, ref.id);
    if (r.sent.length) rt.listeners.notify(key);
    const listening = rt.listeners.state(key);
    const counts = { resolved: r.resolved.length, sent: r.sent.length, skipped: r.skipped };
    return { ...counts, listening, message: submitMessage(counts, listening) };
  };

  r.get(`${base}/threads/:threadId`, handle(async (c) => {
    const { cfg, ref } = await find(c);
    const detail = await loadThreadDetail({ dir: ref.dir, threadId: c.req.param('threadId')!, types: cfg.types });
    return c.json({ ...detail, listening: rt.listeners.state(projectKey(ref.repo, ref.id)) });
  }));

  r.put(`${base}/threads/:threadId/draft`, handle(async (c) => {
    const body = await parse(c, draftBody);
    const { ref } = await find(c);
    await write(ref, () => saveDraft(ref.dir, c.req.param('threadId')!, 'clear' in body ? null : body));
    return c.json({ ok: true });
  }));

  r.post(`${base}/threads/:threadId/park`, handle(async (c) => {
    const body = await parse(c, parkBody);
    const { ref } = await find(c);
    await write(ref, () => setParked(ref.dir, c.req.param('threadId')!, body.parked));
    return c.json({ ok: true });
  }));

  r.post(`${base}/submit`, handle(async (c) => {
    const body = await parse(c, submitBody);
    const { cfg, ref } = await find(c);
    const result = await write(ref, () => submit(ref.dir, { scope: body.scope, threadId: body.scope === 'thread' ? body.threadId : undefined, types: cfg.types }));
    return c.json(respond(ref, result));
  }));

  r.post(`${base}/items`, handle(async (c) => {
    const body = await parse(c, itemBody);
    const { cfg, ref } = await find(c);
    const type = cfg.types.find((t) => t.id === body.type && t.enabled);
    if (!type) throw new InputError(`"${body.type}" isn't an enabled plumbing type.`);
    const { threadId, result } = await write(ref, async () => {
      const { thread } = await addOwnItem(ref.dir, { type, title: body.title, text: body.text, fields: body.fields });
      return { threadId: thread.id, result: await submit(ref.dir, { scope: 'thread', threadId: thread.id, types: cfg.types }) };
    });
    return c.json({ ...respond(ref, result), threadId });
  }));

  r.get(`${base}/changes`, handle(async (c) => {
    const { ref } = await find(c);
    return c.json(await loadChanges(ref.dir));
  }));

  r.post(`${base}/changes/:changeId/:action`, handle(async (c) => {
    const action = c.req.param('action');
    if (action !== 'undo' && action !== 'apply') return c.json({ error: 'Unknown action.' }, 404);
    const { ref } = await find(c);
    const changeId = c.req.param('changeId')!;
    await write(ref, () => (action === 'undo' ? undoChange(ref.dir, changeId) : applyPendingChange(ref.dir, changeId)));
    return c.json({ ok: true });
  }));

  return r;
}
