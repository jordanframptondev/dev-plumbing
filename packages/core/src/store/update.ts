import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { writeFileAtomic, writeJsonAtomic } from '../atomic';
import { diffText } from '../docDiff';
import { MergeError, mergePlan, type MergeConflict, type MergeResult } from '../merge';
import { importableTypes, PLAN_CHANGES } from '../planChanges';
import { titleFromMarkdown, type Item, type Message, type PlanVersion, type PlumbingProject, type PlumbingType, type Submission, type Thread } from '../schemas';
import { readFinalize } from './finalize';
import { uniqueId } from './importItems';
import {
  ConflictError,
  docPath,
  InputError,
  newId,
  projectFiles,
  readDocText,
  readItems,
  readJsonFile,
  readProjectFile,
  readThreads,
  StoreError,
  writeItem,
  writeProjectFile,
  writeSubmission,
  writeThread,
} from './io';
import { tildify } from './open';
import { currentVersion, planHash, projectVersions, snapshotVersion, versionDocRel } from './versions';

/**
 * How the plan in the repo differs from the project's current version. `conflicts` is how many passages a merge
 * would leave to settle (a dry run). `whitespaceOnly`: only the formatting changed. `suggestFresh`: starting the draft
 * again from the new version may suit better than merging, because it's whitespace only or the conflicts cover more
 * than a third of the draft.
 */
export type PlanChange = { from: number; to: number; added: number; removed: number; conflicts: number; whitespaceOnly: boolean; suggestFresh: boolean };
/** The plan in this clone is a version the project had before (another branch, or a clone that isn't up to date). */
export type OlderPlan = { older: number };
export type UpdateResult = { version: number; clean: number; conflicts: number; fresh: boolean; conflictThreadIds: string[]; importTypes: string[] };

const quiet = () => undefined;
/** What's at p, without following a link, or null when nothing is. */
const lstat = (p: string) => fs.lstat(p).catch(() => null);
const lf = (text: string) => text.replace(/\r\n/g, '\n');
/** The text with every run of whitespace as one space, to tell a change of formatting from a change of words. */
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
/** The number of lines in a diff segment's text. */
const lineCount = (text: string) => (text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0);

/**
 * Whether bringing this version in changed the draft: something merged into it, a conflict left to settle, or a
 * fresh start. A finalized project goes back to Active after such an update, and the Finalize page says it came in.
 */
export function changedDraft(v: PlanVersion): boolean {
  return v.merge !== undefined && (v.merge.clean > 0 || v.merge.conflicts > 0 || v.merge.fresh === true);
}

// The update's journal. Before it writes anything else, an update writes docs/versions/v<n>/update.json (n is the
// version it replaces) with every path it's going to create. Once project.json is written, the journal is deleted.
// A journal still there means an update stopped part-way: the next planChange or updatePlan puts it back.
const JOURNAL = 'update.json';
const journalSchema = z.object({ to: z.number().int().min(2), created: z.array(z.string()) });
type Journal = z.infer<typeof journalSchema>;
const journalRel = (n: number) => `docs/versions/v${n}/${JOURNAL}`;

/**
 * Takes back an update to v<to> that didn't finish, using its journal in docs/versions/v<n>/: docs/draft.md and
 * docs/original.md are put back from the snapshot, the files it created are removed, and so are the snapshot and the
 * journal. Returns the files it couldn't put back; then the snapshot and the journal stay, for the next try.
 */
async function rollBack(dir: string, docs: PlumbingProject['docs'], n: number, journal: Journal): Promise<string[]> {
  const left: string[] = [];
  for (const which of ['original', 'draft'] as const) {
    const saved = await fs.readFile(docPath(dir, versionDocRel(n, which))).catch(() => null);
    const working = docPath(dir, docs[which]);
    // No snapshot of it means the update stopped before it got that far, so the working file was never replaced.
    if (!saved || saved.equals(await fs.readFile(working).catch(() => Buffer.alloc(0)))) continue;
    await writeFileAtomic(working, saved).catch(() => left.push(docs[which]));
  }
  for (const rel of [...journal.created].reverse()) {
    const file = docPath(dir, rel);
    const stat = await lstat(file);
    if (!stat) continue;
    // A folder the update made goes only when it's empty again.
    if (stat.isDirectory()) await fs.rmdir(file).catch(quiet);
    else await fs.rm(file, { force: true }).catch(() => left.push(rel));
  }
  if (left.length) return left;
  // Everything is back, so the snapshot isn't needed any more. The journal goes last.
  const folder = docPath(dir, `docs/versions/v${n}`);
  for (const rel of [versionDocRel(n, 'original'), versionDocRel(n, 'draft')]) await fs.rm(docPath(dir, rel), { force: true }).catch(() => left.push(rel));
  await fs.rm(path.join(folder, 'items'), { recursive: true, force: true }).catch(() => left.push(`docs/versions/v${n}/items`));
  if (left.length) return left;
  await fs.rm(docPath(dir, journalRel(n)), { force: true }).catch(() => left.push(journalRel(n)));
  await fs.rmdir(folder).catch(quiet);
  await fs.rmdir(path.dirname(folder)).catch(quiet);
  return left;
}

/**
 * Finishes what an update left behind when it stopped part-way (the service died, or putting files back failed):
 * a journal whose version is in project.json is just deleted, and any other is rolled back. Runs at the start of
 * planChange and updatePlan, so under the project's lock.
 */
export async function recoverUnfinishedUpdate(dir: string): Promise<void> {
  const folders = await fs.readdir(docPath(dir, 'docs/versions')).catch((): string[] => []);
  for (const folder of folders) {
    const n = /^v([1-9][0-9]*)$/.exec(folder)?.[1];
    if (!n) continue;
    const read = await readJsonFile(docPath(dir, journalRel(Number(n))));
    const journal = read.ok ? journalSchema.safeParse(read.value) : null;
    if (!journal?.success) continue;
    const project = await readProjectFile(dir);
    if (projectVersions(project).some((v) => v.n === journal.data.to)) {
      await fs.rm(docPath(dir, journalRel(Number(n))), { force: true });
      continue;
    }
    const left = await rollBack(dir, project.docs, Number(n), journal.data);
    if (left.length) {
      throw new ConflictError(
        `An earlier update to v${journal.data.to} didn't finish, and some files couldn't be put back yet: ${left.join(', ')}. Run /dev-plumbing again to finish putting them back.`,
      );
    }
  }
}

/**
 * How the plan in the repo differs from the project's current version: null when it's the same text (the same hash,
 * or the same lines once \r\n is read as \n), { older } when it's a version the project had before, and otherwise the
 * change. `added` and `removed` count lines, against the current version's plan (docs/original.md). A merge is tried
 * without writing anything, for `conflicts` and `suggestFresh`; if git can't merge, the update will say so.
 */
export async function planChange(dir: string, repoText: string): Promise<PlanChange | OlderPlan | null> {
  await recoverUnfinishedUpdate(dir);
  const project = await readProjectFile(dir);
  const versions = projectVersions(project);
  const current = currentVersion(project);
  if (planHash(repoText) === current.hash) return null;
  const original = lf(await readDocText(dir, project.docs.original));
  const repo = lf(repoText);
  // A change of line endings alone isn't a new version of the plan.
  if (repo === original) return null;
  const hashes = new Set([planHash(repoText), planHash(repo)]);
  const older = versions.filter((v) => v.n !== current.n && hashes.has(v.hash)).at(-1);
  if (older) return { older: older.n };
  let added = 0;
  let removed = 0;
  for (const segment of diffText(original, repo)) {
    if (segment.kind === 'added') added += lineCount(segment.text);
    if (segment.kind === 'removed') removed += lineCount(segment.text);
  }
  const draft = lf(await readDocText(dir, project.docs.draft));
  const dryRun = await mergePlan({ base: original, ours: draft, theirs: repo }).catch((error: unknown) => {
    if (error instanceof MergeError) return null;
    throw error;
  });
  const conflicts = dryRun?.conflicts ?? [];
  const whitespaceOnly = squash(repo) === squash(original);
  const covered = conflicts.reduce((sum, c) => sum + c.ours.length, 0);
  return { from: current.n, to: current.n + 1, added, removed, conflicts: conflicts.length, whitespaceOnly, suggestFresh: whitespaceOnly || covered * 3 > draft.length };
}

/** A passage in a fenced Markdown block, its fence longer than any run of backticks inside it. "(nothing)" when it's empty. */
function fenced(text: string): string {
  const body = text.replace(/\n+$/, '');
  if (!body.trim()) return '(nothing)';
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}md\n${body}\n${fence}`;
}

/** A conflict's item body: where the repo moved it, if it did, then your draft, the repo's new version and the passage before. */
function conflictBody(c: MergeConflict, n: number): string {
  const moved = c.movedTo ? [`The repo moved this passage to § ${c.movedTo}. Your draft now has both copies.`] : [];
  return [...moved, '**Your draft**', fenced(c.ours), `**The repo (v${n})**`, fenced(c.theirs), `**Before (v${n - 1})**`, fenced(c.base)].join('\n\n');
}

/**
 * Why an update can't start now, or null. Each one is work in progress that the update would pull the draft out from
 * under: an import, threads queued for Claude, or a finalize.
 */
export async function updateRefusal(dir: string): Promise<string | null> {
  const project = await readProjectFile(dir);
  if (project.status === 'importing') return "This project is still importing. Run /dev-plumbing again once that's done.";
  const waiting = (await readThreads(dir)).values.filter((t) => t.status === 'with_claude').length;
  if (waiting === 1) return "Claude has 1 thread to answer in this project first. Run /dev-plumbing again once it's answered.";
  if (waiting > 1) return `Claude has ${waiting} threads to answer in this project first. Run /dev-plumbing again once they're answered.`;
  const finalize = await readFinalize(dir);
  if (finalize?.state === 'requested' || finalize?.state === 'writing') return "Finalize is under way. Run /dev-plumbing again once it's done or cancelled.";
  return null;
}

/**
 * Brings the repo's plan in as the next version (spec §15.4):
 * - docs/original.md, docs/draft.md and the items are saved to docs/versions/v<n>/;
 * - the repo's text is merged into the draft three ways, your text winning every conflict, or, with `fresh`, the
 *   draft starts again from the repo's text;
 * - the draft as merged is kept in docs/versions/v<n+1>/merged.md;
 * - each conflict becomes a Plan changes item whose thread is with Claude, queued as one submission;
 * - docs/original.md becomes the repo's text;
 * - project.json records the version and starts a re-import of every importable type.
 * Refused, writing nothing, while updateRefusal says so, when the plan hasn't changed, and when git can't merge
 * (InputError). A journal on disk lists what it creates, and project.json is written last: if anything fails, what
 * was written is put back, now or at the next try. `home` is the home folder for `~` paths.
 */
export async function updatePlan(
  dir: string,
  o: { repoText: string; clone: string; branch: string; commit: string | null; types: PlumbingType[]; fresh?: boolean; home?: string; now?: Date },
): Promise<UpdateResult> {
  const now = o.now ?? new Date();
  const at = now.toISOString();
  await recoverUnfinishedUpdate(dir);
  const refused = await updateRefusal(dir);
  if (refused) throw new ConflictError(refused);
  const project = await readProjectFile(dir);
  const current = currentVersion(project);
  if (planHash(o.repoText) === current.hash) throw new ConflictError(`The plan hasn't changed since v${current.n}.`);
  const n = current.n + 1;
  const fresh = o.fresh === true;

  // The working files as they are now, so the merge has them and a failure can tell what changed.
  const draftFile = docPath(dir, project.docs.draft);
  const originalFile = docPath(dir, project.docs.original);
  const text = (file: string, rel: string) =>
    fs.readFile(file, 'utf8').catch(() => {
      throw new StoreError(`${rel} can't be read.`);
    });
  const draftBefore = await text(draftFile, project.docs.draft);
  const originalBefore = await text(originalFile, project.docs.original);

  let merged: MergeResult;
  try {
    // A fresh start takes the repo's text as it is, with nothing to merge or settle.
    merged = fresh ? { text: o.repoText, clean: 0, conflicts: [] } : await mergePlan({ base: originalBefore, ours: draftBefore, theirs: o.repoText });
  } catch (error) {
    if (error instanceof MergeError) throw new InputError(`Couldn't merge the new plan: ${error.message}`);
    throw error;
  }

  // Older Plan changes items still open, whose passage a new conflict covers, are superseded by it.
  const { values: items } = await readItems(dir);
  const { values: threads } = await readThreads(dir);
  const statusOf = new Map(threads.map((t) => [t.id, t.status]));
  const older = items.filter((i) => i.type === PLAN_CHANGES && i.conflict?.ours.trim() && !['resolved', 'parked'].includes(statusOf.get(i.threadId) ?? 'parked'));
  /** Older item id → the title of the new item that supersedes it. */
  const superseded = new Map<string, string>();

  // One Plan changes item per conflict, in document order, each with a thread that starts with Claude.
  const taken = new Set(items.map((i) => i.id));
  const conflicts = merged.conflicts.map((c, i): { item: Item; thread: Thread } => {
    const k = i + 1;
    const id = uniqueId(`${PLAN_CHANGES}-v${n}-${k}`, taken);
    const heading = c.heading && c.heading.length <= 200 ? c.heading : null;
    const title = c.heading ?? `Change ${k}`;
    const covers = older.filter((x) => !superseded.has(x.id) && c.ours.includes(x.conflict!.ours.trim()));
    for (const x of covers) superseded.set(x.id, title);
    return {
      item: {
        id,
        key: `v${n}-${k}`,
        type: PLAN_CHANGES,
        title,
        summary: `Your draft and the repo's v${n} both changed this passage.`,
        body: conflictBody(c, n),
        ...(heading ? { mdAnchor: { heading } } : {}),
        ...(covers.length ? { links: covers.map((x) => x.id) } : {}),
        threadId: `t-${id}`,
        createdBy: 'import',
        conflict: { ours: c.ours, base: c.base, theirs: c.theirs },
      },
      thread: {
        id: `t-${id}`,
        itemId: id,
        status: 'with_claude',
        messages: [{ id: newId('m', now), at, author: 'system', text: `Your draft and the repo's v${n} both changed this passage. Claude is proposing a merged version.` }],
      },
    };
  });
  const conflictThreadIds = conflicts.map((c) => c.thread.id);
  const submission: Submission | null = conflicts.length
    ? { id: newId('s', now), at, scope: 'all', drafts: {}, sent: conflictThreadIds, resolved: [], processedAt: at }
    : null;

  const version: PlanVersion = {
    n,
    at,
    hash: planHash(o.repoText),
    clone: tildify(o.clone, o.home),
    branch: o.branch,
    commit: o.commit,
    merge: fresh ? { clean: 0, conflicts: 0, fresh: true } : { clean: merged.clean, conflicts: merged.conflicts.length },
  };
  const importPending = importableTypes(o.types).map((t) => t.id);
  // A finalized project stays Finalized only when the update left its draft as it was.
  const from = project.status === 'finalized' && !changedDraft(version) ? 'finalized' : 'active';
  const { reimporting: _earlier, ...rest } = project;
  const next: PlumbingProject = {
    ...rest,
    title: titleFromMarkdown(o.repoText) ?? project.title,
    versions: [...projectVersions(project), version],
    importPending,
    // With no type to import, there's nothing to wait for.
    status: importPending.length ? 'importing' : from,
    ...(importPending.length ? { reimporting: { version: n, from } } : {}),
    updatedAt: at,
  };

  // The journal lists every file and folder the update will create, before any of them is written.
  const files = projectFiles(dir);
  const rel = (file: string) => path.relative(dir, file).split(path.sep).join('/');
  const mergedRel = versionDocRel(n, 'merged');
  const created: string[] = [];
  for (const folder of [path.dirname(docPath(dir, mergedRel)), files.items, files.threads, files.submissions]) if (!(await lstat(folder))) created.push(rel(folder));
  for (const c of conflicts) created.push(rel(files.item(c.item.id)), rel(files.thread(c.thread.id)));
  if (submission) created.push(rel(files.submission(submission.id)));
  created.push(mergedRel);
  const journal: Journal = { to: n, created };
  try {
    await writeJsonAtomic(docPath(dir, journalRel(current.n)), journal);
    // 1. The version snapshot: the plan, the draft and the items.
    await snapshotVersion(dir, current.n);
    // 2. The conflicts' items, threads and submission, and the draft as merged.
    for (const c of conflicts) {
      await writeItem(dir, c.item);
      await writeThread(dir, c.thread);
    }
    if (submission) await writeSubmission(dir, submission);
    await writeFileAtomic(docPath(dir, mergedRel), merged.text);
    // 3. The draft, then 4. the original.
    await writeFileAtomic(draftFile, merged.text);
    await writeFileAtomic(originalFile, o.repoText);
    // 5. project.json, last: once it's written, the update has happened.
    await writeProjectFile(dir, next);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // If writing the journal is what failed, nothing else was written yet.
    const left = (await lstat(docPath(dir, journalRel(current.n)))) ? await rollBack(dir, project.docs, current.n, journal) : [];
    if (left.length === 0) {
      await fs.rmdir(docPath(dir, `docs/versions/v${current.n}`)).catch(quiet);
      await fs.rmdir(docPath(dir, 'docs/versions')).catch(quiet);
      throw new ConflictError(`The update didn't finish (${reason}). What it had written was put back, so the project is as it was. Run /dev-plumbing to try again.`);
    }
    throw new ConflictError(`The update didn't finish (${reason}), and some files couldn't be put back yet: ${left.join(', ')}. Run /dev-plumbing again to finish putting them back.`);
  }
  await fs.rm(docPath(dir, journalRel(current.n)), { force: true }).catch(quiet);
  // Older Plan changes threads the new conflicts cover are parked, pointing at the new one. The update has happened by
  // now, so if one of these can't be written, that thread just stays open.
  for (const [id, title] of superseded) {
    const thread = threads.find((t) => t.itemId === id);
    if (!thread) continue;
    const line: Message = { id: newId('m', now), at, author: 'system', text: `Superseded by the plan's v${n}: ${title}.` };
    await writeThread(dir, { ...thread, status: 'parked', messages: [...thread.messages, line] }).catch(quiet);
  }
  return { version: n, clean: version.merge!.clean, conflicts: merged.conflicts.length, fresh, conflictThreadIds, importTypes: importPending };
}
