import { afterAll, describe, expect, it } from 'vitest';
import { drawingKey, drawingParts, parseRef, relationTarget, tablesDrawing, type DiagramData, type FlowData, type Item, type PlumbingType, type TableDiff, type Thread } from '../src/schemas';
import { drawingOptions, projectDrawings } from '../src/store/drawings';
import { defenseDiagramItemIds } from '../src/store/whiteboard';
import { removeTempDirs } from '../../../testkit/tmp';
import { listType, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const types: PlumbingType[] = [
  ...TYPES,
  listType('database', { title: 'Database', screen: 'database', order: 2 }),
  listType('flows', { title: 'Flows', screen: 'flows', order: 4 }),
  listType('sketches', { title: 'Sketches', screen: 'diagram', order: 8, enabled: false }),
];
const DIAGRAM: DiagramData = {
  kind: 'system',
  groups: [{ id: 'aws', label: 'AWS' }],
  nodes: [
    { id: 'job', label: 'Daily reminder job', group: 'aws', status: 'new' },
    { id: 'db', label: 'Postgres', group: 'aws', status: 'unchanged' },
    { id: 'mailer', label: 'Mailer', status: 'external' },
  ],
  edges: [
    { id: 'reads', from: 'job', to: 'db', label: 'finds due subscriptions' },
    { id: 'sends', from: 'job', to: 'mailer' },
  ],
};
const reminder: TableDiff = {
  model: 'RestockReminder',
  change: 'new',
  fields: [
    { name: 'id', type: 'String', change: 'added', default: 'cuid()' },
    { name: 'subscriptionId', type: 'String', change: 'added' },
    { name: 'subscription', type: 'Subscription', change: 'added', note: 'The subscription it reminds about.' },
    { name: 'sentAt', type: 'DateTime', change: 'added', default: 'now()' },
  ],
  schemaDiff: '+model RestockReminder {\n+  id String @id @default(cuid())\n+  sentAt DateTime @default(now())\n+}',
  migration: [{ kind: 'additive', text: 'Create the RestockReminder table.' }],
};
const subscription: TableDiff = {
  model: 'Subscription',
  change: 'changed',
  fields: [
    { name: 'id', type: 'String', change: 'unchanged' },
    { name: 'customerId', type: 'String', change: 'unchanged' },
    { name: 'customer', type: 'Customer', change: 'unchanged' },
    { name: 'status', type: 'SubscriptionStatus', change: 'unchanged' },
    { name: 'remindDaysBefore', type: 'Int', change: 'added', default: '5' },
    { name: 'reminders', type: 'RestockReminder[]', change: 'added' },
    { name: 'legacyNote', type: 'String?', change: 'removed' },
  ],
  schemaDiff: ' model Subscription {\n+  remindDaysBefore Int @default(5)\n-  legacyNote String?\n }',
};
const SEND: FlowData = {
  kind: 'system',
  lanes: [
    { id: 'job', label: 'Reminder job', status: 'new' },
    { id: 'mailer', label: 'Mailer', status: 'external' },
    { id: 'customer', label: 'Customer', status: 'unchanged' },
  ],
  // Written out of order: the parts come in step order.
  steps: [
    { n: 2, from: 'mailer', to: 'customer', label: 'Emails the customer' },
    { n: 1, from: 'job', to: 'mailer', label: 'Hands over the reminder' },
    { n: 3, label: 'Logs it' },
  ],
};

/** An item with a drawing, and its thread. */
const drawn = (id: string, o: Parameters<typeof pair>[1] & { data: unknown }) => {
  const p = pair(id, o);
  return { item: { ...p.item, data: o.data }, thread: p.thread };
};

/**
 * A diagram item with a group, one with no drawing yet and one whose drawing doesn't parse; two tables with links and a
 * parked one; a system flow, a flow of both kinds, a user flow and a system flow with no lanes; and a drawing of a
 * type that's turned off.
 */
async function seed(): Promise<string> {
  const pairs: { item: Item; thread: Thread }[] = [
    drawn('architecture-system', { type: 'architecture', title: 'System view', data: DIAGRAM }),
    pair('architecture-later', { type: 'architecture', title: 'Later view' }),
    drawn('architecture-broken', { type: 'architecture', title: 'Broken view', data: { kind: 'system', nodes: [] } }),
    drawn('database-reminder', { type: 'database', title: 'Reminder table', data: reminder }),
    drawn('database-subscription', { type: 'database', title: 'Subscription table', data: subscription }),
    drawn('database-old', { type: 'database', title: 'Old log', status: 'parked', data: { ...reminder, model: 'OldLog' } }),
    drawn('flows-send', { type: 'flows', title: 'Sending a reminder', data: SEND }),
    drawn('flows-reorder', { type: 'flows', title: 'Reordering', data: { kind: 'both', lanes: [{ id: 'app', label: 'App', status: 'changed' }], steps: [{ n: 1, from: 'app', to: 'app', label: 'Reorders' }] } }),
    drawn('flows-browse', { type: 'flows', title: 'Browsing', data: { kind: 'user', steps: [{ n: 1, label: 'Opens the reminder' }] } }),
    drawn('flows-bare', { type: 'flows', title: 'No lanes', data: { kind: 'system', steps: [{ n: 1, label: 'Runs' }] } }),
    drawn('sketches-old', { type: 'sketches', title: 'Old sketch', data: DIAGRAM }),
  ];
  return seedProject({ pairs });
}

describe("a project's drawings", () => {
  it('offers each diagram item, the tables that are not parked, and each system flow with lanes', async () => {
    const dir = await seed();
    const options = await drawingOptions(dir, types);
    expect(options.map((o) => [drawingKey(o.drawing), o.title])).toEqual([
      ['diagram:architecture-broken', 'Broken view'],
      ['diagram:architecture-system', 'System view'],
      ['tables', 'Tables'],
      ['flow:flows-reorder', 'Reordering'],
      ['flow:flows-send', 'Sending a reminder'],
    ]);
    // The diagram items are exactly the ones a section's diagramItemId may name. One whose drawing doesn't parse has
    // nothing to reveal.
    expect(options.flatMap((o) => (o.drawing.kind === 'diagram' ? [o.drawing.itemId] : []))).toEqual(await defenseDiagramItemIds(dir, types));
    expect(options[0].parts).toEqual([]);
    expect(options[1]).toEqual({
      drawing: { kind: 'diagram', itemId: 'architecture-system' },
      title: 'System view',
      parts: [
        { ref: 'node:job', label: 'Daily reminder job' },
        { ref: 'node:db', label: 'Postgres' },
        { ref: 'node:mailer', label: 'Mailer' },
        { ref: 'edge:reads', label: 'finds due subscriptions' },
        // A line with no label is named by its ends.
        { ref: 'edge:sends', label: 'Daily reminder job → Mailer' },
        { ref: 'group:aws', label: 'AWS' },
      ],
    });
    // The two tables that aren't parked, drawn together, with the model they point at.
    expect(options[2]).toEqual({
      drawing: { kind: 'tables' },
      title: 'Tables',
      parts: [
        { ref: 'table:RestockReminder', label: 'RestockReminder' },
        { ref: 'table:Subscription', label: 'Subscription' },
        { ref: 'table:Customer', label: 'Customer' },
        { ref: 'link:RestockReminder.subscription', label: 'RestockReminder.subscription → Subscription' },
        { ref: 'link:Subscription.customer', label: 'Subscription.customer → Customer' },
        { ref: 'link:Subscription.reminders', label: 'Subscription.reminders → RestockReminder' },
      ],
    });
    // A step says which lanes it joins, so a note near a lane can be placed without the flow's data.
    expect(options[4].parts).toEqual([
      { ref: 'lane:job', label: 'Reminder job' },
      { ref: 'lane:mailer', label: 'Mailer' },
      { ref: 'lane:customer', label: 'Customer' },
      { ref: 'step:1', label: 'Reminder job → Mailer: Hands over the reminder' },
      { ref: 'step:2', label: 'Mailer → Customer: Emails the customer' },
      { ref: 'step:3', label: 'Logs it' },
    ]);
    // What saveDefense checks with also knows what each part brings onto the board.
    expect((await projectDrawings(dir, types)).map((d) => ({ drawing: d.drawing, title: d.title, parts: d.parts }))).toEqual(options);
  });

  it('has no tables to draw when every table is parked, and nothing at all in a plain project', async () => {
    const parked = await seedProject({ pairs: [drawn('database-old', { type: 'database', title: 'Old log', status: 'parked', data: reminder })] });
    expect(await drawingOptions(parked, types)).toEqual([]);
    expect(await drawingOptions(await seedProject({ pairs: [pair('q1')] }), types)).toEqual([]);
  });
});

describe('the parts of a drawing', () => {
  it('names each part by a typed ref and brings along what it needs: a line its ends, a step its lanes, a box its group', () => {
    expect(drawingParts({ kind: 'diagram', data: DIAGRAM }).brings).toEqual({
      'node:job': ['group:aws'],
      'node:db': ['group:aws'],
      'edge:reads': ['node:job', 'node:db'],
      'edge:sends': ['node:job', 'node:mailer'],
    });
    expect(drawingParts({ kind: 'tables', tables: [reminder, subscription] }).brings).toEqual({
      'link:RestockReminder.subscription': ['table:RestockReminder', 'table:Subscription'],
      'link:Subscription.customer': ['table:Subscription', 'table:Customer'],
      'link:Subscription.reminders': ['table:Subscription', 'table:RestockReminder'],
    });
    // A step on one lane brings that lane once; a step on no lane brings nothing.
    const loop: FlowData = { ...SEND, steps: [...SEND.steps, { n: 4, from: 'job', to: 'job', label: 'Waits a day' }] };
    expect(drawingParts({ kind: 'flow', data: loop }).brings).toEqual({
      'step:1': ['lane:job', 'lane:mailer'],
      'step:2': ['lane:mailer', 'lane:customer'],
      'step:4': ['lane:job'],
    });
    // A step from or to one lane only is labelled with that lane.
    const oneEnd = drawingParts({ kind: 'flow', data: { ...SEND, steps: [{ n: 1, from: 'mailer', label: 'Retries' }] } });
    expect(oneEnd.parts.at(-1)).toEqual({ ref: 'step:1', label: 'Mailer: Retries' });
    // A group with no boxes isn't offered: the layout drops it, so revealing it would draw nothing.
    const empty = drawingParts({ kind: 'diagram', data: { ...DIAGRAM, groups: [...DIAGRAM.groups, { id: 'later', label: 'Later' }] } });
    expect(empty.parts.map((p) => p.ref)).toEqual(['node:job', 'node:db', 'node:mailer', 'edge:reads', 'edge:sends', 'group:aws']);
  });

  it('cuts a long label to 120 characters', () => {
    const long = 'Sends the reminder by email, and by SMS when the customer asked for it, then logs it. '.repeat(3);
    const [, , step] = drawingParts({ kind: 'flow', data: { ...SEND, lanes: SEND.lanes!.slice(0, 2), steps: [{ n: 1, from: 'job', to: 'mailer', label: long }] } }).parts;
    expect(step.label).toHaveLength(120);
    expect(step.label).toBe(`${`Reminder job → Mailer: ${long}`.slice(0, 119)}…`);
  });
});

describe('the tables drawing', () => {
  it('draws each table, the models they point at, and a line per relation, and skips enums', () => {
    const strip = tablesDrawing([reminder, subscription, { ...reminder, model: 'OldLog', change: 'removed', fields: [], migration: [] }]);
    expect(strip.nodes).toEqual([
      { id: 'RestockReminder', label: 'RestockReminder', status: 'new' },
      { id: 'Subscription', label: 'Subscription', status: 'changed' },
      { id: 'OldLog', label: 'OldLog (removed)', status: 'changed' },
      { id: 'Customer', label: 'Customer', status: 'unchanged' },
    ]);
    expect(strip.edges.map((e) => [e.id, e.from, e.to, e.label])).toEqual([
      ['RestockReminder.subscription', 'RestockReminder', 'Subscription', 'subscription'],
      ['Subscription.customer', 'Subscription', 'Customer', 'customer'],
      ['Subscription.reminders', 'Subscription', 'RestockReminder', 'reminders'],
    ]);
  });

  it('still draws one table on its own', () => {
    expect(tablesDrawing([{ ...reminder, fields: [{ name: 'id', type: 'String', change: 'added' }] }])).toEqual({
      kind: 'system',
      groups: [],
      nodes: [{ id: 'RestockReminder', label: 'RestockReminder', status: 'new' }],
      edges: [],
    });
  });

  it('only counts a single model field as a relation with its foreign key', () => {
    const models = new Set(['Subscription']);
    expect(relationTarget({ name: 'status', type: 'SubscriptionStatus', change: 'unchanged' }, subscription, models)).toBeNull();
    expect(relationTarget({ name: 'customer', type: 'Customer', change: 'unchanged' }, subscription, models)).toBe('Customer');
    expect(relationTarget({ name: 'orders', type: 'Order[]', change: 'added' }, subscription, models)).toBe('Order');
    expect(relationTarget({ name: 'when', type: 'DateTime?', change: 'added' }, subscription, models)).toBeNull();
  });
});

describe('refs', () => {
  it('reads each of the seven prefixes, and nothing else', () => {
    expect(['node:job', 'edge:e1', 'group:aws', 'table:RestockReminder', 'link:Subscription.customer', 'lane:mailer', 'step:3'].map(parseRef)).toEqual([
      { kind: 'node', id: 'job' },
      { kind: 'edge', id: 'e1' },
      { kind: 'group', id: 'aws' },
      { kind: 'table', id: 'RestockReminder' },
      { kind: 'link', id: 'Subscription.customer' },
      { kind: 'lane', id: 'mailer' },
      { kind: 'step', id: '3' },
    ]);
    // Only the first colon splits: a diagram's own ids may hold one.
    expect(parseRef('node:a:b')).toEqual({ kind: 'node', id: 'a:b' });
    for (const bad of ['job', 'box:job', 'node:', ':job', 'Node:job', '']) expect(parseRef(bad), bad).toBeNull();
  });

  it('keys each drawing', () => {
    expect(drawingKey({ kind: 'diagram', itemId: 'architecture-system' })).toBe('diagram:architecture-system');
    expect(drawingKey({ kind: 'tables' })).toBe('tables');
    expect(drawingKey({ kind: 'flow', itemId: 'flows-send' })).toBe('flow:flows-send');
  });
});
