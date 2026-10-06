import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { expandHome } from '../paths';
import { changesSinceFinal, checklistFrom } from './checklist';
import { activeDecisions } from './decisions';
import { readFinalize } from './finalize';
import { IMPORT_DID_NOT_FINISH } from './importItems';
import { docPath, readDecisions, readHistory, readItems, readJsonFile, readThreads } from './io';
import { openOptions } from './threads';
import { currentVersion, projectVersions } from './versions';
import type { DataChecker } from './checks';
import {
  countThreads,
  dataKindOf,
  displayStatus,
  parseData,
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

  // A built-in type (Plan changes) shows only in a project that has items of it.
  const typeEntries: TypeEntry[] = types
    .filter((t) => t.enabled && (!t.builtIn || items.some((i) => i.type === t.id)))
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
      return {
        id: t.id,
        title: t.title,
        order: t.order,
        screen: t.screen,
        timeline: t.timeline,
        emptyMessage: t.emptyMessage,
        itemCount: ofType.length,
        yourTurn: c.yourTurn,
        drafts: c.drafts,
        withClaude: c.withClaude,
        resolved: c.resolved,
        noChanges,
        importFailed: noChanges?.reason === IMPORT_DID_NOT_FINISH,
        fields: t.fields,
        answerPresets: t.answerPresets,
        ...(t.addLabel ? { addLabel: t.addLabel } : {}),
      };
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
  const history = await readHistory(ref.dir);
  const checklist = checklistFrom({ items, threads, history, types });
  const finalize = {
    canStart: checklist.canStart,
    blockingCount: checklist.blocking.length,
    state: (await readFinalize(ref.dir))?.state ?? null,
    changesSinceFinal: changesSinceFinal(history, project.docs.exportedTo?.at),
  };
  const version = { current: currentVersion(project).n, count: projectVersions(project).length };
  return { summary, project, types: typeEntries, inbox, documents, version, finalize };
}

const byTitle = (a: TypeItemRow, b: TypeItemRow) => a.title.localeCompare(b.title);

/** Phases in their order. Items without valid phase data come after them, by title. */
function byPhaseOrder(rows: TypeItemRow[]): TypeItemRow[] {
  const order = new Map(
    rows.map((r) => {
      const p = parseData('timeline', r.data);
      return [r.id, p.ok ? p.data.order : null] as const;
    }),
  );
  return [...rows].sort((a, b) => {
    const x = order.get(a.id) ?? null;
    const y = order.get(b.id) ?? null;
    if (x !== null && y !== null) return x - y || byTitle(a, b);
    if (x !== null) return -1;
    if (y !== null) return 1;
    return byTitle(a, b);
  });
}

/** A plumbing type's rows. With a checker, each row carries its checks against the plan's clone. */
export async function loadTypeItems(
  ref: ProjectRef,
  types: PlumbingType[],
  typeId: string,
  opts: { checker?: DataChecker } = {},
): Promise<{ type: TypeEntry; items: TypeItemRow[] } | null> {
  const home = await loadProjectHome(ref, types);
  const type = home.types.find((t) => t.id === typeId);
  if (!type) return null;
  const kind = dataKindOf(type);
  const { values: items } = await readItems(ref.dir);
  // Timeline types: the items each phase lists, so the list can link to them by title.
  const itemById = new Map(items.map((x) => [x.id, x]));
  const typeTitle = new Map(types.map((t) => [t.id, t.title]));
  const itemRefsOf = (data: unknown): TypeItemRow['itemRefs'] => {
    if (!type.timeline) return {};
    const phase = parseData('timeline', data);
    if (!phase.ok) return {};
    const refs: TypeItemRow['itemRefs'] = {};
    for (const id of phase.data.itemIds) {
      const target = itemById.get(id);
      if (target) refs[id] = { title: target.title, threadId: target.threadId, typeTitle: typeTitle.get(target.type) ?? target.type };
    }
    return refs;
  };
  const { values: threads } = await readThreads(ref.dir);
  const byId = new Map(threads.map((t) => [t.id, t]));
  const decisions = activeDecisions(await readDecisions(ref.dir));
  const ofType = items.filter((i) => i.type === typeId);
  const checks = await Promise.all(ofType.map((i) => (opts.checker ? opts.checker.check(kind, i.data) : null)));
  const rows = ofType.map((i, n): TypeItemRow => {
    const th = byId.get(i.threadId);
    const last = th ? [...th.messages].reverse().find((m) => m.text) : undefined;
    return {
      id: i.id,
      threadId: i.threadId,
      title: i.title,
      summary: i.summary,
      status: th ? displayStatus(th) : 'idle',
      blocking: i.fields?.blocking === 'true',
      fields: i.fields ?? {},
      messageCount: th?.messages.length ?? 0,
      latest: last?.text ? { author: last.author, text: last.text } : null,
      open: th ? openOptions(th) : null,
      draft: th?.draft ?? null,
      decision: [...decisions].reverse().find((d) => d.threadId === i.threadId)?.text ?? null,
      flagged: Boolean(i.flags?.length),
      data: i.data ?? null,
      body: i.body ?? null,
      links: i.links ?? [],
      anchor: i.anchor ?? null,
      createdBy: i.createdBy,
      checks: checks[n] ?? null,
      itemRefs: itemRefsOf(i.data),
    };
  });
  return { type, items: kind === 'timeline' ? byPhaseOrder(rows) : rows.sort(byTitle) };
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
