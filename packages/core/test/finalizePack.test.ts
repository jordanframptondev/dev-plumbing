import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { availableTokens } from '../src/finalExport';
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
const RULES = '# Finalize spec rules\n\n## Rules\n\n- Never invent behaviour.\n';
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
  it('gives the finalizer the rules, the draft, the project and the earlier final', async () => {
    const dir = await seed();
    const pack = await finalizePack({ dir, types, profile, rules: RULES });
    expect(pack.project).toEqual({ repo: 'acme', id: 'restock', title: 'Restock reminders', sourcePath: 'docs/specs/restock.md', name: 'restock' });
    expect(pack.rules).toBe(RULES);
    expect(pack.draft).toBe(DRAFT);
    expect(pack.conventions).toEqual(['Ids use uuid()']);
    expect(pack.previousFinal).toBe('# Restock reminders\n\nThe first final.\n');
  });

  it('lists every item that goes into the final, in plumbing-type order, with what its drawing holds', async () => {
    const dir = await seed();
    const pack = await finalizePack({ dir, types, profile, rules: RULES });
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
    });
    expect(pack.items.find((i) => i.id === 'q-lead')).toMatchObject({ body: null, fields: { blocking: 'false', default: '3 days before' }, codeRefs: [] });
  });

  it('gives each decision what was chosen, what was turned down, and why', async () => {
    const dir = await seed();
    const pack = await finalizePack({ dir, types, profile, rules: RULES });
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
    const pack = await finalizePack({ dir, types, profile, rules: RULES });
    expect(pack.decisions.map((d) => [d.text, d.itemId])).toEqual([
      ['Burst risk accepted', 'c-burst'],
      ['Jobs run in the worker', 'architecture-system'],
      ['The card shows the date', 'ui-card'],
      ['Ship before the sale', null],
    ]);
    // With UI changes turned off, the card's decision is left out too.
    const off = types.map((t) => (t.id === 'ui' ? { ...t, enabled: false } : t));
    expect((await finalizePack({ dir, types: off, profile, rules: RULES })).decisions.map((d) => d.text)).toEqual([
      'Burst risk accepted',
      'Jobs run in the worker',
      'Ship before the sale',
    ]);
  });

  it('lists the defaults that will be used, the open items, and only the tokens for items in the final', async () => {
    const dir = await seed();
    const pack = await finalizePack({ dir, types, profile, rules: RULES });
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
    const pack = await finalizePack({ dir, types: off, profile, rules: RULES });
    expect(pack.items.map((i) => i.id)).not.toContain('ui-card');
    expect(pack.tokens.join('\n')).not.toContain('{{mockup:');
    expect(pack.tokens.join('\n')).toContain('{{diagram:architecture-system}}');
    expect(pack.openItems.map((e) => e.itemId)).toEqual(['q-lead', 'q-channel']);
  });

  it('works for a project with nothing decided, no profile and no earlier final', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { title: 'Who gets reminders?' })] });
    expect(await finalizePack({ dir, types, rules: RULES })).toEqual({
      project: { repo: 'acme', id: 'restock', title: 'Restock reminders', sourcePath: 'docs/specs/restock.md', name: 'restock' },
      rules: RULES,
      draft: DRAFT,
      items: [{ id: 'q1', type: 'questions', typeTitle: 'Questions', title: 'Who gets reminders?', summary: 'A summary.', body: null, fields: {}, status: 'your_turn', codeRefs: [], dataSummary: null }],
      decisions: [],
      defaults: [],
      openItems: [{ itemId: 'q1', title: 'Who gets reminders?', typeTitle: 'Questions' }],
      conventions: [],
      tokens: [],
      previousFinal: null,
    });
  });
});
