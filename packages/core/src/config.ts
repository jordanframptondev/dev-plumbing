import fs from 'node:fs/promises';
import path from 'node:path';
import type { ZodError } from 'zod';
import { writeJsonAtomic } from './atomic';
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

const isMissing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT';

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
  }
}

async function listFiles(dir: string, ext: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter((f) => f.endsWith(ext) && !f.startsWith('.')).sort();
  } catch (e) {
    if (isMissing(e)) return [];
    throw e;
  }
}

async function readJson(file: string, label: string, problems: ConfigProblem[]): Promise<unknown> {
  const text = await readText(file);
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
  return { file, key: e.key, message: `${e.message}. Using the default (${JSON.stringify(field?.default)}).` };
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
  for (const f of await listFiles(path.join(dir, 'repos'), '.json')) {
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
  for (const f of await listFiles(path.join(dir, 'plumbing'), '.md')) {
    results.push(parseRulesFile(f, (await readText(path.join(dir, 'plumbing', f))) ?? ''));
  }
  const { types, errors } = resolveTypes(results);
  errors.forEach((e) => problems.push({ file: `plumbing/${e.file}`, message: e.error }));

  const outputs = await listFiles(path.join(dir, 'outputs'), '.md');
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
      const target = path.join(opts.configDir, r);
      try {
        await fs.access(target);
        kept.push(r);
      } catch {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(path.join(opts.defaultsDir, r), target);
        created.push(r);
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
  try {
    await fs.access(source);
  } catch {
    throw new Error(`There is no default for ${opts.file}.`);
  }
  await fs.mkdir(path.dirname(path.join(opts.configDir, rel)), { recursive: true });
  await fs.copyFile(source, path.join(opts.configDir, rel));
}

export async function updateSettingsFile(dir: string, patch: Partial<Settings>): Promise<Settings> {
  const { settings } = await loadConfig(dir);
  const checked = parseSettings({ ...settings, ...patch });
  if (checked.errors.length) throw new Error(checked.errors.map((e) => `${e.key}: ${e.message}`).join('; '));
  await writeJsonAtomic(path.join(dir, 'settings.json'), checked.value);
  return checked.value;
}
