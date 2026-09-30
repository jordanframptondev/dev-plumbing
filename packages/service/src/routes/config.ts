import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import {
  formatZodError,
  loadConfig,
  newRulesFileTemplate,
  parseAgents,
  parseRulesFile,
  parseSettings,
  repoProfileSchema,
  resetToDefault,
  writeFileAtomic,
  writeJsonAtomic,
  type PlumbingType,
  type RuleSummary,
} from '@dev-plumbing/core';
import type { AppContext } from '../context';

const FILE = /^[a-z][a-z0-9-]*\.md$/;
const NAME = /^[a-z0-9][a-z0-9._-]*$/i;
const exists = (p: string) => fs.access(p).then(() => true, () => false);
const summaries = (types: PlumbingType[]): RuleSummary[] =>
  types.map((t) => ({ file: t.file, id: t.id, title: t.title, order: t.order, screen: t.screen, enabled: t.enabled }));

export function configRoutes(ctx: AppContext): Hono {
  const r = new Hono();

  r.get('/config', async (c) => {
    const cfg = await loadConfig(ctx.configDir);
    return c.json({ dir: cfg.dir, settings: cfg.settings, agents: cfg.agents, repos: cfg.repos, types: summaries(cfg.types), outputs: cfg.outputs, problems: cfg.problems });
  });

  r.put('/settings', async (c) => {
    const parsed = parseSettings(await c.req.json().catch(() => null));
    if (parsed.errors.length) return c.json({ error: 'Some settings are not valid.', errors: parsed.errors }, 400);
    const before = (await loadConfig(ctx.configDir)).settings;
    await writeJsonAtomic(path.join(ctx.configDir, 'settings.json'), parsed.value);
    if (before.startAtLogin !== parsed.value.startAtLogin) {
      await (parsed.value.startAtLogin ? ctx.loginItem.enable() : ctx.loginItem.disable());
    }
    return c.json({ value: parsed.value, restartRequired: before.port !== parsed.value.port });
  });

  r.put('/agents', async (c) => {
    const parsed = parseAgents(await c.req.json().catch(() => null));
    if (parsed.errors.length) return c.json({ error: 'Some agent settings are not valid.', errors: parsed.errors }, 400);
    await writeJsonAtomic(path.join(ctx.configDir, 'agents.json'), parsed.value);
    return c.json({ value: parsed.value });
  });

  r.put('/repos/:name', async (c) => {
    const name = c.req.param('name');
    if (!NAME.test(name)) return c.json({ error: 'Unknown repo profile.' }, 404);
    const parsed = repoProfileSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: formatZodError(parsed.error) }, 400);
    if (parsed.data.name !== name) return c.json({ error: `The profile's name must stay "${name}".` }, 400);
    await writeJsonAtomic(path.join(ctx.configDir, 'repos', `${name}.json`), parsed.data);
    return c.json({ value: parsed.data });
  });

  r.get('/rules', async (c) => {
    const cfg = await loadConfig(ctx.configDir);
    const broken = cfg.problems
      .filter((p) => p.file.startsWith('plumbing/'))
      .map((p) => ({ file: p.file.slice('plumbing/'.length), error: p.message }));
    return c.json({ types: summaries(cfg.types), broken, outputs: cfg.outputs });
  });

  r.post('/rules', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { id?: unknown; title?: unknown };
    const id = String(body.id ?? '').trim();
    const title = String(body.title ?? '').trim();
    if (!/^[a-z][a-z0-9-]*$/.test(id)) return c.json({ error: 'Use lowercase letters, numbers and dashes for the id, starting with a letter.' }, 400);
    if (!title) return c.json({ error: 'Give the plumbing type a title.' }, 400);
    const file = `${id}.md`;
    const target = path.join(ctx.configDir, 'plumbing', file);
    if (await exists(target)) return c.json({ error: `${file} already exists.` }, 409);
    const cfg = await loadConfig(ctx.configDir);
    const order = Math.max(0, ...cfg.types.map((t) => t.order)) + 1;
    await writeFileAtomic(target, newRulesFileTemplate(id, title, order));
    return c.json({ file }, 201);
  });

  for (const [segment, folder] of [['rules', 'plumbing'], ['outputs', 'outputs']] as const) {
    r.get(`/${segment}/:file`, async (c) => {
      const file = c.req.param('file');
      if (!FILE.test(file)) return c.json({ error: 'Unknown file.' }, 404);
      const target = path.join(ctx.configDir, folder, file);
      if (!(await exists(target))) return c.json({ error: `${file} doesn't exist.` }, 404);
      return c.json({ text: await fs.readFile(target, 'utf8'), hasDefault: await exists(path.join(ctx.defaultsDir, folder, file)) });
    });

    r.put(`/${segment}/:file`, async (c) => {
      const file = c.req.param('file');
      if (!FILE.test(file)) return c.json({ error: 'Unknown file.' }, 404);
      const target = path.join(ctx.configDir, folder, file);
      if (!(await exists(target))) return c.json({ error: `${file} doesn't exist.` }, 404);
      const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
      if (typeof body.text !== 'string' || !body.text.trim()) return c.json({ error: 'The file is empty.' }, 400);
      if (folder === 'plumbing') {
        const parsed = parseRulesFile(file, body.text);
        if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      }
      await writeFileAtomic(target, body.text);
      return c.json({ ok: true });
    });
  }

  r.post('/reset', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { file?: unknown };
    if (typeof body.file !== 'string') return c.json({ error: 'Say which file to reset.' }, 400);
    try {
      await resetToDefault({ configDir: ctx.configDir, defaultsDir: ctx.defaultsDir, file: body.file });
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  return r;
}
