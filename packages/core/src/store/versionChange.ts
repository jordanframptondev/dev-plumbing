import fs from 'node:fs/promises';
import { dataChangeSummary } from '../dataDiff';
import { diffText } from '../docDiff';
import { dataKindOf, itemSchema, type DiffSegment, type Item, type ItemVersionChange, type PlumbingType } from '../schemas';
import { stable } from './changes';
import { dataSummary } from './context';
import { reimportedRel } from './importItems';
import { docPath, readItem, readJsonFile, readThread } from './io';

// What a re-import leaves behind on an item it changed (reimportItem): the flag "Changed in the plan's v<n>.", the
// thread's line "Updated from the plan's v<n>." (a catch-up's names no version), and the item as it left it, in
// docs/versions/v<n>/reimported/. Answering the thread clears the flag, so the line and the copies are read too.
const FLAGGED = /^Changed in the plan's v([1-9][0-9]*)\.$/;
const UPDATED = /^Updated from the plan's v([1-9][0-9]*)\.$/;

/** The item as v<n>'s re-import left it, or null when it kept no copy (one from before Plan 7) or it can't be read. */
async function reimported(dir: string, n: number, itemId: string): Promise<Item | null> {
  const read = await readJsonFile(docPath(dir, reimportedRel(n, itemId)));
  const parsed = read.ok ? itemSchema.safeParse(read.value) : null;
  return parsed?.success ? parsed.data : null;
}

/** The versions whose re-import kept a copy of this item. */
async function copiedIn(dir: string, itemId: string): Promise<number[]> {
  const folders = await fs.readdir(docPath(dir, 'docs/versions')).catch((): string[] => []);
  const versions: number[] = [];
  for (const folder of folders) {
    const n = /^v([1-9][0-9]*)$/.exec(folder)?.[1];
    if (n && (await fs.stat(docPath(dir, reimportedRel(Number(n), itemId))).catch(() => null))) versions.push(Number(n));
  }
  return versions;
}

/** Text as whole lines, each ending in \n, so a line diff never pairs a last line with the next one. */
const lines = (text: string) => (text === '' || text.endsWith('\n') ? text : `${text}\n`);

/** The diff of two texts, or null when they're the same. */
const diffOrNull = (before: string, after: string): DiffSegment[] | null => (before === after ? null : diffText(before, after));

/** The item's fields as `key: value` lines, in the type's order, then any others by name. An empty field is no field. */
function fieldLines(item: Item, type: PlumbingType | undefined): string {
  const order = type?.fields ?? [];
  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length);
  return Object.entries(item.fields ?? {})
    .filter(([, value]) => value !== '')
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([key, value]) => `${key}: ${value}\n`)
    .join('');
}

/** What an item's drawing holds, in one line (dataSummary), or what stands in for it. */
function drawingLine(item: Item, type: PlumbingType | undefined): string {
  if (item.data === undefined || item.data === null) return 'No drawing';
  return dataSummary(item, type) ?? "A drawing that can't be read";
}

/**
 * The drawing, compared as words, not JSON: its summary line before and after, and after it, what changed
 * (dataChangeSummary: "1 box added, 1 line changed"). Null when the data is the same.
 */
function drawingChange(before: Item, after: Item, type: PlumbingType | undefined): DiffSegment[] | null {
  if (stable(before.data ?? null) === stable(after.data ?? null)) return null;
  const kind = type ? dataKindOf(type) : null;
  const what = kind && after.data !== undefined && after.data !== null ? dataChangeSummary(kind, before.data, after.data) : [];
  const said = what.length ? `${what.join(', ').replace(/^./, (c) => c.toUpperCase())}\n` : '';
  return diffText(`${drawingLine(before, type)}\n`, `${drawingLine(after, type)}\n${said}`);
}

/**
 * What the newest plan version that changed this item changed in it (spec §15.4, view only): its copy in
 * docs/versions/v<n-1>/items/, the snapshot the update to v<n> took before its re-import, against the item as that
 * re-import left it (docs/versions/v<n>/reimported/), so a change accepted afterwards isn't in it. With no such copy (a
 * re-import from before Plan 7) it's the item as it is now, and `since` says so. `n` is the newest version whose
 * re-import changed it, from its flag, its thread's line or its copies. Each part is a line diff, or null when it's
 * the same; all four null means only something else changed (its title, links or code references). Null when no
 * re-import changed the item, or the snapshot has no copy of it.
 */
export async function itemVersionChange(dir: string, itemId: string, types: PlumbingType[]): Promise<ItemVersionChange | null> {
  const item = await readItem(dir, itemId).catch(() => null);
  if (!item) return null;
  const thread = await readThread(dir, item.threadId).catch(() => null);
  const versions = [
    ...(item.flags ?? []).map((f) => FLAGGED.exec(f.reason)?.[1]),
    ...(thread?.messages ?? []).map((m) => (m.author === 'system' ? UPDATED.exec(m.text)?.[1] : undefined)),
  ].flatMap((n) => (n ? [Number(n)] : []));
  versions.push(...(await copiedIn(dir, item.id)));
  if (!versions.length) return null;
  const version = Math.max(...versions);
  // The snapshot folder has the same items/<id>.json layout as the project, so it reads like one.
  const before = await readItem(docPath(dir, `docs/versions/v${version - 1}`), item.id).catch(() => null);
  if (!before) return null;
  const left = await reimported(dir, version, item.id);
  const after = left ?? item;
  const type = types.find((t) => t.id === item.type);
  return {
    version,
    since: left === null,
    summary: diffOrNull(lines(before.summary), lines(after.summary)),
    body: diffOrNull(lines(before.body ?? ''), lines(after.body ?? '')),
    fields: diffOrNull(fieldLines(before, type), fieldLines(after, type)),
    drawing: drawingChange(before, after, type),
  };
}
