import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  acceptFinal,
  diffText,
  discardProposal,
  finalInputsHash,
  finalizeChecklist,
  finalName,
  formatZodError,
  InputError,
  loadProjectHome,
  readDocText,
  readFinalize,
  readProjectFile,
  requestFinalize,
  type FinalizeView,
  type ProjectRef,
} from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { handle } from '../errors';
import { EXPECTED_OBJECT, readJsonObject } from '../json';
import { locateProject } from '../locate';
import { projectKey, type Runtime } from '../runtime';
import { clonesOf, knownClone } from './clones';

/** What Start finalize says, by whether a Claude window will pick the request up. */
export const FINALIZE_WAITING = 'Waiting for Claude to write the final.';
export const FINALIZE_NO_WINDOW = 'No Claude window is listening. Run /dev-plumbing in any clone.';

const acceptBody = z.object({ clone: z.string().min(1) });

async function parse<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  const body = await readJsonObject(c);
  if (!body) throw new InputError(EXPECTED_OBJECT.error);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new InputError(formatZodError(parsed.error));
  return parsed.data;
}

export function finalizeRoutes(ctx: AppContext, rt: Runtime): Hono {
  const r = new Hono();
  const base = '/projects/:repo/:id/finalize';
  const find = (c: Context) => locateProject(ctx, c.req.param('repo')!, c.req.param('id')!);
  /** Runs a write under the project's lock, then tells the browser. */
  const write = async <T>(ref: ProjectRef, fn: () => Promise<T>): Promise<T> => {
    const result = await rt.withLock(projectKey(ref.repo, ref.id), fn);
    rt.events.projectChanged(ref.repo, ref.id);
    return result;
  };

  r.get(base, handle(async (c) => {
    const { cfg, ref } = await find(c);
    const home = await loadProjectHome(ref, cfg.types);
    const { project } = home;
    const request = await readFinalize(ref.dir);
    const final = project.docs.final ? await readDocText(ref.dir, project.docs.final).catch(() => null) : null;
    let proposal: FinalizeView['proposal'] = null;
    if (request?.state === 'proposed' && request.proposal) {
      const markdown = await readDocText(ref.dir, request.proposal.file).catch(() => null);
      if (markdown !== null) {
        // A proposal belongs to what it was written from: the draft, the items and the decisions. Once any of them
        // changes (even an accept that only redrew an item's data), it can't be accepted.
        const stale = (await finalInputsHash(ref.dir)) !== request.proposal.draftHash;
        proposal = { markdown, stale, diff: final === null ? null : diffText(final, markdown) };
      }
    }
    const exported = project.docs.exportedTo;
    const view: FinalizeView = {
      checklist: await finalizeChecklist(ref.dir, cfg.types),
      request,
      proposal,
      final: exported ? { exportedTo: exported, nextCommand: `writing-plans ${exported.path}` } : null,
      clones: await clonesOf(project, ctx.home),
      name: finalName(project.source.path),
      listening: rt.listeners.state(projectKey(ref.repo, ref.id)),
      changesSinceFinal: home.finalize.changesSinceFinal,
      planVersionSinceFinal: home.finalize.planVersionSinceFinal,
    };
    return c.json(view);
  }));

  // Start finalize. The request waits in the project folder until a listening window picks it up through dp_wait.
  r.post(base, handle(async (c) => {
    const { cfg, ref } = await find(c);
    const key = projectKey(ref.repo, ref.id);
    const request = await write(ref, () => requestFinalize(ref.dir, { types: cfg.types }));
    const listening = rt.listeners.state(key);
    rt.listeners.notify(key);
    return c.json({ request, listening, message: listening === null ? FINALIZE_NO_WINDOW : FINALIZE_WAITING });
  }));

  r.post(`${base}/accept`, handle(async (c) => {
    const body = await parse(c, acceptBody);
    const { cfg, ref } = await find(c);
    // Only a clone this project was opened from. acceptFinal then checks its remote and every path inside it.
    const clone = await knownClone(await readProjectFile(ref.dir), body.clone, ctx.home);
    const profile = cfg.repos.find((p) => p.name === ref.repo);
    if (!profile) throw new InputError(`There's no repo profile for ${ref.repo}. Add it in Settings → Repos.`);
    return c.json(await write(ref, () => acceptFinal({ dir: ref.dir, clone, profile, types: cfg.types, home: ctx.home })));
  }));

  r.post(`${base}/discard`, handle(async (c) => {
    const { ref } = await find(c);
    await write(ref, () => discardProposal(ref.dir));
    return c.json({ ok: true });
  }));

  return r;
}
