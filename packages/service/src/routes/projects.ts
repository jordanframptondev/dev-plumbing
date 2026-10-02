import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono, type Context } from 'hono';
import {
  discoverProjects,
  expandHome,
  listProjectSummaries,
  loadConfig,
  loadProjectHome,
  loadTypeItems,
  readProjectDocument,
} from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { handle } from '../errors';
import { EXPECTED_OBJECT, readJsonObject } from '../json';
import { locateProject } from '../locate';
import { projectKey, type Runtime } from '../runtime';

const clampInt = (value: string | undefined, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const TABS = ['active', 'finalized', 'all'] as const;
const MARKDOWN = /\.(md|markdown)$/i;

/** `inner` is strictly inside `outer`: not equal to it, and not a sibling that only shares a prefix. */
const isInside = (outer: string, inner: string) => {
  const rel = path.relative(outer, inner);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};
const DOCS = ['original', 'draft', 'final'] as const;

export function projectRoutes(ctx: AppContext, rt: Runtime): Hono {
  const r = new Hono();

  r.get('/projects', handle(async (c) => {
    const cfg = await loadConfig(ctx.configDir);
    const { refs, problems } = await discoverProjects(cfg.settings, cfg.repos, ctx.home);
    const tab = TABS.find((t) => t === c.req.query('tab')) ?? 'active';
    const list = await listProjectSummaries(refs, {
      q: c.req.query('q') ?? '',
      tab,
      offset: clampInt(c.req.query('offset'), 0, 1_000_000, 0),
      limit: clampInt(c.req.query('limit'), 1, 200, cfg.settings.homePageSize),
    });
    const items = list.items.map((s) => ({ ...s, listening: rt.listeners.state(projectKey(s.repo, s.id)) }));
    return c.json({ items, total: list.total, problems });
  }));

  r.get('/projects/:repo/:id', handle(async (c) => {
    const { cfg, ref } = await locateProject(ctx, c.req.param('repo')!, c.req.param('id')!);
    const home = await loadProjectHome(ref, cfg.types);
    return c.json({ ...home, listening: rt.listeners.state(projectKey(ref.repo, ref.id)) });
  }));

  r.get('/projects/:repo/:id/types/:type', handle(async (c) => {
    const { cfg, ref } = await locateProject(ctx, c.req.param('repo')!, c.req.param('id')!);
    const result = await loadTypeItems(ref, cfg.types, c.req.param('type')!);
    return result ? c.json(result) : c.json({ error: "That plumbing type doesn't exist or is turned off." }, 404);
  }));

  r.get('/projects/:repo/:id/docs/:which', handle(async (c) => {
    const which = DOCS.find((d) => d === c.req.param('which'));
    if (!which) return c.json({ error: 'Unknown document.' }, 404);
    const { ref } = await locateProject(ctx, c.req.param('repo')!, c.req.param('id')!);
    try {
      return c.json({ text: await readProjectDocument(ref, which) });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 422);
    }
  }));

  /** Runs macOS `open`, and turns a failure into a readable error. */
  async function openWith(c: Context, target: string, what: string) {
    try {
      await ctx.open(target);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: `The ${what} couldn't be opened: ${(e as Error).message}` }, 500);
    }
  }

  r.post('/open', handle(async (c) => {
    const body = await readJsonObject(c);
    if (!body) return c.json(EXPECTED_OBJECT, 400);
    if (body.target === 'config') return openWith(c, ctx.configDir, 'config folder');
    if (body.target === 'source' && typeof body.repo === 'string' && typeof body.id === 'string' && body.repo && body.id) {
      const { ref } = await locateProject(ctx, body.repo, body.id);
      const home = await loadProjectHome(ref, []).catch(() => null);
      if (!home) return c.json({ error: 'This plumbing project could not be read.' }, 422);
      // project.json is a plain file anyone can edit, so only ever open a Markdown file inside the clone.
      const clone = expandHome(home.project.source.clone, ctx.home);
      const file = path.resolve(clone, home.project.source.path);
      const notInside = { error: 'The plan file must be inside the clone.' };
      if (!isInside(clone, file)) return c.json(notInside, 400);
      if (!(await fs.access(file).then(() => true, () => false))) return c.json({ error: `The plan isn't at ${file} any more.` }, 404);
      const [realClone, realFile] = await Promise.all([fs.realpath(clone), fs.realpath(file)]);
      if (!isInside(realClone, realFile)) return c.json(notInside, 400);
      const stat = await fs.stat(realFile);
      if (!stat.isFile() || !MARKDOWN.test(realFile)) return c.json({ error: 'The plan must be a Markdown file (.md or .markdown).' }, 400);
      return openWith(c, realFile, 'plan');
    }
    return c.json({ error: 'Unknown target.' }, 400);
  }));

  return r;
}
