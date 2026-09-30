import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import {
  agentsFields,
  flatten,
  formatZodError,
  loadConfig,
  newRulesFileTemplate,
  parseAgents,
  parseFields,
  parseRulesFile,
  parseSettings,
  repoProfileSchema,
  resetToDefault,
  settingsFields,
  unflatten,
  writeFileAtomic,
  writeJsonAtomic,
  type FieldError,
  type FieldSpec,
  type PlumbingType,
  type RuleSummary,
} from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { EXPECTED_OBJECT, readJsonObject } from '../json';

const FILE = /^[a-z][a-z0-9-]*\.md$/;
const NAME = /^[a-z0-9][a-z0-9._-]*$/i;
const exists = (p: string) => fs.access(p).then(() => true, () => false);
const summaries = (types: PlumbingType[]): RuleSummary[] =>
  types.map((t) => ({ file: t.file, id: t.id, title: t.title, order: t.order, screen: t.screen, enabled: t.enabled }));

/** A JSON config file as a flat map. A missing file, or one that isn't a JSON object, reads as {}. */
async function readFlat(file: string): Promise<Record<string, unknown>> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? flatten(raw) : {};
  } catch {
    return {};
  }
}

type Merged = { ok: true; before: Record<string, unknown>; after: Record<string, unknown> } | { ok: false; errors: FieldError[] };

/**
 * PUT for settings.json and agents.json. Every key in the body must be a known field with a valid value,
 * or nothing is written. The body is merged onto the file as it is, so untouched fields (even broken ones)
 * and unknown keys such as "_comment" stay exactly as they were. An empty body writes nothing.
 */
async function mergeIntoFile(file: string, fields: readonly FieldSpec[], body: Record<string, unknown>): Promise<Merged> {
  const checked = parseFields(fields, body);
  if (checked.errors.length) return { ok: false, errors: checked.errors };
  const checkedFlat = flatten(checked.value);
  const updates = Object.fromEntries(Object.keys(flatten(body)).map((key) => [key, checkedFlat[key]]));
  const flatRaw = await readFlat(file);
  const before = unflatten(flatRaw);
  if (Object.keys(updates).length === 0) return { ok: true, before, after: before };
  const after = unflatten({ ...flatRaw, ...updates });
  await writeJsonAtomic(file, after);
  return { ok: true, before, after };
}

export function configRoutes(ctx: AppContext): Hono {
  const r = new Hono();

  r.get('/config', async (c) => {
    const cfg = await loadConfig(ctx.configDir);
    return c.json({ dir: cfg.dir, settings: cfg.settings, agents: cfg.agents, repos: cfg.repos, types: summaries(cfg.types), outputs: cfg.outputs, problems: cfg.problems });
  });

  /** Makes the login item match startAtLogin. Returns a message if it couldn't; the settings stay saved either way. */
  async function reconcileLoginItem(startAtLogin: boolean): Promise<string | undefined> {
    try {
      const enabled = await ctx.loginItem.isEnabled();
      if (startAtLogin && !enabled) await ctx.loginItem.enable();
      if (!startAtLogin && enabled) await ctx.loginItem.disable();
      return undefined;
    } catch (e) {
      return `Your settings were saved, but start at login couldn't be turned ${startAtLogin ? 'on' : 'off'}: ${(e as Error).message}`;
    }
  }

  r.put('/settings', async (c) => {
    const body = await readJsonObject(c);
    if (!body) return c.json(EXPECTED_OBJECT, 400);
    const merged = await mergeIntoFile(path.join(ctx.configDir, 'settings.json'), settingsFields, body);
    if (!merged.ok) return c.json({ error: 'Some settings are not valid.', errors: merged.errors }, 400);
    const before = parseSettings(merged.before).value;
    const value = parseSettings(merged.after).value;
    const loginItemError = await reconcileLoginItem(value.startAtLogin);
    return c.json({ value, restartRequired: before.port !== value.port, ...(loginItemError ? { loginItemError } : {}) });
  });

  r.put('/agents', async (c) => {
    const body = await readJsonObject(c);
    if (!body) return c.json(EXPECTED_OBJECT, 400);
    const merged = await mergeIntoFile(path.join(ctx.configDir, 'agents.json'), agentsFields, body);
    if (!merged.ok) return c.json({ error: 'Some agent settings are not valid.', errors: merged.errors }, 400);
    return c.json({ value: parseAgents(merged.after).value });
  });

  r.put('/repos/:name', async (c) => {
    const name = c.req.param('name');
    if (!NAME.test(name)) return c.json({ error: 'Unknown repo profile.' }, 404);
    const body = await readJsonObject(c);
    if (!body) return c.json(EXPECTED_OBJECT, 400);
    const parsed = repoProfileSchema.safeParse(body);
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
    const body = await readJsonObject(c);
    if (!body) return c.json(EXPECTED_OBJECT, 400);
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
      const body = await readJsonObject(c);
      if (!body) return c.json(EXPECTED_OBJECT, 400);
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
    const body = await readJsonObject(c);
    if (!body) return c.json(EXPECTED_OBJECT, 400);
    if (typeof body.file !== 'string') return c.json({ error: 'Say which file to reset.' }, 400);
    try {
      await resetToDefault({ configDir: ctx.configDir, defaultsDir: ctx.defaultsDir, file: body.file });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
    if (path.normalize(body.file) === 'settings.json') {
      const loginItemError = await reconcileLoginItem((await loadConfig(ctx.configDir)).settings.startAtLogin);
      if (loginItemError) return c.json({ ok: true, loginItemError });
    }
    return c.json({ ok: true });
  });

  return r;
}
