import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFENSE } from '../src/defenseType';
import { PLAN_CHANGES } from '../src/planChanges';
import { DEFENSE_SECTIONS, repoProfileSchema, type Item, type PlumbingType, type Thread } from '../src/schemas';
import { threadPack, whiteboardPack } from '../src/store/context';
import { addDecision } from '../src/store/decisions';
import { defenseMarkdown } from '../src/store/defenseMarkdown';
import { readProjectFile, writeProjectFile } from '../src/store/io';
import { writeDefense } from '../src/store/whiteboard';
import { removeTempDirs } from '../../../testkit/tmp';
import { listType, pair, seedProject, storedDefense, TYPES } from './fixtures';

afterAll(removeTempDirs);

const types: PlumbingType[] = [
  ...TYPES,
  listType('database', { title: 'Database', screen: 'database', order: 2 }),
  listType('ui', { title: 'UI changes', screen: 'mockups', order: 3 }),
  listType('flows', { title: 'Flows', screen: 'flows', order: 4 }),
  listType('ideas', { title: 'Ideas', order: 7, enabled: false }),
];
const profile = repoProfileSchema.parse({
  name: 'acme',
  match: ['github.com/acme/acme'],
  conventions: ['Ids use uuid()'],
  sensitiveData: ['PII', 'payments'],
  schema: { type: 'prisma', path: 'prisma/schema.prisma' },
  apps: [{ name: 'web', path: 'apps/web', kitFiles: ['apps/web/src/kit.tsx'] }],
});
/** The rules file the service picked, which the subagent Reads. */
const RULES_FILE = '/Users/you/.dev-plumbing/outputs/whiteboard-defense.md';
const DIAGRAM = { kind: 'system', groups: [], nodes: [{ id: 'job', label: 'Reminder job', status: 'new' }], edges: [] };
const TABLE = { model: 'RestockReminder', change: 'new', fields: [{ name: 'sentAt', type: 'DateTime', change: 'added' }] };
const FLOW = { kind: 'user', steps: [{ n: 1, label: 'Opens the reminder' }] };
const MOCKUP = { location: { app: 'web', route: '/account', files: [] }, kit: 'web', after: '<div>Soon</div>' };

/** An item with drawing data and its thread. */
const drawn = (id: string, o: Parameters<typeof pair>[1] & { data: unknown }) => {
  const p = pair(id, o);
  return { item: { ...p.item, data: o.data }, thread: p.thread };
};
const itemFile = (dir: string, id: string) => path.join(dir, 'items', `${id}.json`);

/**
 * One item of each drawn kind, a diagram item with no drawing yet, plain questions (one blocking, one with a default),
 * and the items the whiteboard leaves out: a parked one, one of a disabled type, a Plan changes item and a Defense item.
 * A decision on a question, and one made in the Defense thread.
 */
async function seed(): Promise<string> {
  const pairs: { item: Item; thread: Thread }[] = [
    drawn('architecture-system', { type: 'architecture', title: 'System view', status: 'idle', data: DIAGRAM }),
    pair('architecture-later', { type: 'architecture', title: 'Later view', status: 'idle' }),
    drawn('database-reminder', { type: 'database', title: 'Restock reminder table', status: 'resolved', data: TABLE }),
    drawn('ui-card', { type: 'ui', title: 'Restock card', status: 'resolved', data: MOCKUP }),
    drawn('flows-reorder', { type: 'flows', title: 'Reorder from a reminder', status: 'resolved', data: FLOW }),
    pair('q-channel', { title: 'Reminder channel', status: 'resolved' }),
    pair('q-who', { title: 'Who gets reminders?', fields: { default: 'Everyone active' } }),
    pair('q-launch', { title: 'Launch date?', fields: { blocking: 'true' } }),
    drawn('architecture-old', { type: 'architecture', title: 'Old view', status: 'parked', data: DIAGRAM }),
    pair('ideas-push', { type: 'ideas', title: 'Push reminders' }),
    pair('plan-changes-v2-1', { type: PLAN_CHANGES, title: 'Data' }),
    pair('defense-why-a-job', { type: DEFENSE, title: 'Why a daily job?', status: 'resolved' }),
  ];
  const dir = await seedProject({ pairs });
  await addDecision(dir, { text: 'Reminder channel: Email', threadId: 't-q-channel', itemIds: ['q-channel'] });
  await addDecision(dir, { text: 'A daily job is enough', threadId: 't-defense-why-a-job', itemIds: ['defense-why-a-job'] });
  return dir;
}

describe("the whiteboard subagent's context pack", () => {
  it('gives the subagent the files to read, the profile and the sections to fill', async () => {
    const dir = await seed();
    const pack = await whiteboardPack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.project).toEqual({ repo: 'acme', id: 'restock', title: 'Restock reminders', sourcePath: 'docs/specs/restock.md', name: 'restock' });
    expect(pack.rulesFile).toBe(RULES_FILE);
    expect(pack.basedOn).toEqual({ doc: 'draft', version: 1 });
    expect(pack.documentFile).toBe(path.join(dir, 'docs', 'draft.md'));
    expect(pack.conventions).toEqual(['Ids use uuid()']);
    expect(pack.sensitiveData).toEqual(['PII', 'payments']);
    expect(pack.schema).toEqual({ type: 'prisma', path: 'prisma/schema.prisma' });
    expect(pack.apps).toEqual([{ name: 'web', path: 'apps/web' }]);
    expect(pack.sections).toEqual(DEFENSE_SECTIONS);
    expect(pack.previous).toBeNull();
  });

  it('explains the final while it is current', async () => {
    const dir = await seed();
    const project = await readProjectFile(dir);
    await writeProjectFile(dir, { ...project, docs: { ...project.docs, final: 'docs/final.md' } });
    await fs.writeFile(path.join(dir, 'docs', 'final.md'), '# Restock reminders\n\nThe final.\n');
    const pack = await whiteboardPack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.basedOn).toEqual({ doc: 'final', version: 1 });
    expect(pack.documentFile).toBe(path.join(dir, 'docs', 'final.md'));
  });

  it("lists the final's items with their files, draws only diagrams, and lists every open item", async () => {
    const dir = await seed();
    const pack = await whiteboardPack({ dir, types, profile, rulesFile: RULES_FILE });
    // Parked, disabled, Plan changes and Defense items aren't part of the plan the defense explains.
    expect(pack.items.map((i) => [i.id, i.data])).toEqual([
      ['architecture-later', null],
      ['architecture-system', DIAGRAM],
      // A table, a mockup or a flow is summarised: the subagent Reads the item's file for the rest.
      ['database-reminder', null],
      ['ui-card', null],
      ['flows-reorder', null],
      ['q-launch', null],
      ['q-channel', null],
      ['q-who', null],
    ]);
    expect(pack.items[1]).toMatchObject({ typeTitle: 'Architecture', status: 'idle', dataSummary: 'System diagram: 1 box', file: itemFile(dir, 'architecture-system') });
    expect(pack.items[2].file).toBe(itemFile(dir, 'database-reminder'));
    expect(JSON.parse(await fs.readFile(pack.items[2].file, 'utf8')).data).toEqual(TABLE);
    expect(pack.diagramItemIds).toEqual(['architecture-system']);
    // The Defense thread's decision is about the defense, not the plan.
    expect(pack.decisions.map((d) => d.text)).toEqual(['Reminder channel: Email']);
    expect(pack.defaults).toEqual([{ itemId: 'q-who', title: 'Who gets reminders?', defaultValue: 'Everyone active' }]);
    // Everything not resolved or parked, blocking or not.
    expect(pack.openItems).toEqual([
      { itemId: 'architecture-later', title: 'Later view', typeTitle: 'Architecture', status: 'idle', blocking: false },
      { itemId: 'architecture-system', title: 'System view', typeTitle: 'Architecture', status: 'idle', blocking: false },
      { itemId: 'q-launch', title: 'Launch date?', typeTitle: 'Questions', status: 'your_turn', blocking: true },
      { itemId: 'q-who', title: 'Who gets reminders?', typeTitle: 'Questions', status: 'your_turn', blocking: false },
    ]);
  });

  it("carries the last defense's questions and unknowns, so a regenerate can keep their wording", async () => {
    const dir = await seed();
    await writeDefense(dir, storedDefense());
    expect((await whiteboardPack({ dir, types, profile, rulesFile: RULES_FILE })).previous).toEqual({
      questions: ['What stops a customer getting two reminders?', 'Where does the renewal date come from?', 'What happens when the mailer is down?'],
      unknowns: [
        'Whether the unsubscribe link needs a signed token.',
        'If the job runs twice in a day, the log stops a second email.',
        'Nothing alerts anyone when the job fails to run.',
        'How many emails a day the mail provider allows.',
      ],
    });
  });

  it('stays small on a big plan: 40 items with long bodies, five of them drawn', async () => {
    const BIG_DIAGRAM = {
      kind: 'system',
      groups: [],
      nodes: ['job', 'db', 'mailer', 'queue', 'log', 'admin'].map((id) => ({ id, label: `The ${id} box`, status: 'new' })),
      edges: ['db', 'mailer', 'queue', 'log', 'admin'].map((to, i) => ({ id: `e${i}`, from: 'job', to, label: `job to ${to}` })),
    };
    const sentence = 'The reminder job reads the subscriptions table and sends one email per subscription that is due. ';
    const pairs = Array.from({ length: 40 }, (_, i) => {
      const drawnOne = i < 5;
      const id = drawnOne ? `architecture-view-${i + 1}` : `q-${i + 1}`;
      const p = pair(id, { type: drawnOne ? 'architecture' : 'questions', title: drawnOne ? `View ${i + 1}` : `Question ${i + 1}?` });
      return { item: { ...p.item, body: `${i + 1}. ${sentence.repeat(60)}`.slice(0, 5000), ...(drawnOne ? { data: BIG_DIAGRAM } : {}) }, thread: p.thread };
    });
    const dir = await seedProject({ pairs });
    const pack = await whiteboardPack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.items).toHaveLength(40);
    for (const item of pack.items) {
      expect(item.body).toHaveLength(800 + '… (clipped: Read file for the rest)'.length);
      expect(item.body).toMatch(/… \(clipped: Read file for the rest\)$/);
    }
    expect(pack.items.filter((i) => i.data !== null)).toHaveLength(5);
    expect(JSON.stringify(pack).length).toBeLessThan(60_000);
  });

  it('works with no profile', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { title: 'Who gets reminders?' })] });
    const pack = await whiteboardPack({ dir, types, rulesFile: RULES_FILE });
    expect(pack.conventions).toEqual([]);
    expect(pack.sensitiveData).toEqual([]);
    expect(pack.schema).toBeNull();
    expect(pack.apps).toEqual([]);
    expect(pack.diagramItemIds).toEqual([]);
  });
});

describe("a thread pack's defense", () => {
  it('gives a thread about the Whiteboard Defense the whole defense, and other threads none', async () => {
    const defense = storedDefense();
    const asked = pair('defense-why-a-job', { type: DEFENSE, title: 'Why a daily job?' });
    const sent = pair('questions-who-can-turn-reminders-off', { title: 'Who can turn reminders off?' });
    const dir = await seedProject({
      pairs: [
        { ...asked, item: { ...asked.item, createdBy: 'whiteboard', fromDefense: { id: defense.id, kind: 'section', ref: 'walkthrough' } } },
        { ...sent, item: { ...sent.item, createdBy: 'whiteboard', fromDefense: { id: defense.id, kind: 'claim', ref: 'security.1' } } },
        pair('q-who', { title: 'Who gets reminders?' }),
      ],
    });
    await writeDefense(dir, defense);
    const markdown = defenseMarkdown(defense, { title: 'Restock reminders' });
    expect((await threadPack({ dir, threadId: 't-defense-why-a-job', types, profile })).defense).toBe(markdown);
    expect((await threadPack({ dir, threadId: 't-questions-who-can-turn-reminders-off', types, profile })).defense).toBe(markdown);
    expect((await threadPack({ dir, threadId: 't-q-who', types, profile })).defense).toBeNull();

    // With the defense gone, there's nothing to give.
    await fs.rm(path.join(dir, 'whiteboard', 'defense.json'));
    expect((await threadPack({ dir, threadId: 't-defense-why-a-job', types, profile })).defense).toBeNull();
  });

  it("gives every thread the final's path once there is one", async () => {
    const dir = await seedProject({ pairs: [pair('q-who', { title: 'Who gets reminders?' })] });
    expect((await threadPack({ dir, threadId: 't-q-who', types })).finalFile).toBeNull();
    const project = await readProjectFile(dir);
    await writeProjectFile(dir, { ...project, docs: { ...project.docs, final: 'docs/final.md' } });
    expect((await threadPack({ dir, threadId: 't-q-who', types })).finalFile).toBe(path.join(dir, 'docs', 'final.md'));
  });

  it("names a section's diagram item by its title", async () => {
    const base = storedDefense();
    const defense = storedDefense({ sections: base.sections.map((s) => (s.id === 'diagram' ? { ...s, diagramItemId: 'architecture-system' } : s)) });
    const asked = pair('defense-the-diagram', { type: DEFENSE, title: 'The diagram?' });
    const dir = await seedProject({
      pairs: [
        drawn('architecture-system', { type: 'architecture', title: 'System view', data: DIAGRAM }),
        { ...asked, item: { ...asked.item, createdBy: 'whiteboard', fromDefense: { id: defense.id, kind: 'section', ref: 'diagram' } } },
      ],
    });
    await writeDefense(dir, defense);
    expect((await threadPack({ dir, threadId: 't-defense-the-diagram', types })).defense).toContain('Diagram: System view (in dev-plumbing).');
  });
});
