import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { writeFileAtomic, writeJsonAtomic } from '../atomic';
import {
  decisionSchema,
  historyEntrySchema,
  itemSchema,
  plumbingProjectSchema,
  submissionSchema,
  threadSchema,
  type Decision,
  type HistoryEntry,
  type Item,
  type PlumbingProject,
  type Submission,
  type Thread,
} from '../schemas';

/** Something asked for doesn't exist, or a file is damaged. */
export class StoreError extends Error {}
/** The caller sent something unusable. The message says what to fix. */
export class InputError extends Error {}
/** The request made sense, but the project has moved on since (for example, the draft changed). */
export class ConflictError extends Error {}

export type JsonRead = { ok: true; value: unknown } | { ok: false; error: string };
type Schema<T> = { safeParse: (v: unknown) => { success: true; data: T } | { success: false } };

export async function readJsonFile(file: string): Promise<JsonRead> {
  try {
    return { ok: true, value: JSON.parse(await fs.readFile(file, 'utf8')) };
  } catch (e) {
    return { ok: false, error: (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : (e as Error).message };
  }
}

/** Every .json file in a folder that matches the schema. Damaged files are counted, not thrown. */
export async function readFolder<T>(dir: string, schema: Schema<T>): Promise<{ values: T[]; bad: number }> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { values: [], bad: 0 };
    return { values: [], bad: 1 };
  }
  const values: T[] = [];
  let bad = 0;
  for (const f of files) {
    const r = await readJsonFile(path.join(dir, f));
    const parsed = r.ok ? schema.safeParse(r.value) : null;
    if (parsed?.success) values.push(parsed.data);
    else bad++;
  }
  return { values, bad };
}

export const projectFiles = (dir: string) => ({
  project: path.join(dir, 'project.json'),
  items: path.join(dir, 'items'),
  item: (id: string) => path.join(dir, 'items', `${id}.json`),
  threads: path.join(dir, 'threads'),
  thread: (id: string) => path.join(dir, 'threads', `${id}.json`),
  decisions: path.join(dir, 'decisions.json'),
  submissions: path.join(dir, 'submissions'),
  submission: (id: string) => path.join(dir, 'submissions', `${id}.json`),
  history: path.join(dir, 'history'),
  historyEntry: (id: string) => path.join(dir, 'history', `${id}.json`),
});

let seq = 0;
/** <prefix>-<17-digit UTC time><4-digit counter>-<4 hex>. File-safe, and sorts in creation order within a process. */
export function newId(prefix: string, now: Date = new Date()): string {
  seq = (seq + 1) % 10_000;
  return `${prefix}-${now.toISOString().replace(/\D/g, '').slice(0, 17)}${String(seq).padStart(4, '0')}-${randomBytes(2).toString('hex')}`;
}

async function readParsed<T>(file: string, schema: Schema<T>, what: string): Promise<T> {
  const r = await readJsonFile(file);
  if (!r.ok) throw new StoreError(r.error === 'missing' ? `${what} doesn't exist.` : `${what} can't be read (${r.error}).`);
  const parsed = schema.safeParse(r.value);
  if (!parsed.success) throw new StoreError(`${what} doesn't have the expected shape.`);
  return parsed.data;
}

const safe = (id: string) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw new StoreError(`"${id}" isn't a valid id.`);
  return id;
};

export const readProjectFile = (dir: string): Promise<PlumbingProject> => readParsed(projectFiles(dir).project, plumbingProjectSchema, 'project.json');
export const writeProjectFile = (dir: string, project: PlumbingProject) => writeJsonAtomic(projectFiles(dir).project, project);
export const readItem = (dir: string, id: string): Promise<Item> => readParsed(projectFiles(dir).item(safe(id)), itemSchema, `Item ${id}`);
export const writeItem = (dir: string, item: Item) => writeJsonAtomic(projectFiles(dir).item(safe(item.id)), item);
export const readThread = (dir: string, id: string): Promise<Thread> => readParsed(projectFiles(dir).thread(safe(id)), threadSchema, `Thread ${id}`);
export const writeThread = (dir: string, thread: Thread) => writeJsonAtomic(projectFiles(dir).thread(safe(thread.id)), thread);
export const readItems = (dir: string) => readFolder<Item>(projectFiles(dir).items, itemSchema);
export const readThreads = (dir: string) => readFolder<Thread>(projectFiles(dir).threads, threadSchema);

export async function readDecisions(dir: string): Promise<Decision[]> {
  const r = await readJsonFile(projectFiles(dir).decisions);
  if (!r.ok) return [];
  const parsed = z.array(decisionSchema).safeParse(r.value);
  return parsed.success ? parsed.data : [];
}
export const writeDecisions = (dir: string, decisions: Decision[]) => writeJsonAtomic(projectFiles(dir).decisions, decisions);

export async function readSubmissions(dir: string): Promise<Submission[]> {
  const { values } = await readFolder<Submission>(projectFiles(dir).submissions, submissionSchema);
  return values.sort((a, b) => a.id.localeCompare(b.id));
}
export const readSubmission = (dir: string, id: string): Promise<Submission> =>
  readParsed(projectFiles(dir).submission(safe(id)), submissionSchema, `Submission ${id}`);
export const writeSubmission = (dir: string, s: Submission) => writeJsonAtomic(projectFiles(dir).submission(safe(s.id)), s);

export async function readHistory(dir: string): Promise<HistoryEntry[]> {
  const { values } = await readFolder<HistoryEntry>(projectFiles(dir).history, historyEntrySchema);
  return values.sort((a, b) => a.id.localeCompare(b.id));
}
export const readHistoryEntry = (dir: string, id: string): Promise<HistoryEntry> =>
  readParsed(projectFiles(dir).historyEntry(safe(id)), historyEntrySchema, `Change ${id}`);
export const writeHistoryEntry = (dir: string, h: HistoryEntry) => writeJsonAtomic(projectFiles(dir).historyEntry(safe(h.id)), h);

/** A document path inside the project folder. */
export function docPath(dir: string, rel: string): string {
  const base = path.resolve(dir);
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep)) throw new StoreError('That document is outside the project folder.');
  return file;
}

export async function readDocText(dir: string, rel: string): Promise<string> {
  const file = docPath(dir, rel);
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    throw new StoreError(`${rel} can't be read.`);
  }
}
export const writeDocText = (dir: string, rel: string, text: string) => writeFileAtomic(docPath(dir, rel), text);

export async function touchProject(dir: string, now: Date): Promise<void> {
  const project = await readProjectFile(dir);
  await writeProjectFile(dir, { ...project, updatedAt: now.toISOString() });
}
