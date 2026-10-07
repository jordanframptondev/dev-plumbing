import path from 'node:path';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  askAboutDefense,
  cancelWhiteboard,
  defenseLinks,
  defenseStale,
  exportDefense,
  finalName,
  formatZodError,
  InputError,
  practiceView,
  ratePractice,
  ratingValues,
  readDefense,
  readPractice,
  readProjectFile,
  readWhiteboardRequest,
  requestWhiteboard,
  sendFromDefense,
  submit,
  tickPractice,
  WHITEBOARD_IMPORTING,
  WHITEBOARD_UNDER_WAY,
  type AskDefenseResponse,
  type GenerateWhiteboardResponse,
  type ProjectRef,
  type SendFromDefenseResponse,
  type WhiteboardView,
} from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { handle } from '../errors';
import { EXPECTED_OBJECT, readJsonObject } from '../json';
import { locateProject } from '../locate';
import { projectKey, type Runtime } from '../runtime';
import { clonesOf, knownClone } from './clones';
import { submitResponse } from './respond';

/** What Generate says, by whether a Claude window will pick the request up. */
export const WHITEBOARD_WAITING = 'Waiting for Claude to write the Whiteboard Defense.';
export const WHITEBOARD_NO_WINDOW = 'No Claude window is listening. Run /dev-plumbing in any clone.';

// Strict, so a misspelt key is refused rather than ignored.
const askBody = z
  .object({ defenseId: z.string().min(1), kind: z.enum(['section', 'question', 'concern']), ref: z.string().min(1), question: z.string().trim().min(1).max(20_000) })
  .strict();
const sendBody = z.object({ defenseId: z.string().min(1), kind: z.enum(['claim', 'concern']), ref: z.string().min(1) }).strict();
const ratingBody = z.object({ defenseId: z.string().min(1), questionId: z.string().min(1), rating: z.enum(ratingValues).nullable() }).strict();
const tickBody = z.object({ defenseId: z.string().min(1), checklistId: z.string().min(1), ticked: z.boolean() }).strict();
const exportBody = z.object({ clone: z.string().min(1) }).strict();

async function parse<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  const body = await readJsonObject(c);
  if (!body) throw new InputError(EXPECTED_OBJECT.error);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new InputError(formatZodError(parsed.error));
  return parsed.data;
}

/** The Whiteboard Defense page: generate it, study and practise it, ask Claude about it, send its unknowns on, export it. */
export function whiteboardRoutes(ctx: AppContext, rt: Runtime): Hono {
  const r = new Hono();
  const base = '/projects/:repo/:id/whiteboard';
  const find = (c: Context) => locateProject(ctx, c.req.param('repo')!, c.req.param('id')!);
  /** Runs a write under the project's lock, then tells the browser. */
  const write = async <T>(ref: ProjectRef, fn: () => Promise<T>): Promise<T> => {
    const result = await rt.withLock(projectKey(ref.repo, ref.id), fn);
    rt.events.projectChanged(ref.repo, ref.id);
    return result;
  };

  r.get(base, handle(async (c) => {
    const { ref } = await find(c);
    const project = await readProjectFile(ref.dir);
    const request = await readWhiteboardRequest(ref.dir);
    const defense = await readDefense(ref.dir);
    // Why Generate can't be pressed now: requestWhiteboard's own refusals, so the page says what a press would.
    const generateRefusal =
      project.status === 'importing' ? WHITEBOARD_IMPORTING : request?.state === 'requested' || request?.state === 'writing' ? WHITEBOARD_UNDER_WAY : null;
    const view: WhiteboardView = {
      request,
      defense,
      stale: defense ? await defenseStale(ref.dir, defense) : null,
      practice: defense ? practiceView(defense, await readPractice(ref.dir)) : null,
      ...(defense ? await defenseLinks(ref.dir, defense) : { asked: [], sent: [] }),
      canGenerate: generateRefusal === null,
      generateRefusal,
      listening: rt.listeners.state(projectKey(ref.repo, ref.id)),
      clones: await clonesOf(project, ctx.home),
      // Next to where Accept puts <name>.final.md: the plan's own folder, relative to a clone.
      exportPath: path.posix.join(path.posix.dirname(project.source.path), `${finalName(project.source.path)}.whiteboard-defense.md`),
    };
    return c.json(view);
  }));

  // Generate (and Regenerate, and Try again). The request waits in the project folder until a listening window picks it
  // up through dp_wait. The defense already saved stays until the new one is.
  r.post(base, handle(async (c) => {
    const { ref } = await find(c);
    const key = projectKey(ref.repo, ref.id);
    const request = await write(ref, () => requestWhiteboard(ref.dir));
    const listening = rt.listeners.state(key);
    rt.listeners.notify(key);
    const response: GenerateWhiteboardResponse = { request, listening, message: listening === null ? WHITEBOARD_NO_WINDOW : WHITEBOARD_WAITING };
    return c.json(response);
  }));

  // Cancel, in any state. A window still writing finds nothing to save into, and its report back fails nothing.
  r.post(`${base}/cancel`, handle(async (c) => {
    const { ref } = await find(c);
    await write(ref, () => cancelWhiteboard(ref.dir));
    return c.json({ ok: true });
  }));

  // Ask Claude about this: a Defense thread whose first message is the question, sent as Send this thread sends.
  r.post(`${base}/ask`, handle(async (c) => {
    const body = await parse(c, askBody);
    const { cfg, ref } = await find(c);
    const { threadId, result } = await write(ref, async () => {
      const asked = await askAboutDefense(ref.dir, { defenseId: body.defenseId, kind: body.kind, ref: body.ref, question: body.question });
      return { threadId: asked.threadId, result: await submit(ref.dir, { scope: 'thread', threadId: asked.threadId, types: cfg.types }) };
    });
    const response: AskDefenseResponse = { ...submitResponse(rt, ref, result), threadId };
    return c.json(response);
  }));

  // Send to Questions or Concerns. The new thread starts with Claude, queued as a submission the service made.
  r.post(`${base}/send`, handle(async (c) => {
    const body = await parse(c, sendBody);
    const { cfg, ref } = await find(c);
    const key = projectKey(ref.repo, ref.id);
    const sent = await write(ref, () => sendFromDefense(ref.dir, { defenseId: body.defenseId, kind: body.kind, ref: body.ref, types: cfg.types }));
    const listening = rt.listeners.state(key);
    rt.listeners.notify(key);
    // A busy window (writing the defense, say) gets to it once it's done.
    const message =
      listening === null
        ? `Added to ${sent.typeTitle}. ${WHITEBOARD_NO_WINDOW}`
        : listening === 'busy'
          ? `Added to ${sent.typeTitle}. Claude is busy, and will suggest answers when it's done.`
          : `Added to ${sent.typeTitle}. Claude will suggest answers.`;
    const response: SendFromDefenseResponse = { ...sent, listening, message };
    return c.json(response);
  }));

  r.post(`${base}/practice/rating`, handle(async (c) => {
    const body = await parse(c, ratingBody);
    const { ref } = await find(c);
    return c.json(await write(ref, () => ratePractice(ref.dir, body)));
  }));

  r.post(`${base}/practice/tick`, handle(async (c) => {
    const body = await parse(c, tickBody);
    const { ref } = await find(c);
    return c.json(await write(ref, () => tickPractice(ref.dir, body)));
  }));

  // Export .md: only into a clone this project was opened from. exportDefense then checks its remote and every path.
  r.post(`${base}/export`, handle(async (c) => {
    const body = await parse(c, exportBody);
    const { cfg, ref } = await find(c);
    const clone = await knownClone(await readProjectFile(ref.dir), body.clone, ctx.home);
    const profile = cfg.repos.find((p) => p.name === ref.repo);
    if (!profile) throw new InputError(`There's no repo profile for ${ref.repo}. Add it in Settings → Repos.`);
    return c.json(await write(ref, () => exportDefense({ dir: ref.dir, clone, profile, home: ctx.home })));
  }));

  return r;
}
