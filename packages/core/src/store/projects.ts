import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { expandHome } from '../paths';
import { docPath, readItems, readJsonFile, readThreads } from './io';
import {
  countThreads,
  displayStatus,
  plumbingProjectSchema,
  type DiscoveryProblem,
  type InboxEntry,
  type PlumbingProject,
  type PlumbingType,
  type ProjectHome,
  type ProjectSummary,
  type RepoProfile,
  type Settings,
  type TypeEntry,
  type TypeItemRow,
} from '../schemas';

export type ProjectRef = { repo: string; id: string; dir: string };
export class ProjectUnreadableError extends Error {}

const exists = (p: string) => fs.access(p).then(() => true, () => false);

/** Sub-folder names, following symlinks to folders. An error code if the folder itself can't be listed. */
async function readSubdirs(dir: string): Promise<{ names: string[]; error?: string }> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    return { names: [], error: (e as NodeJS.ErrnoException).code ?? 'UNKNOWN' };
  }
  const names: string[] = [];
  for (const d of entries) {
    if (d.name.startsWith('.')) continue;
    if (d.isDirectory()) names.push(d.name);
    else if (d.isSymbolicLink()) {
      const target = await fs.stat(path.join(dir, d.name)).catch(() => null);
      if (target?.isDirectory()) names.push(d.name);
    }
  }
  return { names: names.sort() };
}

function folderProblem(code: string): string {
  if (code === 'ENOENT') return "doesn't exist";
  if (code === 'ENOTDIR') return "isn't a folder";
  if (code === 'EACCES' || code === 'EPERM') return "can't be read (no permission)";
  return `can't be read (${code})`;
}

async function looksLikeProject(dir: string): Promise<boolean> {
  return (await exists(path.join(dir, 'project.json'))) || (await exists(path.join(dir, 'threads'))) || (await exists(path.join(dir, 'items')));
}

/**
 * Repo-profile folders first (<folder>/<project>), then settings.projectsFolder (<folder>/<repo>/<project>).
 * Each real folder once. A folder that can't be listed is reported, except a main projects folder that
 * doesn't exist yet (that's just a fresh install).
 */
export async function discoverProjects(
  settings: Settings,
  repos: RepoProfile[],
  home?: string,
): Promise<{ refs: ProjectRef[]; problems: DiscoveryProblem[] }> {
  const refs: ProjectRef[] = [];
  const problems: DiscoveryProblem[] = [];
  const seen = new Set<string>();
  const add = async (repo: string, id: string, dir: string) => {
    if (!(await looksLikeProject(dir))) return;
    const real = await fs.realpath(dir).catch(() => dir);
    if (seen.has(real)) return;
    seen.add(real);
    refs.push({ repo, id, dir });
  };
  for (const profile of repos) {
    if (!profile.projectsFolder) continue;
    const folder = expandHome(profile.projectsFolder, home);
    const r = await readSubdirs(folder);
    if (r.error) {
      problems.push({
        folder: profile.projectsFolder,
        message: `The projects folder for repo profile "${profile.name}" ${folderProblem(r.error)}. Check it in Settings → Repos.`,
      });
    }
    for (const id of r.names) await add(profile.name, id, path.join(folder, id));
  }
  const root = expandHome(settings.projectsFolder, home);
  const top = await readSubdirs(root);
  if (top.error && top.error !== 'ENOENT') {
    problems.push({ folder: settings.projectsFolder, message: `The projects folder ${folderProblem(top.error)}. Check it in Settings.` });
  }
  for (const repo of top.names) {
    const r = await readSubdirs(path.join(root, repo));
    if (r.error) problems.push({ folder: path.join(root, repo), message: `This folder ${folderProblem(r.error)}.` });
    for (const id of r.names) await add(repo, id, path.join(root, repo, id));
  }
  return { refs, problems };
}

export async function findProjects(settings: Settings, repos: RepoProfile[], home?: string): Promise<ProjectRef[]> {
  return (await discoverProjects(settings, repos, home)).refs;
}

async function readProject(ref: ProjectRef): Promise<{ project: PlumbingProject | null; error?: string }> {
  const r = await readJsonFile(path.join(ref.dir, 'project.json'));
  if (!r.ok) return { project: null, error: r.error === 'missing' ? 'project.json is missing.' : `project.json isn't valid JSON (${r.error}).` };
  const p = plumbingProjectSchema.safeParse(r.value);
  if (p.success) return { project: p.data };
  const issue = p.error.issues[0];
  return { project: null, error: `project.json doesn't have the expected shape (${issue?.path.join('.')}: ${issue?.message}).` };
}

export async function summarizeProject(ref: ProjectRef): Promise<ProjectSummary> {
  const { project, error } = await readProject(ref);
  const { values: threads, bad: badThreads } = await readThreads(ref.dir);
  const { values: items, bad: badItems } = await readItems(ref.dir);
  const counts = countThreads(threads.map(displayStatus));
  const problems = [
    error,
    badThreads ? `${badThreads} thread file${badThreads === 1 ? '' : 's'} couldn't be read.` : undefined,
    badItems ? `${badItems} item file${badItems === 1 ? '' : 's'} couldn't be read.` : undefined,
  ].filter(Boolean).join(' ');
  if (!project) {
    let updatedAt = new Date(0).toISOString();
    try {
      const stat = await fs.stat(ref.dir);
      updatedAt = stat.mtime.toISOString();
    } catch {
      // use default epoch time
    }
    return { repo: ref.repo, id: ref.id, title: ref.id, sourcePath: null, clone: null, branch: null, status: 'broken', updatedAt, counts, error: problems };
  }
  return {
    repo: ref.repo,
    id: ref.id,
    title: project.title,
    sourcePath: project.source.path,
    clone: project.source.clone,
    branch: project.source.branch,
    status: project.status,
    updatedAt: project.updatedAt,
    counts,
    ...(problems ? { error: problems } : {}),
  };
}

export type ListOptions = { q?: string; tab?: 'active' | 'finalized' | 'all'; offset?: number; limit: number };

export async function listProjectSummaries(refs: ProjectRef[], opts: ListOptions): Promise<{ items: ProjectSummary[]; total: number }> {
  const all = await Promise.all(refs.map(summarizeProject));
  const q = opts.q?.trim().toLowerCase();
  const tab = opts.tab ?? 'active';
  const matchesTab = (s: ProjectSummary) => tab === 'all' || (tab === 'finalized' ? s.status === 'finalized' : s.status !== 'finalized');
  const matchesQuery = (s: ProjectSummary) => !q || [s.title, s.id, s.repo, s.sourcePath ?? ''].some((v) => v.toLowerCase().includes(q));
  const filtered = all.filter((s) => matchesTab(s) && matchesQuery(s));
  filtered.sort((a, b) => Number(b.counts.yourTurn > 0) - Number(a.counts.yourTurn > 0) || b.updatedAt.localeCompare(a.updatedAt));
  const offset = opts.offset ?? 0;
  return { items: filtered.slice(offset, offset + opts.limit), total: filtered.length };
}

export async function loadProjectHome(ref: ProjectRef, types: PlumbingType[]): Promise<ProjectHome> {
  const summary = await summarizeProject(ref);
  const { project } = await readProject(ref);
  if (!project) throw new ProjectUnreadableError(summary.error ?? 'This plumbing project could not be read.');
  const { values: items } = await readItems(ref.dir);
  const { values: threads } = await readThreads(ref.dir);
  const threadById = new Map(threads.map((t) => [t.id, t]));
  const itemById = new Map(items.map((i) => [i.id, i]));
  const titleOf = new Map(types.map((t) => [t.id, t.title]));

  const typeEntries: TypeEntry[] = types
    .filter((t) => t.enabled)
    .map((t) => {
      const ofType = items.filter((i) => i.type === t.id);
      const statuses = ofType.flatMap((i) => {
        const th = threadById.get(i.threadId);
        return th ? [displayStatus(th)] : [];
      });
      const c = countThreads(statuses);
      const empty = project.emptyTypes.find((e) => e.type === t.id);
      const noChanges = empty
        ? { reason: empty.reason }
        : ofType.length === 0 && project.status !== 'importing'
          ? { reason: 'No items were found for this plumbing type.' }
          : null;
      return { id: t.id, title: t.title, order: t.order, screen: t.screen, emptyMessage: t.emptyMessage, itemCount: ofType.length, yourTurn: c.yourTurn, drafts: c.drafts, withClaude: c.withClaude, resolved: c.resolved, noChanges };
    });

  const inbox: InboxEntry[] = threads
    .map((th): InboxEntry => {
      const item = itemById.get(th.itemId);
      const last = [...th.messages].reverse().find((m) => m.text);
      return {
        threadId: th.id,
        itemId: th.itemId,
        itemTitle: item?.title ?? th.itemId,
        type: item?.type ?? 'unknown',
        typeTitle: item ? (titleOf.get(item.type) ?? item.type) : 'Unknown',
        status: displayStatus(th),
        blocking: item?.fields?.blocking === 'true',
        lastMessage: last?.text ? { author: last.author, text: last.text } : null,
      };
    })
    .filter((e) => e.status !== 'idle');

  const docExists = (rel: string | undefined) => (rel ? exists(path.join(ref.dir, rel)) : Promise.resolve(false));
  const documents = {
    original: await docExists(project.docs.original),
    draft: await docExists(project.docs.draft),
    final: await docExists(project.docs.final),
  };
  return { summary, project, types: typeEntries, inbox, documents };
}

export async function loadTypeItems(ref: ProjectRef, types: PlumbingType[], typeId: string): Promise<{ type: TypeEntry; items: TypeItemRow[] } | null> {
  const home = await loadProjectHome(ref, types);
  const type = home.types.find((t) => t.id === typeId);
  if (!type) return null;
  const { values: items } = await readItems(ref.dir);
  const { values: threads } = await readThreads(ref.dir);
  const byId = new Map(threads.map((t) => [t.id, t]));
  const rows = items
    .filter((i) => i.type === typeId)
    .map((i): TypeItemRow => {
      const th = byId.get(i.threadId);
      return { id: i.id, title: i.title, summary: i.summary, status: th ? displayStatus(th) : 'idle', blocking: i.fields?.blocking === 'true' };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
  return { type, items: rows };
}

export async function readProjectDocument(ref: ProjectRef, which: 'original' | 'draft' | 'final'): Promise<string | null> {
  const { project, error } = await readProject(ref);
  if (!project) throw new ProjectUnreadableError(error ?? 'This plumbing project could not be read.');
  const rel = project.docs[which];
  if (!rel) return null;
  const file = docPath(ref.dir, rel);
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}
