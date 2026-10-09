import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PLAN_CHANGES_TYPE } from '../src/planChanges';
import type { DiagramData, ImportItem, Item } from '../src/schemas';
import { loadThreadDetail } from '../src/store/detail';
import { writeImportBatch } from '../src/store/importItems';
import { readItem, readProjectFile, writeItem, writeProjectFile } from '../src/store/io';
import { recoverUnfinishedUpdate, updatePlan } from '../src/store/update';
import { itemVersionChange } from '../src/store/versionChange';
import { planHash, snapshotVersion } from '../src/store/versions';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const T2 = new Date('2026-10-05T10:00:00.000Z');
const T3 = new Date('2026-10-06T10:00:00.000Z');
const types = [...TYPES, PLAN_CHANGES_TYPE];
const V2 = DRAFT.replace('A daily job', 'An hourly job');
const V3 = V2.replace('Log reminders in a table.', 'Log reminders in the events table.');
const MAP: DiagramData = {
  kind: 'system',
  groups: [{ id: 'worker', label: 'apps/worker' }],
  nodes: [
    { id: 'job', label: 'Daily reminder job', group: 'worker', status: 'new' },
    { id: 'db', label: 'Postgres', status: 'unchanged' },
  ],
  edges: [{ id: 'e1', from: 'job', to: 'db', label: 'finds due' }],
};
/** v2's map: a new box, and a line to it. */
const MAP_V2: DiagramData = {
  ...MAP,
  nodes: [...MAP.nodes, { id: 'sms', label: 'SMS provider', status: 'new' }],
  edges: [...MAP.edges, { id: 'e2', from: 'job', to: 'sms', label: 'sends' }],
};
/** v2's map of the flow: the same boxes, one relabelled. */
const FLOW: DiagramData = { kind: 'data_flow', groups: [], nodes: [{ id: 'job', label: 'Daily job', status: 'new' }, { id: 'db', label: 'Postgres', status: 'unchanged' }], edges: [] };
const FLOW_V2: DiagramData = { ...FLOW, nodes: [{ id: 'job', label: 'Hourly job', status: 'new' }, FLOW.nodes[1]!] };

/** An item an importer wrote for `key` at v1 (id <type>-<key>), with a thread that's idle. */
function imported(key: string, o: { type?: string; item?: Partial<Item> } = {}) {
  const type = o.type ?? 'questions';
  const p = pair(`${type}-${key}`, { type, title: `Question ${key}`, status: 'idle', messages: [] });
  return { ...p, item: { ...p.item, key, ...o.item } };
}

/** A project at v1, with the items the tests change. */
const seed = () =>
  seedProject({
    project: { source: { path: 'docs/specs/restock.md', clone: '/tmp/acme', branch: 'main', hashAtImport: planHash(DRAFT) } },
    pairs: [
      imported('who', { item: { summary: 'Everyone, or only active subscribers?', body: 'Line one.\nLine two.', fields: { blocking: 'false', default: 'Everyone' } } }),
      imported('when', { item: { fields: { blocking: 'false' } } }),
      imported('same'),
      imported('renamed'),
      imported('map', { type: 'architecture', item: { data: MAP } }),
      imported('flow', { type: 'architecture', item: { data: FLOW } }),
    ],
  });

/** Brings `repoText` in as the next version, then the importers send `batches` (type id → items), "no changes" for the rest. */
async function reimport(dir: string, repoText: string, batches: Record<string, ImportItem[]>, now: Date) {
  const update = await updatePlan(dir, { repoText, clone: '/tmp/acme', branch: 'main', commit: null, types, now });
  for (const id of update.importTypes) {
    const type = types.find((t) => t.id === id)!;
    const items = batches[id];
    await writeImportBatch({ dir, type, types, clone: '/tmp/acme', now, batch: items ? { items } : { noChanges: 'Nothing changed for this type.' } });
  }
}

/** The project at v2, its importers having changed who, when, renamed, map and flow, and left same as it was. */
async function atV2() {
  const dir = await seed();
  await reimport(
    dir,
    V2,
    {
      questions: [
        { key: 'who', summary: 'Only active subscribers, at first.', body: 'Line one.\nLine 2.' },
        { key: 'when', fields: { blocking: 'true' } },
        { key: 'same', title: 'Question same', summary: 'A summary.' },
        { key: 'renamed', title: 'When do reminders go out?' },
        { key: 'new', title: 'Which channel?', summary: 'SMS or email.' },
      ],
      architecture: [
        { key: 'map', data: MAP_V2 },
        { key: 'flow', data: FLOW_V2 },
      ],
    },
    T2,
  );
  return dir;
}

describe('what a re-import changed in an item', () => {
  it('diffs the summary and the body, line by line, and leaves out what stayed the same', async () => {
    const dir = await atV2();
    expect(await itemVersionChange(dir, 'questions-who', types)).toEqual({
      version: 2,
      since: false,
      summary: [
        { kind: 'removed', text: 'Everyone, or only active subscribers?\n' },
        { kind: 'added', text: 'Only active subscribers, at first.\n' },
      ],
      body: [
        { kind: 'same', text: 'Line one.\n' },
        { kind: 'removed', text: 'Line two.\n' },
        { kind: 'added', text: 'Line 2.\n' },
      ],
      fields: null,
      drawing: null,
    });
  });

  it('diffs the fields as key: value lines', async () => {
    const dir = await atV2();
    expect(await itemVersionChange(dir, 'questions-when', types)).toEqual({
      version: 2,
      since: false,
      summary: null,
      body: null,
      fields: [
        { kind: 'removed', text: 'blocking: false\n' },
        { kind: 'added', text: 'blocking: true\n' },
      ],
      drawing: null,
    });
  });

  it('diffs the drawing as its summary line, and says what changed in it', async () => {
    const dir = await atV2();
    expect((await itemVersionChange(dir, 'architecture-map', types))?.drawing).toEqual([
      { kind: 'removed', text: 'System diagram: 2 boxes, 1 group\n' },
      { kind: 'added', text: 'System diagram: 3 boxes, 1 group\n1 box added, 1 line added\n' },
    ]);
    // A relabelled box leaves the summary line as it was: what changed says so.
    expect(await itemVersionChange(dir, 'architecture-flow', types)).toEqual({
      version: 2,
      since: false,
      summary: null,
      body: null,
      fields: null,
      drawing: [
        { kind: 'same', text: 'Data flow diagram: 2 boxes\n' },
        { kind: 'added', text: '1 box changed\n' },
      ],
    });
  });

  it('has nothing to show when only something else changed, such as the title', async () => {
    const dir = await atV2();
    expect(await readItem(dir, 'questions-renamed')).toMatchObject({ title: 'When do reminders go out?', flags: [{ reason: "Changed in the plan's v2." }] });
    expect(await itemVersionChange(dir, 'questions-renamed', types)).toEqual({ version: 2, since: false, summary: null, body: null, fields: null, drawing: null });
  });

  it("is null for an item the re-import didn't change, and for one it added", async () => {
    const dir = await atV2();
    expect(await itemVersionChange(dir, 'questions-same', types)).toBeNull();
    expect(await itemVersionChange(dir, 'questions-new', types)).toBeNull();
    expect(await itemVersionChange(dir, 'questions-nope', types)).toBeNull();
  });

  it('is null when the version snapshot has no copy of the item', async () => {
    const dir = await atV2();
    await fs.rm(path.join(dir, 'docs', 'versions', 'v1', 'items', 'questions-who.json'));
    expect(await itemVersionChange(dir, 'questions-who', types)).toBeNull();
  });

  it("still shows once the flag is cleared, as answering the thread does, from the thread's line", async () => {
    const dir = await atV2();
    const { flags: _flags, ...answered } = await readItem(dir, 'questions-when');
    await writeItem(dir, answered);
    expect((await itemVersionChange(dir, 'questions-when', types))?.fields).toEqual([
      { kind: 'removed', text: 'blocking: false\n' },
      { kind: 'added', text: 'blocking: true\n' },
    ]);
  });

  it('shows the newest version that changed the item, against the snapshot taken just before it', async () => {
    const dir = await atV2();
    await reimport(dir, V3, { questions: [{ key: 'who', summary: 'Active subscribers, then everyone.' }] }, T3);
    expect(await itemVersionChange(dir, 'questions-who', types)).toEqual({
      version: 3,
      since: false,
      summary: [
        { kind: 'removed', text: 'Only active subscribers, at first.\n' },
        { kind: 'added', text: 'Active subscribers, then everyone.\n' },
      ],
      body: null,
      fields: null,
      drawing: null,
    });
    // v3 left when alone: it still shows what v2 changed.
    expect((await itemVersionChange(dir, 'questions-when', types))?.version).toBe(2);
  });

  it("shows only what the re-import did: a change accepted afterwards isn't in it", async () => {
    const dir = await atV2();
    // An accepted change rewrites the item's summary after the re-import, and clears its flag.
    const { flags: _flags, ...item } = await readItem(dir, 'questions-who');
    await writeItem(dir, { ...item, summary: 'Active subscribers who opted in.' });
    expect((await itemVersionChange(dir, 'questions-who', types))?.summary).toEqual([
      { kind: 'removed', text: 'Everyone, or only active subscribers?\n' },
      { kind: 'added', text: 'Only active subscribers, at first.\n' },
    ]);
    // The re-import's own copy, beside v2's merged.md, is the item as it left it.
    const copy = JSON.parse(await fs.readFile(path.join(dir, 'docs', 'versions', 'v2', 'reimported', 'questions-who.json'), 'utf8'));
    expect(copy).toMatchObject({ id: 'questions-who', summary: 'Only active subscribers, at first.', flags: [{ reason: "Changed in the plan's v2." }] });
    // Only changed items have one.
    expect((await fs.readdir(path.join(dir, 'docs', 'versions', 'v2', 'reimported'))).sort()).toEqual(
      ['architecture-flow', 'architecture-map', 'questions-renamed', 'questions-when', 'questions-who'].map((id) => `${id}.json`),
    );
  });

  it("compares with the item as it is now, as changed since before v<n>, when the re-import kept no copy", async () => {
    // A re-import from before Plan 7 kept none.
    const dir = await atV2();
    await fs.rm(path.join(dir, 'docs', 'versions', 'v2', 'reimported'), { recursive: true });
    const { flags: _flags, ...item } = await readItem(dir, 'questions-who');
    await writeItem(dir, { ...item, summary: 'Active subscribers who opted in.' });
    expect(await itemVersionChange(dir, 'questions-who', types)).toMatchObject({
      version: 2,
      since: true,
      summary: [
        { kind: 'removed', text: 'Everyone, or only active subscribers?\n' },
        { kind: 'added', text: 'Active subscribers who opted in.\n' },
      ],
    });
  });

  it("a catch-up's re-import of the same version writes its copy again, and still names v<n>", async () => {
    const dir = await atV2();
    // A catch-up re-imports v2 again (Task 7), and changes who once more. Its thread line names no version.
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), status: 'importing', importPending: ['questions'], reimporting: { version: 2, from: 'active', catchUp: true } });
    const questions = types.find((t) => t.id === 'questions')!;
    await writeImportBatch({ dir, type: questions, types, clone: '/tmp/acme', now: T3, batch: { items: [{ key: 'who', summary: 'Active subscribers, by email.' }] } });
    const { flags: _flags, ...answered } = await readItem(dir, 'questions-who');
    await writeItem(dir, answered);
    expect(await itemVersionChange(dir, 'questions-who', types)).toMatchObject({
      version: 2,
      since: false,
      summary: [
        { kind: 'removed', text: 'Everyone, or only active subscribers?\n' },
        { kind: 'added', text: 'Active subscribers, by email.\n' },
      ],
    });
  });

  it('keeps the copies with their version when an update to the next one is put back or set aside', async () => {
    const dir = await atV2();
    const versions = path.join(dir, 'docs', 'versions');
    const draft = await fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8');
    /** An update to v3 that stopped before project.json, with v2's snapshot and its journal, as Plan 5 leaves one. */
    const stopped = async (merged: string) => {
      await fs.writeFile(path.join(versions, 'v2', 'update.json'), JSON.stringify({ to: 3, created: ['docs/versions/v3', 'docs/versions/v3/merged.md'], wrote: { draft: planHash(merged), original: planHash(V3) } }));
      await snapshotVersion(dir, 2);
      await fs.mkdir(path.join(versions, 'v3'), { recursive: true });
      await fs.writeFile(path.join(versions, 'v3', 'merged.md'), merged);
      await fs.writeFile(path.join(dir, 'docs', 'draft.md'), merged);
      await fs.writeFile(path.join(dir, 'docs', 'original.md'), V3);
    };
    // Put back whole: v2's snapshot goes, and its folder stays for merged.md and the copies.
    await stopped(`${draft}\nThe update's merge.\n`);
    expect(await recoverUnfinishedUpdate(dir, T3)).toMatchObject({ recovered: true, setAside: null });
    expect((await fs.readdir(path.join(versions, 'v2'))).sort()).toEqual(['merged.md', 'reimported']);
    // Set aside, because you changed the draft since: the copies go back to v2 with merged.md, not with the leftover.
    await stopped(`${draft}\nThe update's merge.\n`);
    await fs.writeFile(path.join(dir, 'docs', 'draft.md'), `${draft}\nThe update's merge, and your edit.\n`);
    const note = await recoverUnfinishedUpdate(dir, T3);
    expect(note).toMatchObject({ recovered: true, setAside: 'docs/versions/v2.unfinished-20261006100000' });
    expect((await fs.readdir(path.join(versions, 'v2'))).sort()).toEqual(['merged.md', 'reimported']);
    expect((await fs.readdir(path.join(versions, 'v2.unfinished-20261006100000'))).sort()).toEqual(['draft.md', 'items', 'original.md', 'update.json']);
    expect((await itemVersionChange(dir, 'questions-who', types))?.summary).toEqual([
      { kind: 'removed', text: 'Everyone, or only active subscribers?\n' },
      { kind: 'added', text: 'Only active subscribers, at first.\n' },
    ]);
  });

  it('comes with the thread', async () => {
    const dir = await atV2();
    const detail = await loadThreadDetail({ dir, threadId: 't-questions-who', types });
    expect(detail.versionChange).toEqual(await itemVersionChange(dir, 'questions-who', types));
    expect(detail.versionChange?.version).toBe(2);
    expect((await loadThreadDetail({ dir, threadId: 't-questions-same', types })).versionChange).toBeNull();
  });
});
