import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic } from '../atomic';
import { expandHome } from '../paths';
import { normalizeRemote, plumbingProjectSchema, titleFromMarkdown, type PlumbingProject, type RepoProfile, type Settings } from '../schemas';
import { InputError, readJsonFile, writeProjectFile } from './io';

export class PlanError extends InputError {}

const exists = (p: string) => fs.access(p).then(() => true, () => false);

export function matchProfile(remote: string | null, profiles: RepoProfile[]): RepoProfile | undefined {
  if (!remote) return undefined;
  const r = normalizeRemote(remote);
  return profiles.find((p) => p.match.some((m) => normalizeRemote(m) === r));
}

export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'plan';
}

/** A short name for a new repo profile: the remote's repo name, or the clone folder's name. */
export function suggestRepoName(remote: string | null, root: string): string {
  const fromRemote = remote ? normalizeRemote(remote).split('/').pop() : undefined;
  return slugify(fromRemote || path.basename(root));
}

/** Where a repo's plumbing projects live: its profile's folder, or <settings.projectsFolder>/<repo>. */
export function repoProjectsFolder(settings: Settings, profile: RepoProfile, home?: string): string {
  return profile.projectsFolder ? expandHome(profile.projectsFolder, home) : path.join(expandHome(settings.projectsFolder, home), profile.name);
}

export function tildify(p: string, home: string = os.homedir()): string {
  return p === home ? '~' : p.startsWith(home + path.sep) ? `~/${p.slice(home.length + 1)}` : p;
}

/**
 * The plan file, relative to the clone root. It must be a Markdown file inside the clone.
 * Paths are compared as real paths: git reports the clone's real path, while the window's folder may come through a symlink.
 */
export async function resolvePlan(o: { root: string; cwd: string; plan: string }): Promise<{ rel: string; text: string }> {
  const real = (p: string) => fs.realpath(p).catch(() => p);
  const cwd = await real(o.cwd);
  const abs = await real(path.resolve(cwd, o.plan));
  const rel = path.relative(await real(o.root), abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new PlanError(`The plan must be inside the repo (${o.root}).`);
  const relPosix = rel.split(path.sep).join('/');
  if (!/\.(md|markdown)$/i.test(abs)) throw new PlanError('The plan must be a Markdown file (.md or .markdown).');
  let text: string;
  try {
    text = await fs.readFile(abs, 'utf8');
  } catch {
    throw new PlanError(`There's no plan at ${relPosix}.`);
  }
  if (!text.trim()) throw new PlanError(`${relPosix} is empty.`);
  return { rel: relPosix, text };
}

async function findBySource(folder: string, rel: string): Promise<string | null> {
  let names: string[] = [];
  try {
    names = (await fs.readdir(folder)).filter((n) => !n.startsWith('.')).sort();
  } catch {
    return null;
  }
  for (const name of names) {
    const r = await readJsonFile(path.join(folder, name, 'project.json'));
    const parsed = r.ok ? plumbingProjectSchema.safeParse(r.value) : null;
    if (parsed?.success && parsed.data.source.path === rel) return name;
  }
  return null;
}

/**
 * Reopens the plumbing project for this plan (matched by its path in the repo, so any clone finds it), or
 * creates one. Creating copies the plan into docs/original.md and docs/draft.md, and queues every enabled
 * plumbing type for import. project.json is written last, so a crash never leaves a half-made project that looks whole.
 */
export async function openPlan(o: {
  folder: string;
  repo: string;
  clone: string;
  branch: string;
  plan: { rel: string; text: string };
  enabledTypes: string[];
  home?: string;
  now?: Date;
}): Promise<{ id: string; dir: string; created: boolean }> {
  const existing = await findBySource(o.folder, o.plan.rel);
  if (existing) return { id: existing, dir: path.join(o.folder, existing), created: false };
  const base = slugify(path.basename(o.plan.rel).replace(/\.(md|markdown)$/i, ''));
  let id = base;
  for (let n = 2; await exists(path.join(o.folder, id)); n++) id = `${base}-${n}`;
  const dir = path.join(o.folder, id);
  const at = (o.now ?? new Date()).toISOString();
  await writeFileAtomic(path.join(dir, 'docs', 'original.md'), o.plan.text);
  await writeFileAtomic(path.join(dir, 'docs', 'draft.md'), o.plan.text);
  const project: PlumbingProject = {
    id,
    repo: o.repo,
    title: titleFromMarkdown(o.plan.text) ?? base,
    source: { path: o.plan.rel, clone: tildify(o.clone, o.home), branch: o.branch, hashAtImport: createHash('sha256').update(o.plan.text).digest('hex') },
    docs: { original: 'docs/original.md', draft: 'docs/draft.md' },
    status: o.enabledTypes.length ? 'importing' : 'active',
    emptyTypes: [],
    importPending: o.enabledTypes,
    createdAt: at,
    updatedAt: at,
  };
  await writeProjectFile(dir, project);
  return { id, dir, created: true };
}

/**
 * Spec §6.3: a link named linkName in the clone pointing at the projects folder, hidden from git through
 * .git/info/exclude. Never replaces a real file or folder with that name.
 */
export async function linkIntoClone(o: { clone: string; excludeFile: string; folder: string; linkName: string }): Promise<'created' | 'exists' | 'blocked'> {
  const link = path.resolve(o.clone, o.linkName);
  if (path.dirname(link) !== path.resolve(o.clone)) return 'blocked';
  const stat = await fs.lstat(link).catch(() => null);
  let result: 'created' | 'exists';
  if (!stat) {
    await fs.mkdir(o.folder, { recursive: true });
    await fs.symlink(o.folder, link);
    result = 'created';
  } else if (stat.isSymbolicLink() && path.resolve(o.clone, await fs.readlink(link)) === path.resolve(o.folder)) {
    result = 'exists';
  } else {
    return 'blocked';
  }
  const line = `/${o.linkName}`;
  const current = await fs.readFile(o.excludeFile, 'utf8').catch(() => '');
  if (!current.split('\n').some((l) => l.trim() === line)) {
    await writeFileAtomic(o.excludeFile, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${line}\n`);
  }
  return result;
}
