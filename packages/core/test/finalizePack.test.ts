import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { availableTokens } from '../src/finalExport';
import { PLAN_CHANGES_TYPE } from '../src/planChanges';
import { repoProfileSchema, type ClaudeMessage, type Item, type Message, type PlumbingType, type Thread, type YouMessage } from '../src/schemas';
import { finalizePack } from '../src/store/context';
import { addDecision } from '../src/store/decisions';
import { readItems } from '../src/store/io';
import { setParked } from '../src/store/threads';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, listType, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const types: PlumbingType[] = [
  ...TYPES,
  listType('database', { title: 'Database', screen: 'database', order: 2 }),
  listType('ui', { title: 'UI changes', screen: 'mockups', order: 3 }),
  listType('flows', { title: 'Flows', screen: 'flows', order: 4 }),
  listType('phases', { title: 'Phases & milestones', timeline: true, order: 8 }),
];
const profile = repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'], conventions: ['Ids use uuid()'] });
/** The rules file the service picked. The pack only names it: the finalizer Reads it. */
const RULES_FILE = '/Users/you/.dev-plumbing/outputs/finalize.md';
const CLIPPED = '… (clipped: Read file for the rest)';
const LONG_WHY = `Accepting the risk: ${'volume is low and sends are spread across the day. '.repeat(20)}`;

const claude = (id: string, at: string, text: string, extra: Partial<ClaudeMessage> = {}): Message => ({ id, at, author: 'claude', text, ...extra });
const you = (id: string, at: string, extra: Partial<YouMessage> = {}): Message => ({ id, at, author: 'you', ...extra });
const system = (id: string, at: string, text: string): Message => ({ id, at, author: 'system', text });
/** An item with drawing data and its thread. */
const drawn = (id: string, o: Parameters<typeof pair>[1] & { data: unknown; body?: string; codeRefs?: Item['codeRefs'] }) => {
  const p = pair(id, o);
  return { item: { ...p.item, data: o.data, ...(o.body ? { body: o.body } : {}), ...(o.codeRefs ? { codeRefs: o.codeRefs } : {}) }, thread: p.thread };
};

/** A project with one item of every kind, a decided option, a preset answer Claude resolved, a default, a parked item and an earlier final. */
async function seed(): Promise<string> {
  const pairs: { item: Item; thread: Thread }[] = [
    drawn('architecture-system', {
      type: 'architecture',
      title: 'System view',
      status: 'idle',
      body: 'How the reminder parts fit together.',
      codeRefs: [{ path: 'apps/worker/jobs/restock.ts', verified: true }],
      data: {
        kind: 'system',
        groups: [{ id: 'web', label: 'Web' }, { id: 'jobs', label: 'Jobs' }],
        nodes: [
          { id: 'page', label: 'Account page', group: 'web', status: 'changed' },
          { id: 'job', label: 'Reminder job', group: 'jobs', status: 'new' },
          { id: 'email', label: 'Email provider', status: 'external' },
        ],
        edges: [{ id: 'e1', from: 'job', to: 'email', label: 'sends' }],
      },
    }),
    drawn('architecture-broken', { type: 'architecture', title: 'Broken view', status: 'idle', data: { kind: 'system', nodes: [] } }),
    drawn('database-reminder', {
      type: 'database',
      title: 'Restock reminder table',
      status: 'resolved',
      data: { model: 'RestockReminder', change: 'new', fields: [{ name: 'id', type: 'String', change: 'added' }, { name: 'sentAt', type: 'DateTime', change: 'added' }], schemaDiff: '+model RestockReminder {}' },
    }),
    drawn('ui-card', { type: 'ui', title: 'Restock card', status: 'your_turn', data: { location: { app: 'web', route: '/account', files: [] }, kit: 'web', after: '<div>Soon</div>', before: '<div>Now</div>' } }),
    drawn('ui-old', { type: 'ui', title: 'Old banner', status: 'parked', data: { location: { app: 'web', files: [] }, kit: 'web', after: '<div>Old</div>' } }),
    drawn('flows-reorder', {
      type: 'flows',
      title: 'Reorder from a reminder',
      status: 'resolved',
      data: { kind: 'user', steps: [{ n: 1, label: 'Opens the reminder' }, { n: 2, label: 'Taps Order now', systemNote: 'Creates the order' }] },
    }),
    drawn('phases-one', { type: 'phases', title: 'Phase 1', status: 'idle', data: { order: 1, goal: 'Ship reminders', doneWhen: ['Emails go out'], itemIds: ['architecture-system', 'ui-card'] } }),
    pair('q-lead', { title: 'Lead time', fields: { blocking: 'false', default: '3 days before' } }),
    pair('q-channel', {
      title: 'Reminder channel',
      status: 'your_turn',
      messages: [
        claude('m1', '2026-10-01T09:00:00.000Z', 'Email or SMS? Email is cheaper to send.', { opening: true, options: [{ id: 'email', label: 'Email' }, { id: 'sms', label: 'SMS' }] }),
        you('m2', '2026-10-01T11:00:00.000Z', { optionId: 'email', optionLabel: 'Email' }),
        system('m3', '2026-10-01T11:00:00.000Z', 'Applied and resolved.'),
        // You came back to it after the decision. The decision's reasoning is still what was said before it.
        you('m4', '2026-10-01T13:00:00.000Z', { text: 'What about push?' }),
        claude('m5', '2026-10-01T13:05:00.000Z', 'Push needs the app installed.', { options: [{ id: 'push', label: 'Add push' }, { id: 'keep', label: 'Keep email' }] }),
      ],
    }),
    pair('c-burst', {
      type: 'concerns',
      title: 'Burst of sends',
      status: 'resolved',
      fields: { severity: 'medium' },
      messages: [
        claude('m6', '2026-10-01T09:00:00.000Z', 'Sends could all go out at 9am.', { opening: true, options: [{ id: 'stagger', label: 'Stagger sends' }, { id: 'queue', label: 'Queue them' }] }),
        you('m7', '2026-10-01T12:00:00.000Z', { optionId: 'preset:1', note: 'Volume is low.' }),
        claude('m8', '2026-10-01T12:05:00.000Z', LONG_WHY, { resolved: true }),
      ],
    }),
  ];
  const dir = await seedProject({ pairs, project: { docs: { original: 'docs/original.md', draft: 'docs/draft.md', final: 'docs/final.md' } } });
  await fs.writeFile(path.join(dir, 'docs', 'final.md'), '# Restock reminders\n\nThe first final.\n');
  await addDecision(dir, { text: 'Reminder channel: SMS', threadId: 't-q-channel', itemIds: ['q-channel'], now: new Date('2026-10-01T10:00:00.000Z') });
  await addDecision(dir, { text: 'Reminder channel: Email', threadId: 't-q-channel', itemIds: ['q-channel'], now: new Date('2026-10-01T11:00:00.000Z') });
  await addDecision(dir, { text: 'Burst risk accepted', threadId: 't-c-burst', itemIds: ['c-burst'], now: new Date('2026-10-01T12:05:00.000Z') });
  await addDecision(dir, { text: 'Jobs run in the worker', threadId: 't-gone', itemIds: ['architecture-system'], now: new Date('2026-10-01T14:00:00.000Z') });
  return dir;
}

describe("the finalizer's context pack", () => {
  it('gives the finalizer the rules, the draft and the earlier final as files to Read, and the project', async () => {
    const dir = await seed();
    const pack = await finalizePack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.project).toEqual({ repo: 'acme', id: 'restock', title: 'Restock reminders', sourcePath: 'docs/specs/restock.md', name: 'restock' });
    expect(pack.rulesFile).toBe(RULES_FILE);
    expect(pack.draftFile).toBe(path.join(dir, 'docs', 'draft.md'));
    expect(await fs.readFile(pack.draftFile, 'utf8')).toBe(DRAFT);
    expect(pack.previousFinalFile).toBe(path.join(dir, 'docs', 'final.md'));
    expect(await fs.readFile(pack.previousFinalFile!, 'utf8')).toBe('# Restock reminders\n\nThe first final.\n');
    expect(pack.conventions).toEqual(['Ids use uuid()']);
    // The texts themselves aren't in the pack any more.
    for (const key of ['rules', 'draft', 'previousFinal']) expect(pack).not.toHaveProperty(key);
  });

  it("names no earlier final when there isn't one, or its file is gone", async () => {
    const dir = await seed();
    await fs.rm(path.join(dir, 'docs', 'final.md'));
    expect((await finalizePack({ dir, types, rulesFile: RULES_FILE })).previousFinalFile).toBeNull();
  });

  it('lists every item that goes into the final, in plumbing-type order, with what its drawing holds', async () => {
    const dir = await seed();
    const pack = await finalizePack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.items.map((i) => [i.id, i.typeTitle, i.status, i.dataSummary])).toEqual([
      ['architecture-broken', 'Architecture', 'idle', null],
      ['architecture-system', 'Architecture', 'idle', 'System diagram: 3 boxes, 2 groups'],
      ['database-reminder', 'Database', 'resolved', 'Table RestockReminder (new): 2 fields'],
      ['ui-card', 'UI changes', 'your_turn', 'Mockup for web /account: After and Before'],
      ['flows-reorder', 'Flows', 'resolved', 'User flow: 2 steps'],
      ['q-lead', 'Questions', 'your_turn', null],
      ['q-channel', 'Questions', 'your_turn', null],
      ['c-burst', 'Concerns', 'resolved', null],
      ['phases-one', 'Phases & milestones', 'idle', 'Phase 1: 2 items'],
    ]);
    expect(pack.items[1]).toEqual({
      id: 'architecture-system',
      type: 'architecture',
      typeTitle: 'Architecture',
      title: 'System view',
      summary: 'A summary.',
      body: 'How the reminder parts fit together.',
      fields: {},
      status: 'idle',
      codeRefs: [{ path: 'apps/worker/jobs/restock.ts', verified: true }],
      dataSummary: 'System diagram: 3 boxes, 2 groups',
      file: path.join(dir, 'items', 'architecture-system.json'),
    });
    expect(pack.items.find((i) => i.id === 'q-lead')).toMatchObject({ body: null, fields: { blocking: 'false', default: '3 days before' }, codeRefs: [] });
  });

  it('gives each decision what was chosen, what was turned down, and why', async () => {
    const dir = await seed();
    const pack = await finalizePack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.decisions).toEqual([
      { text: 'Reminder channel: Email', itemId: 'q-channel', itemTitle: 'Reminder channel', chosen: 'Email', rejected: ['SMS'], why: 'Email or SMS? Email is cheaper to send.' },
      { text: 'Burst risk accepted', itemId: 'c-burst', itemTitle: 'Burst of sends', chosen: 'Accept the risk', rejected: ['Stagger sends', 'Queue them'], why: `${LONG_WHY.slice(0, 599)}…` },
      { text: 'Jobs run in the worker', itemId: 'architecture-system', itemTitle: 'System view', chosen: null, rejected: [], why: null },
    ]);
    expect(pack.decisions[1].why).toHaveLength(600);
  });

  it('leaves out decisions about items left out of the final, and keeps those about no item', async () => {
    const dir = await seed();
    await addDecision(dir, { text: 'The card shows the date', threadId: 't-ui-card', itemIds: ['ui-card'], now: new Date('2026-10-01T15:00:00.000Z') });
    await addDecision(dir, { text: 'Ship before the sale', threadId: 't-nowhere', itemIds: [], now: new Date('2026-10-01T16:00:00.000Z') });
    // You parked the channel question after it was decided. Its decision is still active, but the item is left out.
    await setParked(dir, 't-q-channel', true);
    const pack = await finalizePack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.decisions.map((d) => [d.text, d.itemId])).toEqual([
      ['Burst risk accepted', 'c-burst'],
      ['Jobs run in the worker', 'architecture-system'],
      ['The card shows the date', 'ui-card'],
      ['Ship before the sale', null],
    ]);
    // With UI changes turned off, the card's decision is left out too.
    const off = types.map((t) => (t.id === 'ui' ? { ...t, enabled: false } : t));
    expect((await finalizePack({ dir, types: off, profile, rulesFile: RULES_FILE })).decisions.map((d) => d.text)).toEqual([
      'Burst risk accepted',
      'Jobs run in the worker',
      'Ship before the sale',
    ]);
  });

  it('lists the defaults that will be used, the open items, and only the tokens for items in the final', async () => {
    const dir = await seed();
    const pack = await finalizePack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.defaults).toEqual([{ itemId: 'q-lead', title: 'Lead time', defaultValue: '3 days before' }]);
    expect(pack.openItems).toEqual([
      { itemId: 'ui-card', title: 'Restock card', typeTitle: 'UI changes' },
      { itemId: 'q-lead', title: 'Lead time', typeTitle: 'Questions' },
      { itemId: 'q-channel', title: 'Reminder channel', typeTitle: 'Questions' },
    ]);
    const { values } = await readItems(dir);
    const byId = new Map(values.map((i) => [i.id, i]));
    expect(pack.tokens).toEqual(availableTokens(pack.items.map((i) => byId.get(i.id)!), types));
    expect(pack.tokens.join('\n')).toContain('{{diagram:architecture-system}}');
    expect(pack.tokens.join('\n')).toContain('{{mockup:ui-card:before}}');
    // The parked mockup is left out of the final, so the finalizer can't link to it.
    expect(pack.tokens.join('\n')).not.toContain('ui-old');
  });

  it('leaves out items of disabled plumbing types, and their tokens', async () => {
    const dir = await seed();
    const off = types.map((t) => (t.id === 'ui' ? { ...t, enabled: false } : t));
    const pack = await finalizePack({ dir, types: off, profile, rulesFile: RULES_FILE });
    expect(pack.items.map((i) => i.id)).not.toContain('ui-card');
    expect(pack.tokens.join('\n')).not.toContain('{{mockup:');
    expect(pack.tokens.join('\n')).toContain('{{diagram:architecture-system}}');
    expect(pack.openItems.map((e) => e.itemId)).toEqual(['q-lead', 'q-channel']);
  });

  it('leaves out Plan changes items, whatever their state: what they settled is already in the draft', async () => {
    const settled = pair('plan-changes-v2-1', { type: 'plan-changes', title: 'Approach', status: 'resolved' });
    const open = pair('plan-changes-v2-2', { type: 'plan-changes', title: 'Data', status: 'your_turn' });
    const dir = await seedProject({ pairs: [settled, open, pair('q1', { title: 'Who gets reminders?' })] });
    await addDecision(dir, { text: 'Approach: kept my draft', threadId: 't-plan-changes-v2-1', itemIds: ['plan-changes-v2-1'] });
    const pack = await finalizePack({ dir, types: [PLAN_CHANGES_TYPE, ...types], rulesFile: RULES_FILE });
    expect(pack.items.map((i) => i.id)).toEqual(['q1']);
    expect(pack.openItems.map((e) => e.itemId)).toEqual(['q1']);
    expect(pack.decisions).toEqual([]);
    expect(pack.tokens).toEqual([]);
  });

  it('works for a project with nothing decided, no profile and no earlier final', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { title: 'Who gets reminders?' })] });
    expect(await finalizePack({ dir, types, rulesFile: RULES_FILE })).toEqual({
      project: { repo: 'acme', id: 'restock', title: 'Restock reminders', sourcePath: 'docs/specs/restock.md', name: 'restock' },
      rulesFile: RULES_FILE,
      draftFile: path.join(dir, 'docs', 'draft.md'),
      items: [
        {
          id: 'q1',
          type: 'questions',
          typeTitle: 'Questions',
          title: 'Who gets reminders?',
          summary: 'A summary.',
          body: null,
          fields: {},
          status: 'your_turn',
          codeRefs: [],
          dataSummary: null,
          file: path.join(dir, 'items', 'q1.json'),
        },
      ],
      decisions: [],
      defaults: [],
      openItems: [{ itemId: 'q1', title: 'Who gets reminders?', typeTitle: 'Questions' }],
      conventions: [],
      tokens: [],
      previousFinalFile: null,
    });
  });

  it("cuts a long body to 800 characters, and says to Read the item's file for the rest", async () => {
    const long = pair('q-long', { title: 'Long one' });
    const exact = pair('q-exact', { title: 'Exactly 800' });
    const body = 'The reminder job reads the subscriptions table. '.repeat(50);
    const dir = await seedProject({ pairs: [{ ...long, item: { ...long.item, body } }, { ...exact, item: { ...exact.item, body: 'x'.repeat(800) } }] });
    const pack = await finalizePack({ dir, types, rulesFile: RULES_FILE });
    const byId = new Map(pack.items.map((i) => [i.id, i]));
    expect(byId.get('q-long')!.body).toBe(`${body.slice(0, 800)}${CLIPPED}`);
    expect(byId.get('q-exact')!.body).toBe('x'.repeat(800));
    // The whole body is in the item's file.
    expect(JSON.parse(await fs.readFile(byId.get('q-long')!.file, 'utf8')).body).toBe(body);
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
    const dir = await seedProject({ pairs, draft: `${DRAFT}\n${sentence.repeat(1500)}\n` });
    const pack = await finalizePack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.items).toHaveLength(40);
    for (const item of pack.items) expect(item.body).toHaveLength(800 + CLIPPED.length);
    // The 150,000-character draft is a file to Read, so it isn't counted here.
    expect(JSON.stringify(pack).length).toBeLessThan(60_000);
  });
});
