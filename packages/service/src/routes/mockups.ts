import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Hono, type Context, type Handler } from 'hono';
import { dataKindOf, openOptions, parseData, readItem, readThread, StoreError, type LoadedConfig, type MockupKitInfo, type ProjectRef } from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { handle } from '../errors';
import { locateProject } from '../locate';
import { kitFor, markupOf, mockupCsp, mockupDocument } from '../mockup';

const SIDES = ['after', 'before'] as const;
const sideOf = (c: Context) => SIDES.find((s) => s === c.req.param('side'));
const NO_SIDE = { error: 'A mockup side is after or before.' };

/** A mockup document with a fresh nonce and its own CSP. Kit warnings stay out of it: the app gets them from mockup-kit. */
function mockupResponse(c: Context, o: { body: string; kitCss: string; title: string }): Response {
  const nonce = randomBytes(16).toString('base64');
  return c.body(mockupDocument({ ...o, nonce }), 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': mockupCsp(nonce),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
}

export function mockupRoutes(ctx: AppContext): Hono {
  const r = new Hono();
  const find = (c: Context) => locateProject(ctx, c.req.param('repo')!, c.req.param('id')!);
  const kindOf = (cfg: LoadedConfig, typeId: string) => {
    const type = cfg.types.find((t) => t.id === typeId);
    return type ? dataKindOf(type) : null;
  };

  /** The item and its project, when the item's plumbing type draws mockups. */
  async function uiItem(c: Context) {
    const { cfg, ref } = await find(c);
    const item = await readItem(ref.dir, c.req.param('itemId')!);
    if (kindOf(cfg, item.type) !== 'mockups') throw new StoreError(`${item.title} isn't a UI item, so it has no mockup.`);
    return { cfg, ref, item };
  }

  /**
   * The mockup data an open option proposes: its change's patch for a mockups item, the thread's own item first.
   * Null when the option is unknown or closed, or proposes no mockup.
   */
  async function proposal(c: Context, cfg: LoadedConfig, ref: ProjectRef) {
    const thread = await readThread(ref.dir, c.req.param('threadId')!);
    const option = openOptions(thread)?.options.find((o) => o.id === c.req.param('optionId'));
    const entries = (option?.change?.items ?? []).filter((e) => e.patch.data !== undefined);
    const ordered = [...entries.filter((e) => e.itemId === thread.itemId), ...entries.filter((e) => e.itemId !== thread.itemId)];
    for (const e of ordered) {
      const item = await readItem(ref.dir, e.itemId).catch(() => null);
      if (item && kindOf(cfg, item.type) === 'mockups') return { item, data: e.patch.data };
    }
    return null;
  }

  r.get('/projects/:repo/:id/items/:itemId/mockup/:side', handle(async (c) => {
    const side = sideOf(c);
    if (!side) return c.json(NO_SIDE, 404);
    const { cfg, ref, item } = await uiItem(c);
    const body = markupOf(item.data, side);
    if (body === null) return c.json({ error: `${item.title} has no ${side === 'after' ? 'After' : 'Before'} mockup yet.` }, 404);
    const kit = await kitFor({ ctx, cfg, ref, data: item.data });
    return mockupResponse(c, { body, kitCss: kit.css, title: item.title });
  }));

  r.get('/projects/:repo/:id/items/:itemId/mockup-kit', handle(async (c) => {
    const { cfg, ref, item } = await uiItem(c);
    const { app, files, warnings } = await kitFor({ ctx, cfg, ref, data: item.data });
    return c.json({ app, files, warnings } satisfies MockupKitInfo);
  }));

  // What a thread option would draw, before it's accepted ("View proposed" in the thread view).
  r.get('/projects/:repo/:id/threads/:threadId/options/:optionId/mockup/:side', handle(async (c) => {
    const side = sideOf(c);
    if (!side) return c.json(NO_SIDE, 404);
    const { cfg, ref } = await find(c);
    const found = await proposal(c, cfg, ref);
    if (!found) return c.json({ error: "That option isn't open on this thread, or it doesn't propose a mockup." }, 404);
    // Proposals aren't accepted yet, so they're held to the write rules: only data that would be saved is drawn.
    const parsed = parseData('mockups', found.data);
    if (!parsed.ok) return c.json({ error: `The proposed mockup can't be drawn: ${parsed.problems.join(' ')}` }, 404);
    const body = markupOf(parsed.data, side);
    if (body === null) return c.json({ error: `The option proposes no ${side === 'after' ? 'After' : 'Before'} mockup.` }, 404);
    const kit = await kitFor({ ctx, cfg, ref, data: parsed.data });
    return mockupResponse(c, { body, kitCss: kit.css, title: `${found.item.title} (proposed)` });
  }));

  return r;
}

let tailwind: Promise<string> | null = null;
/** The @tailwindcss/browser build from the service's own node_modules, read once. Mockups never load it from a CDN. */
function tailwindScript(): Promise<string> {
  tailwind ??= fs.readFile(createRequire(import.meta.url).resolve('@tailwindcss/browser'), 'utf8').catch((e: unknown) => {
    tailwind = null;
    throw e;
  });
  return tailwind;
}

/** GET /kit/tailwind.js. It's outside /api/ because a sandboxed mockup frame has no origin, so it has no way past the guard. */
export const kitScript: Handler = async (c) => {
  const js = await tailwindScript().catch(() => null);
  if (js === null) return c.text("The Tailwind compiler for mockups isn't installed. Run pnpm install.", 503);
  return c.body(js, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
};
