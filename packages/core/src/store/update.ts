import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { writeFileAtomic, writeJsonAtomic } from '../atomic';
import { diffText } from '../docDiff';
import { MergeError, mergePlan, type MergeConflict, type MergeResult } from '../merge';
import { defenseThreadIds } from '../defenseType';
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
/** Whether every line of `part` is a whole line of `text`, ignoring spaces at the ends of lines. */
function hasLines(text: string, part: string): boolean {
  const lines = new Set(text.split('\n').map((line) => line.trimEnd()));
  return part.split('\n').every((line) => lines.has(line.trimEnd()));
}
/** The number of lines in a diff segment's text. */
const lineCount = (text: string) => (text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0);

/**
 * Whether bringing this version in changed the draft: something merged into it, a conflict left to settle, or a
 * fresh start. A finalized project goes back to Active after such an update, and the Finalize page says it came in.
 */
export function changedDraft(v: PlanVersion): boolean {
  return v.merge !== undefined && (v.merge.clean > 0 || v.merge.conflicts > 0 || v.merge.fresh === true);
}

/**
 * The newest plan version that came in after the last final was accepted and changed the draft, or null. Such a version
 * makes that final out of date: the Finalize page says it came in, and the Whiteboard Defense explains the draft.
 */
export function planVersionSinceFinal(project: PlumbingProject): number | null {
  const finalAt = project.docs.exportedTo?.at;
  return finalAt ? (projectVersions(project).filter((v) => v.at > finalAt && changedDraft(v)).at(-1)?.n ?? null) : null;
}

// The update's journal. Before it writes anything else, an update writes docs/versions/v<n>/update.json (n is the
// version it replaces) with every path it's going to create, and the sha256 of the text it writes as docs/draft.md and
// docs/original.md. Once project.json is written, the journal is deleted. A journal still there means an update
// stopped part-way: the next planChange or updatePlan puts it back.
const JOURNAL = 'update.json';
const journalSchema = z.object({
  to: z.number().int().min(2),
  created: z.array(z.string()),
  /** What the update writes as each working file, so putting it back only ever replaces the update's own text. */
  wrote: z.object({ draft: z.string(), original: z.string() }),
});
type Journal = z.infer<typeof journalSchema>;
const journalRel = (n: number) => `docs/versions/v${n}/${JOURNAL}`;

/** A file's bytes, or null when there's no such file. Any other error is thrown, since it says nothing about the file. */
async function bytesIfThere(file: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
/** sha256 hex of the bytes: planHash of the text they hold. */
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

/**
 * What putting an update back did. `failed`: the files it couldn't put back, because they can't be read, written or
 * removed. `changed`: the working files it left as they are, because they changed since the update wrote them.
 */
type PutBack = { failed: string[]; changed: string[] };

/**
 * Takes back the writes of an update to v<to> that didn't finish, using its journal in docs/versions/v<n>/:
 * - docs/original.md and docs/draft.md go back to what they were: `before` (the update's own copy, when it's the one
 *   putting itself back) or else the snapshot. Only a file that is what the update wrote is replaced. One that changed
 *   since (an accepted change, an edit by hand) is left as it is: putting it back would lose that.
 * - The files it created are removed.
 * The snapshot and the journal are left for the caller.
 */
async function putBack(dir: string, docs: PlumbingProject['docs'], n: number, journal: Journal, before?: { original: Buffer; draft: Buffer }): Promise<PutBack> {
  const failed: string[] = [];
  const changed: string[] = [];
  for (const which of ['original', 'draft'] as const) {
    const rel = docs[which];
    try {
      const working = docPath(dir, rel);
      const current = await bytesIfThere(working);
      const saved = before?.[which] ?? (await bytesIfThere(docPath(dir, versionDocRel(n, which))));
      // No snapshot of it means the update stopped before it got that far, so the working file was never replaced.
      if (!saved || current?.equals(saved)) continue;
      if (current && sha256(current) !== journal.wrote[which]) {
        changed.push(rel);
        continue;
      }
      await writeFileAtomic(working, saved);
    } catch {
      // A file that can't be read or written can't be put back yet.
      failed.push(rel);
    }
  }
  for (const rel of [...journal.created].reverse()) {
    const file = docPath(dir, rel);
    const stat = await lstat(file);
    if (!stat) continue;
    // A folder the update made goes only when it's empty again.
    if (stat.isDirectory()) await fs.rmdir(file).catch(quiet);
    else await fs.rm(file, { force: true }).catch(() => failed.push(rel));
  }
  return { failed, changed };
}

/**
 * Once an update is put back, its snapshot isn't needed any more: it's removed, then the journal, then
 * docs/versions/v<n> and docs/versions if they're empty (a merged.md from the update that brought v<n> in stays).
 * Returns what it couldn't remove; then the journal stays, for the next try.
 */
async function removeSnapshot(dir: string, n: number): Promise<string[]> {
  const left: string[] = [];
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
 * When putting an update back left a changed working file as it is, moves that update's snapshot and journal to
 * docs/versions/v<n>.unfinished-<UTC time>/, in one rename: nothing in them is lost, and v<n> is free for the next
 * update's snapshot. A merged.md from the update that brought v<n> in belongs to v<n>, so it goes back there.
 * Returns the new folder, relative to the project.
 */
async function setAside(dir: string, n: number, now: Date): Promise<string> {
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
  let rel = `docs/versions/v${n}.unfinished-${stamp}`;
  for (let k = 2; await lstat(docPath(dir, rel)); k++) rel = `docs/versions/v${n}.unfinished-${stamp}-${k}`;
  const folder = docPath(dir, `docs/versions/v${n}`);
  const aside = docPath(dir, rel);
  await fs.rename(folder, aside);
  if (await lstat(path.join(aside, 'merged.md'))) {
    // If it can't go back, it stays with the rest: nothing is lost, and v<n> isn't left as an empty folder.
    await fs
      .mkdir(folder, { recursive: true })
      .then(() => fs.rename(path.join(aside, 'merged.md'), path.join(folder, 'merged.md')))
      .catch(() => fs.rmdir(folder).catch(quiet));
  }
  return rel;
}

/**
 * What recoverUnfinishedUpdate did. `recovered`: it put back an update that hadn't finished. `keptChanged`: the working
 * files it left as you have them, because they changed since that update wrote them. `setAside`: where the copy from
 * before that update went, then (docs/versions/v<n>.unfinished-<UTC time>), or null.
 */
export type UpdateRecovery = { recovered: boolean; keptChanged: string[]; setAside: string | null };

/**
 * Finishes what an update left behind when it stopped part-way (the service died, or putting files back failed). A
 * journal whose version is in project.json is just deleted. Any other update is put back: its snapshot and journal are
 * removed, or, when a working file changed since the update wrote it, that file stays as it is and they're set aside.
 * Throws when a file can't be put back yet, keeping the snapshot and the journal for the next try. Runs at the start of
 * planChange and updatePlan, so under the project's lock. `now` names a set-aside folder.
 */
export async function recoverUnfinishedUpdate(dir: string, now: Date = new Date()): Promise<UpdateRecovery> {
  const note: UpdateRecovery = { recovered: false, keptChanged: [], setAside: null };
  const folders = await fs.readdir(docPath(dir, 'docs/versions')).catch((): string[] => []);
  for (const folder of folders) {
    const match = /^v([1-9][0-9]*)$/.exec(folder)?.[1];
    if (!match) continue;
    const n = Number(match);
    const read = await readJsonFile(docPath(dir, journalRel(n)));
    const journal = read.ok ? journalSchema.safeParse(read.value) : null;
    if (!journal?.success) continue;
    const project = await readProjectFile(dir);
    if (projectVersions(project).some((v) => v.n === journal.data.to)) {
      await fs.rm(docPath(dir, journalRel(n)), { force: true });
      continue;
    }
    const unfinished = (left: string[]) =>
      new ConflictError(
        `An earlier update to v${journal.data.to} didn't finish, and some files couldn't be put back yet: ${left.join(', ')}. Run /dev-plumbing again to finish putting them back.`,
      );
    const { failed, changed } = await putBack(dir, project.docs, n, journal.data);
    if (failed.length) throw unfinished(failed);
    if (changed.length) {
      // Your changes win: they stay as they are, and the copy from before the update is kept beside them.
      note.setAside = await setAside(dir, n, now).catch(() => {
        throw unfinished([`docs/versions/v${n}`]);
      });
      note.keptChanged.push(...changed);
    } else {
      const left = await removeSnapshot(dir, n);
      if (left.length) throw unfinished(left);
    }
    note.recovered = true;
  }
  return note;
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
 * under: an import, threads queued for Claude (but not Defense threads, which can't change the draft), or a finalize.
 */
export async function updateRefusal(dir: string): Promise<string | null> {
  const project = await readProjectFile(dir);
  if (project.status === 'importing') return "This project is still importing. Run /dev-plumbing again once that's done.";
  const defenseThreads = defenseThreadIds((await readItems(dir)).values);
  const waiting = (await readThreads(dir)).values.filter((t) => t.status === 'with_claude' && !defenseThreads.has(t.id)).length;
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
 * - an older Plan changes thread still open is parked when a new conflict under the same heading has every line of its
 *   passage, and every one is parked with `fresh`;
 * - docs/original.md becomes the repo's text;
 * - project.json records the version and starts a re-import of every importable type.
 * Refused, writing nothing, while updateRefusal says so, when the plan hasn't changed, when docs/versions/v<n> already
 * has a snapshot, and when git can't merge (InputError). A journal on disk lists what it creates, and project.json is
 * written last: if anything fails, what was written is put back, now or at the next try, but never over a working
 * file that changed since. `home` is the home folder for `~` paths.
 */
export async function updatePlan(
  dir: string,
  o: { repoText: string; clone: string; branch: string; commit: string | null; types: PlumbingType[]; fresh?: boolean; home?: string; now?: Date },
): Promise<UpdateResult> {
  const now = o.now ?? new Date();
  const at = now.toISOString();
  await recoverUnfinishedUpdate(dir, now);
  const refused = await updateRefusal(dir);
  if (refused) throw new ConflictError(refused);
  const project = await readProjectFile(dir);
  const current = currentVersion(project);
  if (planHash(o.repoText) === current.hash) throw new ConflictError(`The plan hasn't changed since v${current.n}.`);
  // A snapshot already in docs/versions/v<n> isn't this update's. snapshotVersion would refuse to overwrite it, and
  // putting the update back must never restore from it or remove it, so the update doesn't start. Only a missing
  // folder means there's none: any other error says nothing about what's in it.
  const present = await fs.readdir(docPath(dir, `docs/versions/v${current.n}`)).catch((error: unknown): string[] => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  if (present.includes('original.md') || present.includes('draft.md')) throw new ConflictError(`Version ${current.n} is already saved in docs/versions/v${current.n}.`);
  const n = current.n + 1;
  const fresh = o.fresh === true;

  // The working files as they are now, byte for byte: the merge reads them, and a failure puts them back from here.
  const draftFile = docPath(dir, project.docs.draft);
  const originalFile = docPath(dir, project.docs.original);
  const bytes = (file: string, rel: string) =>
    fs.readFile(file).catch(() => {
      throw new StoreError(`${rel} can't be read.`);
    });
  const before = { draft: await bytes(draftFile, project.docs.draft), original: await bytes(originalFile, project.docs.original) };
  const draftBefore = before.draft.toString('utf8');
  const originalBefore = before.original.toString('utf8');

  let merged: MergeResult;
  try {
    // A fresh start takes the repo's text as it is, with nothing to merge or settle.
    merged = fresh ? { text: o.repoText, clean: 0, conflicts: [] } : await mergePlan({ base: originalBefore, ours: draftBefore, theirs: o.repoText });
  } catch (error) {
    if (error instanceof MergeError) throw new InputError(`Couldn't merge the new plan: ${error.message}`);
    throw error;
  }

  // Older Plan changes items still open are superseded: each by a new conflict that covers its passage, or all of them
  // by a fresh start, which replaces the draft they're about.
  const { values: items } = await readItems(dir);
  const { values: threads } = await readThreads(dir);
  const statusOf = new Map(threads.map((t) => [t.id, t.status]));
  const open = items.filter((i) => i.type === PLAN_CHANGES && !['resolved', 'parked'].includes(statusOf.get(i.threadId) ?? 'parked'));
  const older = open.filter((i) => i.conflict?.ours.trim());
  /** Older item id → the line its thread is parked with. */
  const superseded = new Map<string, string>(fresh ? open.map((i) => [i.id, `Superseded by the plan's v${n}, which started the draft afresh.`]) : []);

  // One Plan changes item per conflict, in document order, each with a thread that starts with Claude.
  const taken = new Set(items.map((i) => i.id));
  const conflicts = merged.conflicts.map((c, i): { item: Item; thread: Thread } => {
    const k = i + 1;
    const id = uniqueId(`${PLAN_CHANGES}-v${n}-${k}`, taken);
    const heading = c.heading && c.heading.length <= 200 ? c.heading : null;
    const title = c.heading ?? `Change ${k}`;
    // It covers an older one under the same heading (its title, or its anchor's heading) with every line of its passage.
    const sameHeading = (x: Item) => x.title === title || (heading !== null && x.mdAnchor?.heading === heading);
    const covers = older.filter((x) => !superseded.has(x.id) && sameHeading(x) && hasLines(c.ours, x.conflict!.ours.trim()));
    for (const x of covers) superseded.set(x.id, `Superseded by the plan's v${n}: ${title}.`);
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
  const { reimporting: _earlier, importBy: _importer, ...rest } = project;
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
  const journal: Journal = { to: n, created, wrote: { draft: planHash(merged.text), original: planHash(o.repoText) } };
  let journaled = false;
  try {
    await writeJsonAtomic(docPath(dir, journalRel(current.n)), journal);
    journaled = true;
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
    // If writing the journal is what failed, nothing else was written yet. The working files go back from the copies
    // read above, not the snapshot, so a snapshot that can't be read now doesn't stop them.
    let left: string[] = [];
    if (journaled) {
      const { failed, changed } = await putBack(dir, project.docs, current.n, journal, before);
      // A working file something else changed while the update ran stays as it is. The snapshot and the journal stay
      // too, so the next look sets them aside (recoverUnfinishedUpdate).
      left = [...failed, ...changed.map((rel) => `${rel} (changed since the update, so it was left as it is)`)];
      if (!left.length) left = await removeSnapshot(dir, current.n);
    }
    if (left.length === 0) {
      await fs.rmdir(docPath(dir, `docs/versions/v${current.n}`)).catch(quiet);
      await fs.rmdir(docPath(dir, 'docs/versions')).catch(quiet);
      throw new ConflictError(`The update didn't finish (${reason}). What it had written was put back, so the project is as it was. Run /dev-plumbing to try again.`);
    }
    throw new ConflictError(`The update didn't finish (${reason}), and some files couldn't be put back yet: ${left.join(', ')}. Run /dev-plumbing again to finish putting them back.`);
  }
  await fs.rm(docPath(dir, journalRel(current.n)), { force: true }).catch(quiet);
  // Superseded Plan changes threads are parked, saying what superseded them. The update has happened by now, so if one
  // of these can't be written, that thread just stays open.
  for (const [id, text] of superseded) {
    const thread = threads.find((t) => t.itemId === id);
    if (!thread) continue;
    const line: Message = { id: newId('m', now), at, author: 'system', text };
    await writeThread(dir, { ...thread, status: 'parked', messages: [...thread.messages, line] }).catch(quiet);
  }
  return { version: n, clean: version.merge!.clean, conflicts: merged.conflicts.length, fresh, conflictThreadIds, importTypes: importPending };
}
