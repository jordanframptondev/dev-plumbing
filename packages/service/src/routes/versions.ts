import { Hono, type Context } from 'hono';
import { currentVersion, diffText, listLeftovers, projectVersions, readProjectFile, readVersionDoc, removeLeftover, type VersionsView, type VersionSummary } from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { handle } from '../errors';
import { locateProject } from '../locate';
import { projectKey, type Runtime } from '../runtime';

const DOCS = ['original', 'draft'] as const;
const UNKNOWN_DOC = { error: 'Unknown document.' };
const UNKNOWN_VERSION = { error: "That version doesn't exist." };
const MISSING = { error: "That version's document is missing from the project folder." };

/** A version number from the URL: a whole number from 1, or null. */
const versionNumber = (value: string | undefined) => (value && /^[1-9][0-9]{0,5}$/.test(value) ? Number(value) : null);

/**
 * Documents → Versions: every version of the plan a project went through, each one's plan and draft, a diff of two, and
 * the folders updates that didn't finish left behind, which you can remove.
 */
export function versionRoutes(ctx: AppContext, rt: Runtime): Hono {
  const r = new Hono();
  const base = '/projects/:repo/:id/versions';
  /** The project, and its versions oldest first (v1 synthesised for a project that was never updated). */
  const find = async (c: Context) => {
    const { ref } = await locateProject(ctx, c.req.param('repo')!, c.req.param('id')!);
    const project = await readProjectFile(ref.dir);
    return { dir: ref.dir, project, numbers: new Set(projectVersions(project).map((v) => v.n)) };
  };

  r.get(base, handle(async (c) => {
    const { dir, project } = await find(c);
    const current = currentVersion(project).n;
    const versions: VersionSummary[] = projectVersions(project)
      .map((v) => ({ ...v, current: v.n === current }))
      .reverse();
    const view: VersionsView = { versions, leftovers: await listLeftovers(dir) };
    return c.json(view);
  }));

  // Removes one folder an update that didn't finish left in docs/versions. removeLeftover refuses anything else with a
  // StoreError, which is a 404.
  r.delete(`${base}/leftovers/:name`, handle(async (c) => {
    const { ref } = await locateProject(ctx, c.req.param('repo')!, c.req.param('id')!);
    await rt.withLock(projectKey(ref.repo, ref.id), () => removeLeftover(ref.dir, c.req.param('name')!));
    rt.events.projectChanged(ref.repo, ref.id);
    return c.json({ ok: true });
  }));

  r.get(`${base}/compare`, handle(async (c) => {
    const which = DOCS.find((d) => d === c.req.query('which'));
    if (!which) return c.json(UNKNOWN_DOC, 404);
    const { dir, project, numbers } = await find(c);
    const from = versionNumber(c.req.query('from'));
    const to = versionNumber(c.req.query('to'));
    if (from === null || to === null || !numbers.has(from) || !numbers.has(to)) return c.json(UNKNOWN_VERSION, 404);
    const [before, after] = await Promise.all([readVersionDoc(dir, project, from, which), readVersionDoc(dir, project, to, which)]);
    if (before === null || after === null) return c.json(MISSING, 404);
    return c.json({ segments: diffText(before, after) });
  }));

  // What the update that brought version n in did to the draft: the draft before it against the draft as merged.
  r.get(`${base}/:n/update-diff`, handle(async (c) => {
    const { dir, project, numbers } = await find(c);
    const n = versionNumber(c.req.param('n'));
    if (n === null || !numbers.has(n)) return c.json(UNKNOWN_VERSION, 404);
    if (n === 1) return c.json({ error: 'v1 is the import, so no update changed its draft.' }, 404);
    const [before, after] = await Promise.all([readVersionDoc(dir, project, n - 1, 'draft'), readVersionDoc(dir, project, n, 'merged')]);
    if (before === null || after === null) return c.json(MISSING, 404);
    return c.json({ segments: diffText(before, after) });
  }));

  r.get(`${base}/:n/:which`, handle(async (c) => {
    const which = DOCS.find((d) => d === c.req.param('which'));
    if (!which) return c.json(UNKNOWN_DOC, 404);
    const { dir, project, numbers } = await find(c);
    const n = versionNumber(c.req.param('n'));
    if (n === null || !numbers.has(n)) return c.json(UNKNOWN_VERSION, 404);
    return c.json({ text: await readVersionDoc(dir, project, n, which) });
  }));

  return r;
}
