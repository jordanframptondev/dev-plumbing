import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import {
  expandHome,
  findProjects,
  listProjectSummaries,
  loadConfig,
  loadProjectHome,
  loadTypeItems,
  ProjectUnreadableError,
  readProjectDocument,
} from '@dev-plumbing/core';
import type { AppContext } from '../context';

const clampInt = (value: string | undefined, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const TABS = ['active', 'finalized', 'all'] as const;
const DOCS = ['original', 'draft', 'final'] as const;

export function projectRoutes(ctx: AppContext): Hono {
  const r = new Hono();

  async function locate(repo: string, id: string) {
    const cfg = await loadConfig(ctx.configDir);
    const refs = await findProjects(cfg.settings, cfg.repos, ctx.home);
    return { cfg, refs, ref: refs.find((x) => x.repo === repo && x.id === id) };
  }
  const notFound = { error: "That plumbing project doesn't exist." };

  r.get('/projects', async (c) => {
    const cfg = await loadConfig(ctx.configDir);
    const refs = await findProjects(cfg.settings, cfg.repos, ctx.home);
    const tab = TABS.find((t) => t === c.req.query('tab')) ?? 'active';
    return c.json(
      await listProjectSummaries(refs, {
        q: c.req.query('q') ?? '',
        tab,
        offset: clampInt(c.req.query('offset'), 0, 1_000_000, 0),
        limit: clampInt(c.req.query('limit'), 1, 200, cfg.settings.homePageSize),
      }),
    );
  });

  r.get('/projects/:repo/:id', async (c) => {
    const { cfg, ref } = await locate(c.req.param('repo'), c.req.param('id'));
    if (!ref) return c.json(notFound, 404);
    try {
      return c.json(await loadProjectHome(ref, cfg.types));
    } catch (e) {
      if (e instanceof ProjectUnreadableError) return c.json({ error: e.message }, 422);
      throw e;
    }
  });

  r.get('/projects/:repo/:id/types/:type', async (c) => {
    const { cfg, ref } = await locate(c.req.param('repo'), c.req.param('id'));
    if (!ref) return c.json(notFound, 404);
    try {
      const result = await loadTypeItems(ref, cfg.types, c.req.param('type'));
      return result ? c.json(result) : c.json({ error: "That plumbing type doesn't exist or is turned off." }, 404);
    } catch (e) {
      if (e instanceof ProjectUnreadableError) return c.json({ error: e.message }, 422);
      throw e;
    }
  });

  r.get('/projects/:repo/:id/docs/:which', async (c) => {
    const which = DOCS.find((d) => d === c.req.param('which'));
    if (!which) return c.json({ error: 'Unknown document.' }, 404);
    const { ref } = await locate(c.req.param('repo'), c.req.param('id'));
    if (!ref) return c.json(notFound, 404);
    try {
      return c.json({ text: await readProjectDocument(ref, which) });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 422);
    }
  });

  r.post('/open', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { target?: string; repo?: string; id?: string };
    if (body.target === 'config') {
      await ctx.open(ctx.configDir);
      return c.json({ ok: true });
    }
    if (body.target === 'source' && body.repo && body.id) {
      const { ref } = await locate(body.repo, body.id);
      if (!ref) return c.json(notFound, 404);
      const home = await loadProjectHome(ref, []).catch(() => null);
      if (!home) return c.json({ error: 'This plumbing project could not be read.' }, 422);
      const file = path.join(expandHome(home.project.source.clone, ctx.home), home.project.source.path);
      if (!(await fs.access(file).then(() => true, () => false))) return c.json({ error: `The plan isn't at ${file} any more.` }, 404);
      await ctx.open(file);
      return c.json({ ok: true });
    }
    return c.json({ error: 'Unknown target.' }, 400);
  });

  return r;
}
