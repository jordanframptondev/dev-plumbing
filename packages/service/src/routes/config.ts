import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import {
  agentsFields,
  findProjects,
  flatten,
  formatZodError,
  lastDetected,
  loadConfig,
  newRulesFileTemplate,
  parseAgents,
  parseFields,
  parseRulesFile,
  parseSettings,
  pendingDetect,
  repoProfileSchema,
  requestDetect,
  reservedIdProblem,
  reservedType,
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
import { projectKey, type Runtime } from '../runtime';

const FILE = /^[a-z][a-z0-9-]*\.md$/;
const NAME = /^[a-z0-9][a-z0-9._-]*$/i;
const exists = (p: string) => fs.access(p).then(() => true, () => false);
/** The rules files you can edit and turn on or off. Built-in types (Plan changes) ship in code, so they aren't listed. */
const summaries = (types: PlumbingType[]): RuleSummary[] =>
  types.filter((t) => !t.builtIn).map((t) => ({ file: t.file, id: t.id, title: t.title, order: t.order, screen: t.screen, enabled: t.enabled }));

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

export function configRoutes(ctx: AppContext, rt: Runtime): Hono {
  const r = new Hono();
  const changed = () => rt.events.emit({ type: 'config' });

  r.get('/config', async (c) => {
    const cfg = await loadConfig(ctx.configDir);
    // Detect again: the profiles waiting for detection, and when each was last detected.
    const pending: string[] = [];
    for (const p of cfg.repos) if (await pendingDetect(ctx.configDir, p.name)) pending.push(p.name);
    const detect = { pending, last: await lastDetected(ctx.configDir) };
    return c.json({ dir: cfg.dir, settings: cfg.settings, agents: cfg.agents, repos: cfg.repos, types: summaries(cfg.types), outputs: cfg.outputs, problems: cfg.problems, detect });
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
    changed();
    return c.json({ value, restartRequired: before.port !== value.port, ...(loginItemError ? { loginItemError } : {}) });
  });

  r.put('/agents', async (c) => {
    const body = await readJsonObject(c);
    if (!body) return c.json(EXPECTED_OBJECT, 400);
    const merged = await mergeIntoFile(path.join(ctx.configDir, 'agents.json'), agentsFields, body);
    if (!merged.ok) return c.json({ error: 'Some agent settings are not valid.', errors: merged.errors }, 400);
    changed();
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
    // Detect again's merge reads, merges and writes this file under the same lock, so a save never lands in between.
    await rt.withLock('config:repos', () => writeJsonAtomic(path.join(ctx.configDir, 'repos', `${name}.json`), parsed.data));
    changed();
    return c.json({ value: parsed.data });
  });

  r.post('/repos/:name/detect', async (c) => {
    const name = c.req.param('name');
    const cfg = await loadConfig(ctx.configDir);
    if (!NAME.test(name) || !cfg.repos.some((p) => p.name === name)) return c.json({ error: 'Unknown repo profile.' }, 404);
    await rt.withLock('config:repos', async () => {
      await requestDetect(ctx.configDir, name);
      // A new request: it's handed out again, even to a window that came back from an earlier one.
      rt.detects.delete(name);
    });
    // Wake the windows listening on this repo's projects, so detection starts now, not at their next poll.
    for (const ref of await findProjects(cfg.settings, cfg.repos, ctx.home)) {
      if (ref.repo === name) rt.listeners.notify(projectKey(ref.repo, ref.id));
    }
    changed();
    return c.json({ ok: true });
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
    // Plan changes and Defense keep their ids: loadConfig would only report a rules file that took one.
    const builtIn = reservedType(id);
    if (builtIn) return c.json({ error: `The id "${id}" is kept for dev-plumbing's built-in ${builtIn.title} type. Pick another.` }, 400);
    if (!title) return c.json({ error: 'Give the plumbing type a title.' }, 400);
    const file = `${id}.md`;
    const target = path.join(ctx.configDir, 'plumbing', file);
    if (await exists(target)) return c.json({ error: `${file} already exists.` }, 409);
    const cfg = await loadConfig(ctx.configDir);
    // After the rules files you have. Built-in types (Defense's order is 100) don't count.
    const order = Math.max(0, ...cfg.types.filter((t) => !t.builtIn).map((t) => t.order)) + 1;
    await writeFileAtomic(target, newRulesFileTemplate(id, title, order));
    changed();
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
      // plumbing/plan-changes.md and plumbing/defense.md stay ignored whatever they say, so saving one is refused with
      // what to do instead.
      const reserved = folder === 'plumbing' ? reservedIdProblem(file.replace(/\.md$/, '')) : null;
      if (reserved) return c.json({ error: reserved }, 400);
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
      changed();
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
      if (loginItemError) {
        changed();
        return c.json({ ok: true, loginItemError });
      }
    }
    changed();
    return c.json({ ok: true });
  });

  return r;
}
