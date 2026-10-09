import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ZodError } from 'zod';
import { writeFileAtomic, writeJsonAtomic } from './atomic';
import { DEFENSE_TYPE } from './defenseType';
import { PLAN_CHANGES_TYPE } from './planChanges';
import { parseRulesFile, resolveTypes, type RulesFileResult } from './rules';
import {
  agentsFields,
  parseAgents,
  parseSettings,
  repoProfileSchema,
  settingsFields,
  type AgentsConfig,
  type ConfigProblem,
  type FieldError,
  type FieldSpec,
  type PlumbingType,
  type RepoProfile,
  type Settings,
} from './schemas';

export type LoadedConfig = {
  dir: string;
  settings: Settings;
  agents: AgentsConfig;
  repos: RepoProfile[];
  types: PlumbingType[];
  outputs: string[];
  problems: ConfigProblem[];
};

/**
 * The built-in types, by id. Their ids are kept for them: a rules file of that id is reported and ignored, and the
 * built-in type is used.
 */
const RESERVED_TYPE_IDS = new Map<string, PlumbingType>([
  [PLAN_CHANGES_TYPE.id, PLAN_CHANGES_TYPE],
  [DEFENSE_TYPE.id, DEFENSE_TYPE],
]);

/** The built-in type whose id this is, or undefined. The service asks too, before it makes a new plumbing type. */
export function reservedType(id: string): PlumbingType | undefined {
  return RESERVED_TYPE_IDS.get(id);
}

/**
 * What's wrong with a rules file whose id (its file name) is a built-in type's, and what to do about it, or null. A
 * file's id must equal its name and the app can't rename or delete one, so it says how. loadConfig reports it, and
 * the service refuses to save such a file with it.
 */
export function reservedIdProblem(id: string): string | null {
  const reserved = reservedType(id);
  return reserved
    ? `The id "${id}" is kept for dev-plumbing's built-in ${reserved.title} type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file.`
    : null;
}

const isMissing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT';
const getErrorCode = (e: unknown) => (e as NodeJS.ErrnoException).code || 'UNKNOWN';

async function readText(file: string, label: string, problems: ConfigProblem[]): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (e) {
    if (isMissing(e)) return null;
    problems.push({ file: label, message: `This couldn't be read (${getErrorCode(e)}). Using the defaults until it's fixed.` });
    return null;
  }
}

async function listFiles(dir: string, ext: string, label: string, problems: ConfigProblem[]): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter((f) => f.endsWith(ext) && !f.startsWith('.')).sort();
  } catch (e) {
    if (isMissing(e)) return [];
    problems.push({ file: label, message: `This folder couldn't be read (${getErrorCode(e)}).` });
    return [];
  }
}

async function readJson(file: string, label: string, problems: ConfigProblem[]): Promise<unknown> {
  const text = await readText(file, label, problems);
  if (text === null) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    problems.push({ file: label, message: `This file isn't valid JSON (${(e as Error).message}). Using the defaults until it's fixed.` });
    return {};
  }
}

function fieldProblem(file: string, fields: readonly FieldSpec[], e: FieldError): ConfigProblem {
  if (e.unknown) return { file, key: e.key, message: 'Unknown setting. It is ignored.' };
  const field = fields.find((f) => f.key === e.key);
  return { file, key: e.key, message: `${e.message.replace(/\.$/, '')}. Using the default (${JSON.stringify(field?.default)}).` };
}

export const formatZodError = (error: ZodError) =>
  error.issues.map((i) => `${i.path.join('.') || 'file'}: ${i.message}`).join('; ');

export async function loadConfig(dir: string): Promise<LoadedConfig> {
  const problems: ConfigProblem[] = [];

  const settings = parseSettings(await readJson(path.join(dir, 'settings.json'), 'settings.json', problems));
  settings.errors.forEach((e) => problems.push(fieldProblem('settings.json', settingsFields, e)));

  const agents = parseAgents(await readJson(path.join(dir, 'agents.json'), 'agents.json', problems));
  agents.errors.forEach((e) => problems.push(fieldProblem('agents.json', agentsFields, e)));

  const repos: RepoProfile[] = [];
  for (const f of await listFiles(path.join(dir, 'repos'), '.json', 'repos', problems)) {
    const label = `repos/${f}`;
    const parsed = repoProfileSchema.safeParse(await readJson(path.join(dir, 'repos', f), label, problems));
    if (!parsed.success) {
      problems.push({ file: label, message: formatZodError(parsed.error) });
      continue;
    }
    if (repos.some((r) => r.name === parsed.data.name)) {
      problems.push({ file: label, message: `Another profile already uses the name "${parsed.data.name}". This one is ignored.` });
      continue;
    }
    repos.push(parsed.data);
  }

  const results: RulesFileResult[] = [];
  for (const f of await listFiles(path.join(dir, 'plumbing'), '.md', 'plumbing', problems)) {
    // A rules file's id is its file name, so plumbing/plan-changes.md or plumbing/defense.md would take a built-in
    // type's id. It's reported and ignored, unread, whatever is in it.
    const reserved = reservedIdProblem(f.replace(/\.md$/, ''));
    if (reserved) {
      problems.push({ file: `plumbing/${f}`, message: reserved });
      continue;
    }
    const fileContent = await readText(path.join(dir, 'plumbing', f), `plumbing/${f}`, problems);
    const parsed = parseRulesFile(f, fileContent ?? '');
    // A rules file is the user's, so it's never built in, whatever its header says.
    results.push(parsed.ok ? { ...parsed, type: { ...parsed.type, builtIn: false } } : parsed);
  }
  // Plan changes and Defense ship in code, and are always there.
  for (const builtIn of RESERVED_TYPE_IDS.values()) results.push({ ok: true, type: builtIn });
  const { types, errors } = resolveTypes(results);
  errors.forEach((e) => problems.push({ file: `plumbing/${e.file}`, message: e.error }));

  const outputs = await listFiles(path.join(dir, 'outputs'), '.md', 'outputs', problems);
  return { dir, settings: settings.value, agents: agents.value, repos, types, outputs, problems };
}

/** Copy every default file that doesn't exist yet. Never overwrites. */
export async function installDefaults(opts: { configDir: string; defaultsDir: string }): Promise<{ created: string[]; kept: string[] }> {
  const created: string[] = [];
  const kept: string[] = [];
  async function walk(rel: string): Promise<void> {
    for (const entry of await fs.readdir(path.join(opts.defaultsDir, rel), { withFileTypes: true })) {
      const r = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        await walk(r);
        continue;
      }
      const source = path.join(opts.defaultsDir, r);
      const target = path.join(opts.configDir, r);
      await fs.mkdir(path.dirname(target), { recursive: true });
      try {
        await fs.copyFile(source, target, fsConstants.COPYFILE_EXCL);
        created.push(r);
      } catch (e) {
        if (isMissing(e) || (e as NodeJS.ErrnoException).code === 'EEXIST') {
          kept.push(r);
        } else {
          throw e;
        }
      }
    }
  }
  await walk('');
  return { created, kept };
}

export async function resetToDefault(opts: { configDir: string; defaultsDir: string; file: string }): Promise<void> {
  const rel = path.normalize(opts.file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('That file is outside the config folder.');
  const source = path.join(opts.defaultsDir, rel);
  let data: string;
  try {
    data = await fs.readFile(source, 'utf8');
  } catch {
    throw new Error(`There is no default for ${opts.file}.`);
  }
  const target = path.join(opts.configDir, rel);
  await writeFileAtomic(target, data);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const describeErrors = (errors: FieldError[]) => errors.map((e) => `${e.key}: ${e.message}`).join('; ');

/**
 * Merges `patch` into settings.json. Refuses on invalid JSON or an invalid value of a known key.
 * Unknown keys (such as "_comment") don't block, and are kept exactly as they are.
 */
export async function updateSettingsFile(dir: string, patch: Partial<Settings>): Promise<Settings> {
  const file = path.join(dir, 'settings.json');
  let current: Record<string, unknown> = {};

  const text = await readText(file, 'settings.json', []);
  if (text !== null) {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new Error(`settings.json has problems (isn't valid JSON: ${(e as Error).message}). Fix it or reset it to the default, then try again.`);
    }
    if (isPlainObject(raw)) current = raw;

    const invalid = parseSettings(current).errors.filter((e) => !e.unknown);
    if (invalid.length) {
      throw new Error(`settings.json has problems (${describeErrors(invalid)}). Fix it or reset it to the default, then try again.`);
    }
  }

  const merged = { ...current, ...patch };
  const checked = parseSettings(merged);
  const invalid = checked.errors.filter((e) => !e.unknown);
  if (invalid.length) {
    throw new Error(`The updated settings have problems (${describeErrors(invalid)}). Please check your changes.`);
  }

  // Unknown keys keep their place and value; known keys take their checked (or default) value.
  await writeJsonAtomic(file, { ...merged, ...checked.value });
  return checked.value;
}
