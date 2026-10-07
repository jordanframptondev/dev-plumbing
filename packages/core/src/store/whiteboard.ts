import fs from 'node:fs/promises';
import { writeJsonAtomic } from '../atomic';
import { DEFENSE, defenseThreadIds } from '../defenseType';
import {
  DEFENSE_SECTIONS,
  dataKindOf,
  defenseInputSchema,
  displayStatus,
  practiceSchema,
  sectionIds,
  severityValues,
  whiteboardDefenseSchema,
  whiteboardRequestSchema,
  type DefenseInput,
  type PlumbingProject,
  type PlumbingType,
  type Practice,
  type ProjectHome,
  type WhiteboardDefense,
  type WhiteboardRequest,
} from '../schemas';
import { stable } from './changes';
import { changesSinceFinal } from './checklist';
import { activeDecisions } from './decisions';
import { draftHash } from './finalize';
import { ConflictError, newId, projectFiles, readDecisions, readDocText, readHistory, readItems, readJsonFile, readProjectFile, readThreads, StoreError } from './io';
import { planVersionSinceFinal } from './update';
import { nothingSaved } from './validate';
import { currentVersion } from './versions';

// The Whiteboard Defense's files, in the project's whiteboard/ folder: request.json while a defense is asked for,
// defense.json once one is saved, and practice.json for your flashcard ratings and checklist ticks.
//
// One request at a time, as with Finalize: requested (Generate) -> writing (a listening window took it) -> saved (the
// whiteboard subagent sent a defense, and request.json is removed) or failed (it returned without one). The service
// calls these under the project's lock.

type Schema<T> = { safeParse: (v: unknown) => { success: true; data: T } | { success: false } };

/** A JSON file that matches its schema, or null when it's missing or damaged. */
async function readValid<T>(file: string, schema: Schema<T>): Promise<T | null> {
  const r = await readJsonFile(file);
  if (!r.ok) return null;
  const parsed = schema.safeParse(r.value);
  return parsed.success ? parsed.data : null;
}

/**
 * whiteboard/request.json, or null when missing or damaged. A damaged file reads as none: it only ever holds the one
 * request, so Generate can replace it.
 */
export async function readWhiteboardRequest(dir: string): Promise<WhiteboardRequest | null> {
  return readValid(projectFiles(dir).whiteboardRequest, whiteboardRequestSchema);
}

/** whiteboard/defense.json, or null when missing or damaged. */
export async function readDefense(dir: string): Promise<WhiteboardDefense | null> {
  return readValid(projectFiles(dir).defense, whiteboardDefenseSchema);
}

/** whiteboard/practice.json; empty ({ ratings: {}, ticks: {} }) when missing or damaged. */
export async function readPractice(dir: string): Promise<Practice> {
  return (await readValid(projectFiles(dir).practice, practiceSchema)) ?? { ratings: {}, ticks: {} };
}

export async function writeWhiteboardRequest(dir: string, r: WhiteboardRequest): Promise<void> {
  await writeJsonAtomic(projectFiles(dir).whiteboardRequest, r);
}

export async function writeDefense(dir: string, d: WhiteboardDefense): Promise<void> {
  await writeJsonAtomic(projectFiles(dir).defense, d);
}

export async function writePractice(dir: string, p: Practice): Promise<void> {
  await writeJsonAtomic(projectFiles(dir).practice, p);
}

/** Removes request.json. Fine when there's none. */
export async function removeWhiteboardRequest(dir: string): Promise<void> {
  await fs.rm(projectFiles(dir).whiteboardRequest, { force: true });
}

export const WHITEBOARD_RETRY = 'call dp_whiteboard again with the whole defense';
export const WHITEBOARD_GAVE_UP = "The whiteboard subagent didn't send a Whiteboard Defense.";
/** Generate's refusals. The page's view repeats them as generateRefusal, so each is written once. */
export const WHITEBOARD_IMPORTING = "The plan is still importing. Generate the Whiteboard Defense once that's done.";
export const WHITEBOARD_UNDER_WAY = 'The Whiteboard Defense is already being written.';
export const MAX_DEFENSE_CHARS = 120_000;
/** A defense keeps at most this many checklist lines, each at most this long (defenseInputSchema's limits). */
const CHECKLIST_MAX = 40;
const LINE_MAX = 300;
/** A failed request's reason, when it's the subagent's own line or why the plan couldn't be read, is cut to this many characters. */
const REASON_MAX = 500;
/** A failed request's reason when the document the defense would explain can't be read, before the read's own message. */
const UNREADABLE_PLAN = "The Whiteboard Defense couldn't read the plan:";

/** A failed request's reason, cut to REASON_MAX characters with "…". */
const clipReason = (reason: string) => (reason.length <= REASON_MAX ? reason : `${reason.slice(0, REASON_MAX - 1)}…`);

type DefenseBasis = { doc: 'final' | 'draft'; version: number; text: string };

/**
 * Whether the accepted final is still the plan: no change was applied since it was accepted, and no plan version that
 * changed the draft came in after it. The Finalize page says the same (changesSinceFinal, planVersionSinceFinal).
 */
async function finalIsCurrent(dir: string, project: PlumbingProject): Promise<boolean> {
  return changesSinceFinal(await readHistory(dir), project.docs.exportedTo?.at) === 0 && planVersionSinceFinal(project) === null;
}

/**
 * The document a defense explains, with the current plan version: the final while it's current (finalIsCurrent), else
 * the draft. A final the plan has moved on from isn't the plan any more.
 */
export async function defenseBasis(dir: string): Promise<DefenseBasis> {
  const project = await readProjectFile(dir);
  const version = currentVersion(project).n;
  if (project.docs.final && (await finalIsCurrent(dir, project))) return { doc: 'final', version, text: await readDocText(dir, project.docs.final) };
  return { doc: 'draft', version, text: await readDocText(dir, project.docs.draft) };
}

/**
 * The fingerprint of the plan a defense explains: the document it's based on (defenseBasis), every item, which items
 * are parked, and the active decisions. A saved defense keeps the one from when its request was picked up, so it's out
 * of date once any of them changed, or the basis moved from the draft to the final or back. Asking Claude about the
 * defense and sending a part of it to plumbing never make it out of date: Defense items, the items the whiteboard made
 * and the decisions made in Defense threads are left out, as are review marks (flags and the reviewed mark). An answer
 * to a sent question is a decision about the plan, so it counts, and so does an item Claude adds to the plan.
 */
export async function defenseInputsHash(dir: string): Promise<string> {
  return inputsHashFor(dir, await defenseBasis(dir));
}

async function inputsHashFor(dir: string, basis: DefenseBasis): Promise<string> {
  const [{ values }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  const defenseThreads = defenseThreadIds(values);
  const items = values
    .filter((i) => i.type !== DEFENSE && i.createdBy !== 'whiteboard')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ flags: _flags, reviewedAt: _reviewedAt, ...content }) => content);
  const statusByThread = new Map(threads.map((t) => [t.id, displayStatus(t)]));
  const parked = items.filter((i) => statusByThread.get(i.threadId) === 'parked').map((i) => i.id);
  const decisions = activeDecisions(await readDecisions(dir))
    .filter((d) => !defenseThreads.has(d.threadId))
    .map((d) => ({ text: d.text, threadId: d.threadId }));
  return draftHash(stable({ doc: basis.doc, document: basis.text, items, parked, decisions }));
}

/**
 * Generate (or Regenerate, or Try again). Refused while the plan is still importing, and while a request is waiting or
 * being written. A failed request is replaced. The saved defense, if any, stays until a new one is saved.
 */
export async function requestWhiteboard(dir: string, o: { now?: Date } = {}): Promise<WhiteboardRequest> {
  const now = o.now ?? new Date();
  if ((await readProjectFile(dir)).status === 'importing') throw new ConflictError(WHITEBOARD_IMPORTING);
  const current = await readWhiteboardRequest(dir);
  if (current?.state === 'requested' || current?.state === 'writing') throw new ConflictError(WHITEBOARD_UNDER_WAY);
  const request: WhiteboardRequest = { id: newId('g', now), state: 'requested', requestedAt: now.toISOString() };
  await writeWhiteboardRequest(dir, request);
  return request;
}

/**
 * A listening window takes the waiting request: requested -> writing. It records what the subagent will read: the
 * document (the final, else the draft), the plan version and defenseInputsHash. Null when there's nothing to take, and
 * while the plan is importing: a request made before a plan update waits out its re-import, so it's never written from
 * a half re-imported project.
 *
 * When that document can't be read (a final recorded as accepted whose file is gone, say), the request fails with the
 * reason, so dp_wait carries on and the page offers Try again, and the failed request is returned: there's nothing for
 * the window to write.
 */
export async function pickUpWhiteboard(dir: string, windowId: string, now: Date = new Date()): Promise<WhiteboardRequest | null> {
  const current = await readWhiteboardRequest(dir);
  if (current?.state !== 'requested' || (await readProjectFile(dir)).status === 'importing') return null;
  let read: { basis: DefenseBasis; inputsHash: string };
  try {
    const basis = await defenseBasis(dir);
    read = { basis, inputsHash: await inputsHashFor(dir, basis) };
  } catch (e) {
    if (!(e instanceof StoreError)) throw e;
    const failed: WhiteboardRequest = { ...current, state: 'failed', failedAt: now.toISOString(), reason: clipReason(`${UNREADABLE_PLAN} ${e.message}`) };
    await writeWhiteboardRequest(dir, failed);
    return failed;
  }
  const next: WhiteboardRequest = {
    ...current,
    state: 'writing',
    pickedUpAt: now.toISOString(),
    pickedUpBy: windowId,
    inputsHash: read.inputsHash,
    basedOn: { doc: read.basis.doc, version: read.basis.version },
  };
  await writeWhiteboardRequest(dir, next);
  return next;
}

/**
 * The items a section's diagramItemId may name: items of enabled types that draw a diagram, not parked, with a
 * drawing. In id order. saveDefense checks against these, and the whiteboard subagent's pack offers exactly these.
 */
export async function defenseDiagramItemIds(dir: string, types: PlumbingType[]): Promise<string[]> {
  const [{ values: items }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  const statusByThread = new Map(threads.map((t) => [t.id, displayStatus(t)]));
  const diagramTypes = new Set(types.filter((t) => t.enabled && dataKindOf(t) === 'diagram').map((t) => t.id));
  return items
    .filter((i) => diagramTypes.has(i.type) && statusByThread.get(i.threadId) !== 'parked' && i.data !== undefined)
    .map((i) => i.id)
    .sort((a, b) => a.localeCompare(b));
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * What the schema can't say about the sections: each of the ten exactly once, each with a claim, every table row with
 * a cell per column, and diagramItemId naming a diagram item of this project. It reads the payload as sent, so these
 * are listed alongside the schema's own problems. Sections whose id isn't one of the ten are the schema's to report.
 */
function sectionProblems(defense: unknown, diagramIds: string[]): string[] {
  const sections = isObject(defense) && Array.isArray(defense.sections) ? defense.sections.filter(isObject) : [];
  const problems: string[] = [];
  for (const id of sectionIds) {
    const where = `sections: ${id}`;
    const found = sections.filter((s) => s.id === id);
    if (found.length === 0) problems.push(`${where} is missing.`);
    if (found.length > 1) problems.push(`${where} is there more than once.`);
    for (const s of found) {
      if (Array.isArray(s.claims) && s.claims.length === 0) problems.push(`${where} needs at least one claim. Mark what isn't known as unknown.`);
      (Array.isArray(s.tables) ? s.tables : []).forEach((table, t) => {
        if (!isObject(table) || !Array.isArray(table.columns) || !Array.isArray(table.rows)) return;
        const n = table.columns.length;
        table.rows.forEach((row, r) => {
          if (Array.isArray(row) && row.length !== n) problems.push(`${where}: table ${t + 1} row ${r + 1} has ${row.length} cells; it needs ${n}, one per column.`);
        });
      });
      if (typeof s.diagramItemId === 'string' && !diagramIds.includes(s.diagramItemId)) {
        problems.push(
          diagramIds.length
            ? `${where}: diagramItemId "${s.diagramItemId}" isn't an item with a diagram. Use one of: ${diagramIds.join(', ')}.`
            : `${where}: diagramItemId "${s.diagramItemId}" isn't an item with a diagram, and this project has none. Leave diagramItemId out.`,
        );
      }
    }
  }
  // A doubled section with the same problem in both copies says it once.
  return [...new Set(problems)];
}

const CHECKLIST_LINE = /^\s*(?:[-*]\s+)?\[ \]\s+(.+?)\s*$/;

/**
 * A rules file's checklist: its lines written `[ ] <text>` (or `- [ ] <text>`), in order, each once, at most 40, each
 * cut to 300 characters. The service passes them to saveDefense, so the defense's checklist is always the rules
 * file's, word for word, and the ticks Practice keeps by each line's text still match after a regenerate.
 */
export function checklistLines(rules: string): string[] {
  const lines: string[] = [];
  for (const line of rules.split(/\r?\n/)) {
    const m = CHECKLIST_LINE.exec(line);
    if (!m) continue;
    const text = m[1].slice(0, LINE_MAX);
    if (!lines.includes(text)) lines.push(text);
    if (lines.length === CHECKLIST_MAX) break;
  }
  return lines;
}

/**
 * `${where}: ${noun} ${i} repeats ${noun} ${j}.` (from 1) for each text that's an earlier one again, trimmed and with
 * each run of whitespace made one space. Read from the payload as sent, as the sections are. Practice keeps a rating or
 * a tick by its text, so two questions or lines with the same text would share one.
 */
function repeats(texts: unknown, where: string, noun: string): string[] {
  const seen = new Map<string, number>();
  const problems: string[] = [];
  (Array.isArray(texts) ? texts : []).forEach((text, i) => {
    if (typeof text !== 'string' || !text.trim()) return;
    const key = text.trim().replace(/\s+/g, ' ');
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i + 1);
    else problems.push(`${where}: ${noun} ${i + 1} repeats ${noun} ${first}.`);
  });
  return problems;
}

const severityRank = (s: DefenseInput['concerns'][number]) => severityValues.indexOf(s.severity);

/**
 * Saves the subagent's defense for a request that's writing: ConflictError for any other id or state. The whole
 * payload is checked first (the schema, then its size, then the sections, claims, tables and diagram items, then
 * repeated questions, then the checklist) and any problem refuses all of it, listing every problem: nothing is written,
 * the last saved defense stays as it was, and the request stays writing so the subagent can send it again. Otherwise
 * the defense gets its ids (q1…, c1…, k1…, w-…), the section titles and order, its concerns most severe first, and
 * basedOn from the request; defense.json is written, then request.json removed.
 *
 * `checklist` is the rules file's (checklistLines), which the service passes. When it has lines, they're the
 * defense's checklist and the payload's is ignored. Otherwise the payload's is used, and must have lines, each once.
 */
export async function saveDefense(
  dir: string,
  o: { requestId: string; defense: unknown; types: PlumbingType[]; checklist?: string[]; now?: Date },
): Promise<WhiteboardDefense> {
  const now = o.now ?? new Date();
  const current = await readWhiteboardRequest(dir);
  if (current?.id !== o.requestId || current.state !== 'writing') throw new ConflictError(`There's no Whiteboard Defense request ${o.requestId} waiting for a defense.`);
  const parsed = defenseInputSchema.safeParse(o.defense);
  const problems = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  const size = JSON.stringify(o.defense ?? null).length;
  if (size > MAX_DEFENSE_CHARS) problems.push(`The defense is ${size.toLocaleString('en-US')} characters of JSON; the most is 120,000.`);
  problems.push(...sectionProblems(o.defense, await defenseDiagramItemIds(dir, o.types)));
  const sent = isObject(o.defense) ? o.defense : {};
  problems.push(...repeats(Array.isArray(sent.questions) ? sent.questions.map((q) => (isObject(q) ? q.q : undefined)) : [], 'questions', 'question'));
  // The rules file's checklist, when it has one. Otherwise the subagent's, which it then must send.
  const fromRules = o.checklist?.length ? o.checklist : null;
  if (!fromRules) {
    if (Array.isArray(sent.checklist) && sent.checklist.length === 0) problems.push('checklist: the rules file has no checklist, so send one.');
    problems.push(...repeats(sent.checklist, 'checklist', 'line'));
  }
  if (problems.length || !parsed.success) throw nothingSaved(problems, WHITEBOARD_RETRY);
  const input = parsed.data;

  // What the subagent read, recorded when the window picked the request up. A request saved some other way is based on now.
  const basis = current.basedOn ?? (await defenseBasis(dir));
  const inputsHash = current.inputsHash ?? (await defenseInputsHash(dir));
  const sections = new Map(input.sections.map((s) => [s.id, s]));
  const defense: WhiteboardDefense = {
    id: newId('w', now),
    generatedAt: now.toISOString(),
    basedOn: { kind: 'plan', doc: basis.doc, version: basis.version, inputsHash },
    level: input.level,
    levelReasons: input.levelReasons,
    sections: DEFENSE_SECTIONS.map(({ id, title }) => {
      const s = sections.get(id)!;
      return { id, title, claims: s.claims, tables: s.tables ?? [], diagram: s.diagram?.trim() ? s.diagram : null, diagramItemId: s.diagramItemId ?? null };
    }),
    questions: input.questions.map((q, i) => ({ id: `q${i + 1}`, q: q.q, a: q.a, basis: q.basis })),
    // Most severe first; concerns of the same severity keep the subagent's order.
    concerns: [...input.concerns].sort((a, b) => severityRank(a) - severityRank(b)).map((c, i) => ({ id: `c${i + 1}`, severity: c.severity, text: c.text, basis: c.basis })),
    checklist: (fromRules ?? input.checklist).map((text, i) => ({ id: `k${i + 1}`, text })),
  };
  await writeDefense(dir, defense);
  await removeWhiteboardRequest(dir);
  return defense;
}

/**
 * The window reported back (dp_wait's finished.whiteboard). If its subagent never sent a defense, the request fails
 * with the reason, so the page offers Try again: the subagent's own `Failed: …` line when the window passes it on
 * (`error`, cut to 500 characters), else WHITEBOARD_GAVE_UP. Anything else (another window, another request, a request
 * already saved and gone) is left alone.
 */
export async function finishWhiteboard(dir: string, o: { requestId: string; windowId: string; error?: string; now?: Date }): Promise<void> {
  const current = await readWhiteboardRequest(dir);
  if (current?.id !== o.requestId || current.state !== 'writing' || current.pickedUpBy !== o.windowId) return;
  const error = o.error?.trim();
  const reason = error ? clipReason(error) : WHITEBOARD_GAVE_UP;
  await writeWhiteboardRequest(dir, { ...current, state: 'failed', failedAt: (o.now ?? new Date()).toISOString(), reason });
}

/** A request being written by a window that went away goes back in the queue, for another window. True when it did. */
export async function requeueWhiteboard(dir: string, isAlive: (windowId: string) => boolean, now: Date = new Date()): Promise<boolean> {
  const current = await readWhiteboardRequest(dir);
  if (current?.state !== 'writing' || (current.pickedUpBy && isAlive(current.pickedUpBy))) return false;
  await writeWhiteboardRequest(dir, {
    ...current,
    state: 'requested',
    pickedUpAt: undefined,
    pickedUpBy: undefined,
    inputsHash: undefined,
    basedOn: undefined,
    requeuedAt: now.toISOString(),
  });
  return true;
}

/** Cancel: removes request.json, whatever its state. The saved defense is untouched. */
export async function cancelWhiteboard(dir: string): Promise<void> {
  await removeWhiteboardRequest(dir);
}

/**
 * The Out of date line for this defense, or null while the plan it explains is unchanged (defenseInputsHash). A defense
 * of the draft says so when it would now explain a final, because one was accepted since. A defense of a final whose
 * plan moved on would now explain the draft, so the plan changed.
 */
export async function defenseStale(dir: string, defense: WhiteboardDefense): Promise<string | null> {
  const basis = await defenseBasis(dir);
  if ((await inputsHashFor(dir, basis)) === defense.basedOn.inputsHash) return null;
  return defense.basedOn.doc === 'draft' && basis.doc === 'final'
    ? 'Out of date: a final was accepted since this was generated.'
    : 'Out of date: the plan changed since this was generated.';
}

/**
 * For the header and the navigation: whether there's a defense, whether it's out of date, and the request's state. It
 * never throws, so it can't break the project home: when the document can't be read, the defense counts as current.
 */
export async function defenseStatus(dir: string): Promise<ProjectHome['defense']> {
  const [defense, request] = await Promise.all([readDefense(dir), readWhiteboardRequest(dir)]);
  const state = request?.state ?? null;
  if (!defense) return { ready: false, stale: false, state };
  const stale = await defenseStale(dir, defense).then(
    (line) => line !== null,
    () => false,
  );
  return { ready: true, stale, state };
}
