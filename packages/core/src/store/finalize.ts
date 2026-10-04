import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeJsonAtomic } from '../atomic';
import { expandTokens } from '../finalExport';
import { displayStatus, finalizeRequestSchema, type FinalizeRequest, type Item, type PlumbingType } from '../schemas';
import { stable } from './changes';
import { finalizeChecklist } from './checklist';
import { activeDecisions } from './decisions';
import { ConflictError, docPath, newId, projectFiles, readDecisions, readDocText, readItems, readJsonFile, readProjectFile, readThreads, writeDocText } from './io';
import { nothingSaved } from './validate';

// One finalize at a time, in finalize.json: requested (Start finalize) -> writing (a listening window took it) ->
// proposed (the finalizer sent a final) or failed (it returned without one). The service calls these under the
// project's lock.

/** Where the finalizer's document waits, expanded, until you accept or discard it. */
export const PROPOSAL_FILE = 'docs/final.proposed.md';
const MAX_FINAL_CHARS = 500_000;
const RETRY = 'call dp_finalize again with the whole document';

/** A text's sha256, as hex. */
export function draftHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * The fingerprint of everything a final is built from: the draft, every item (its data draws the diagrams, schema
 * blocks and mockups), which items are parked (they're left out of the final) and the active decisions. A proposal
 * records it as `draftHash`, so a final can't be accepted once any of them changed, even by an accept that only
 * redrew an item's data.
 */
export async function finalInputsHash(dir: string): Promise<string> {
  const project = await readProjectFile(dir);
  const draft = await readDocText(dir, project.docs.draft);
  const [{ values }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  // flags ("May need another look") are review marks, not content: clearing one mustn't make a proposal stale.
  const items = values.sort((a, b) => a.id.localeCompare(b.id)).map(({ flags: _flags, ...content }) => content);
  // As in saveProposal: an item is parked when its thread is.
  const statusByThread = new Map(threads.map((t) => [t.id, displayStatus(t)]));
  const parked = items.filter((i) => statusByThread.get(i.threadId) === 'parked').map((i) => i.id);
  const decisions = activeDecisions(await readDecisions(dir)).map((d) => ({ text: d.text, threadId: d.threadId }));
  return draftHash(stable({ draft, items, parked, decisions }));
}

/** The plan file's name without extension, used for <name>.final.md and <name>.assets. */
export function finalName(sourcePath: string): string {
  return path.posix.basename(sourcePath.replace(/\\/g, '/')).replace(/\.(md|markdown)$/i, '');
}

/**
 * finalize.json, or null when no finalize is under way. A damaged file reads as none: it only ever holds the one
 * request, so Start finalize can replace it.
 */
export async function readFinalize(dir: string): Promise<FinalizeRequest | null> {
  const r = await readJsonFile(projectFiles(dir).finalize);
  if (!r.ok) return null;
  const parsed = finalizeRequestSchema.safeParse(r.value);
  return parsed.success ? parsed.data : null;
}

const writeFinalize = (dir: string, request: FinalizeRequest) => writeJsonAtomic(projectFiles(dir).finalize, request);
const removeProposal = (dir: string) => fs.rm(docPath(dir, PROPOSAL_FILE), { force: true });

/**
 * Start finalize. Refused while the plan is still being imported, while anything blocks, or while a request is
 * waiting or being written. A proposal or a failure from an earlier finalize is replaced, and its proposal file removed.
 */
export async function requestFinalize(dir: string, o: { types: PlumbingType[]; now?: Date }): Promise<FinalizeRequest> {
  const now = o.now ?? new Date();
  if ((await readProjectFile(dir)).status === 'importing') throw new ConflictError('Wait for the import to finish, then finalize.');
  const current = await readFinalize(dir);
  if (current?.state === 'requested' || current?.state === 'writing') throw new ConflictError('Finalize is already under way.');
  const checklist = await finalizeChecklist(dir, o.types);
  if (!checklist.canStart) throw new ConflictError(`Finalize is blocked:\n- ${checklist.blocking.map((e) => `${e.title}: ${e.reason}`).join('\n- ')}`);
  const request: FinalizeRequest = { id: newId('f', now), state: 'requested', requestedAt: now.toISOString() };
  await writeFinalize(dir, request);
  await removeProposal(dir);
  return request;
}

/** A listening window takes the waiting request: requested -> writing. Null when there's none to take. */
export async function pickUpFinalize(dir: string, windowId: string, now: Date = new Date()): Promise<FinalizeRequest | null> {
  const current = await readFinalize(dir);
  if (current?.state !== 'requested') return null;
  const next: FinalizeRequest = { ...current, state: 'writing', pickedUpAt: now.toISOString(), pickedUpBy: windowId, inputsHash: await finalInputsHash(dir) };
  await writeFinalize(dir, next);
  return next;
}

/** expandTokens isn't given parked items, so it says there's no such item. Say it's parked instead. */
const NO_ITEM = /^(\{\{.+?\}\}): there's no item "(.+)"\.$/;
function parkedProblem(problem: string, parked: Map<string, Item>): string {
  const [, token, id] = NO_ITEM.exec(problem) ?? [];
  const item = id === undefined ? undefined : parked.get(id);
  return item ? `${token}: "${item.title}" is parked, so it's left out of the final.` : problem;
}

/**
 * The finalizer's document. Every token is checked and expanded first; any problem refuses the whole document and
 * saves nothing. Tokens can name only items that go into the final: not parked ones, nor items of disabled types. Otherwise the expanded final goes to docs/final.proposed.md, and the request records
 * finalInputsHash (the current draft, items and decisions) and the mockups the final links to.
 * `name` is finalName(project.source.path).
 */
export async function saveProposal(
  dir: string,
  o: { requestId: string; markdown: string; types: PlumbingType[]; name: string; now?: Date },
): Promise<FinalizeRequest> {
  const now = o.now ?? new Date();
  const current = await readFinalize(dir);
  if (current?.id !== o.requestId || current.state !== 'writing') throw new ConflictError(`There's no finalize request ${o.requestId} waiting for a final.`);
  if (!o.markdown.trim()) throw nothingSaved(['The final is empty. Send the whole document.'], RETRY);
  if (o.markdown.length > MAX_FINAL_CHARS) {
    throw nothingSaved([`The final is ${o.markdown.length.toLocaleString('en-US')} characters; it can be at most 500,000.`], RETRY);
  }
  // Only items that go into the final can be named. As in the checklist and the finalizer's pack, that leaves out
  // parked items and items of disabled plumbing types.
  const [{ values: items }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  const statusByThread = new Map(threads.map((t) => [t.id, displayStatus(t)]));
  const enabled = (i: Item) => o.types.find((t) => t.id === i.type)?.enabled !== false;
  const parked = new Map(items.filter((i) => enabled(i) && statusByThread.get(i.threadId) === 'parked').map((i) => [i.id, i]));
  const inFinal = items.filter((i) => enabled(i) && !parked.has(i.id));
  const expanded = expandTokens(o.markdown, { items: inFinal, types: o.types, assetsDir: `${o.name}.assets` });
  if (!expanded.ok) throw nothingSaved(expanded.problems.map((p) => parkedProblem(p, parked)), RETRY);
  const next: FinalizeRequest = {
    ...current,
    state: 'proposed',
    proposal: { at: now.toISOString(), draftHash: current.inputsHash ?? (await finalInputsHash(dir)), file: PROPOSAL_FILE, length: expanded.markdown.length, assets: expanded.assets },
  };
  await writeDocText(dir, PROPOSAL_FILE, expanded.markdown);
  try {
    await writeFinalize(dir, next);
  } catch (error) {
    await removeProposal(dir).catch(() => undefined);
    throw error;
  }
  return next;
}

/**
 * The window reported back (dp_wait's finished.finalize). If its finalizer never sent a final, the request fails with
 * the reason, so the page offers Try again. Anything else (another window, another request, a proposal) is left alone.
 */
export async function finishFinalize(dir: string, o: { requestId: string; windowId: string; now?: Date }): Promise<void> {
  const current = await readFinalize(dir);
  if (current?.id !== o.requestId || current.state !== 'writing' || current.pickedUpBy !== o.windowId) return;
  await writeFinalize(dir, { ...current, state: 'failed', failedAt: (o.now ?? new Date()).toISOString(), reason: "The finalizer didn't send a final." });
}

/** A request being written by a window that went away goes back in the queue. True when it did. */
export async function requeueFinalize(dir: string, isAlive: (windowId: string) => boolean, now: Date = new Date()): Promise<boolean> {
  const current = await readFinalize(dir);
  if (current?.state !== 'writing' || (current.pickedUpBy && isAlive(current.pickedUpBy))) return false;
  await writeFinalize(dir, { ...current, state: 'requested', pickedUpAt: undefined, pickedUpBy: undefined, inputsHash: undefined, requeuedAt: now.toISOString() });
  return true;
}

/** Discard: removes the request and its proposal, whatever state they're in. */
export async function discardProposal(dir: string): Promise<void> {
  await fs.rm(projectFiles(dir).finalize, { force: true });
  await removeProposal(dir);
}
