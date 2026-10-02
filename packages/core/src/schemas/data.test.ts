import { describe, expect, it } from 'vitest';
import {
  anchorKindFor,
  anchorSchema,
  dataKindOf,
  dataProblems,
  dataShapeDoc,
  diagramKindValues,
  edgeStyleValues,
  fieldChangeValues,
  flowKindValues,
  migrationKindValues,
  MOCKUP_MAX_CHARS,
  nodeStatusValues,
  parseData,
  tableChangeValues,
  type DataKind,
  type DiagramData,
  type FlowData,
  type MockupData,
  type PhaseData,
  type TableDiff,
} from './data';
import { itemSchema } from './project';

// Generic Acme examples, shaped like the data real Plan 2 importers wrote.

const restockDiagram: DiagramData = {
  kind: 'system',
  groups: [
    { id: 'web', label: 'apps/web' },
    { id: 'worker', label: 'apps/worker' },
    { id: 'db', label: 'packages/db' },
  ],
  nodes: [
    { id: 'account-page', label: 'Account page', group: 'web', status: 'changed', codeRef: { path: 'apps/web/app/account/page.tsx' } },
    { id: 'restock-card', label: 'Restock settings card', group: 'web', status: 'new' },
    { id: 'reminders-api', label: 'Reminders API', group: 'web', status: 'new', codeRef: { path: 'apps/web/app/api/reminders/route.ts' } },
    { id: 'reminder-job', label: 'Daily reminder job', group: 'worker', status: 'new' },
    { id: 'send-email', label: 'sendRestockEmail', group: 'worker', status: 'new' },
    { id: 'subscription', label: 'Subscription', group: 'db', status: 'changed', codeRef: { path: 'packages/db/prisma/schema.prisma', symbol: 'model Subscription' } },
    { id: 'restock-reminder', label: 'RestockReminder', group: 'db', status: 'new' },
    { id: 'email-provider', label: 'Email provider', status: 'external' },
  ],
  edges: [
    { id: 'e1', from: 'account-page', to: 'restock-card', label: 'renders' },
    { id: 'e2', from: 'restock-card', to: 'reminders-api', label: 'saves lead time' },
    { id: 'e3', from: 'reminders-api', to: 'subscription', label: 'updates' },
    { id: 'e4', from: 'reminder-job', to: 'subscription', label: 'finds due' },
    { id: 'e5', from: 'reminder-job', to: 'restock-reminder', label: 'logs' },
    { id: 'e6', from: 'reminder-job', to: 'send-email' },
    { id: 'e7', from: 'send-email', to: 'email-provider', label: 'sends', style: 'dashed' },
  ],
};

const newTable: TableDiff = {
  model: 'RestockReminder',
  change: 'new',
  fields: [
    { name: 'id', type: 'String', change: 'added', default: 'cuid()' },
    { name: 'subscriptionId', type: 'String', change: 'added' },
    { name: 'subscription', type: 'Subscription', change: 'added' },
    { name: 'sendAt', type: 'DateTime', change: 'added' },
    { name: 'sentAt', type: 'DateTime?', change: 'added', note: 'Empty until the email goes out.' },
  ],
  schemaDiff: [
    '+model RestockReminder {',
    '+  id             String       @id @default(cuid())',
    '+  subscriptionId String',
    '+  subscription   Subscription @relation(fields: [subscriptionId], references: [id])',
    '+  sendAt         DateTime',
    '+  sentAt         DateTime?',
    '+}',
  ].join('\n'),
  migration: [
    { kind: 'additive', text: 'Creates the RestockReminder table.' },
    { kind: 'rollback', text: 'Drop the RestockReminder table.' },
  ],
};

/** No migration, as Plan 2 importers sometimes wrote. */
const changedTable: TableDiff = {
  model: 'Subscription',
  change: 'changed',
  fields: [
    { name: 'id', type: 'String', change: 'unchanged' },
    { name: 'customerId', type: 'String', change: 'unchanged' },
    { name: 'status', type: 'SubscriptionStatus', change: 'unchanged' },
    { name: 'reminderLeadDays', type: 'Int', change: 'added', default: '5' },
    { name: 'reminders', type: 'RestockReminder[]', change: 'added' },
  ],
  schemaDiff: [
    ' model Subscription {',
    '   id               String             @id @default(cuid())',
    '   customerId       String',
    '   status           SubscriptionStatus',
    '+  reminderLeadDays Int                @default(5)',
    '+  reminders        RestockReminder[]',
    ' }',
  ].join('\n'),
};

const mockup: MockupData = {
  location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] },
  kit: 'web',
  after:
    '<main class="mx-auto max-w-xl p-6"><section class="rounded-card bg-white p-4"><h2 class="text-lg font-semibold">Restock reminders</h2><p class="text-sm">We email you 5 days before an item runs out.</p><img src="data:image/png;base64,iVBORw0KGgo=" alt=""><button class="mt-3 rounded bg-brand px-3 py-1.5 text-white">Change</button></section></main>',
  before: '<main class="mx-auto max-w-xl p-6"><h1 class="text-xl font-semibold">Account</h1></main>',
};

const userFlow: FlowData = {
  kind: 'user',
  steps: [
    { n: 1, label: 'Opens the account page', mockupId: 'ui-account-page' },
    { n: 2, label: 'Turns on restock reminders', mockupId: 'ui-restock-card', systemNote: 'Saves the lead time on the subscription.' },
    { n: 3, label: 'Gets an email 5 days before running out', systemNote: 'The daily job sends it.' },
  ],
};

const systemFlow: FlowData = {
  kind: 'system',
  lanes: [
    { id: 'job', label: 'Daily reminder job', status: 'new' },
    { id: 'db', label: 'Postgres', status: 'unchanged' },
    { id: 'email', label: 'Email provider', status: 'external' },
  ],
  steps: [
    { n: 1, from: 'job', to: 'db', label: 'Find subscriptions due in 5 days' },
    { n: 2, from: 'job', to: 'job', label: 'Build one email per customer', systemNote: 'Groups items by customer.' },
    { n: 3, from: 'job', to: 'email', label: 'Send the reminder' },
    { n: 4, from: 'job', to: 'db', label: 'Log a RestockReminder row' },
  ],
};

const phase: PhaseData = {
  order: 1,
  goal: 'Reminders send for active subscriptions.',
  doneWhen: ['The daily job runs in staging', 'Each customer gets at most one email a day'],
  itemIds: ['architecture-reminder-job', 'database-restock-reminder'],
};

const problemsOf = (kind: DataKind, data: unknown) => {
  const r = parseData(kind, data);
  return r.ok ? [] : r.problems;
};

describe('visual data shapes', () => {
  it('accepts a realistic example of each kind', () => {
    expect(parseData('diagram', restockDiagram)).toEqual({ ok: true, data: restockDiagram });
    expect(parseData('database', newTable)).toEqual({ ok: true, data: newTable });
    expect(parseData('database', changedTable)).toEqual({ ok: true, data: changedTable });
    expect(parseData('mockups', mockup)).toEqual({ ok: true, data: mockup });
    expect(parseData('flows', userFlow)).toEqual({ ok: true, data: userFlow });
    expect(parseData('flows', systemFlow)).toEqual({ ok: true, data: systemFlow });
    expect(parseData('timeline', phase)).toEqual({ ok: true, data: phase });
  });

  it('still reads the shapes Plan 2 importers wrote', () => {
    expect(parseData('mockups', { location: { app: 'web', route: '/account' }, kit: 'web' })).toEqual({
      ok: true,
      data: { location: { app: 'web', route: '/account', files: [] }, kit: 'web' },
    });
    const noGroups = parseData('diagram', { kind: 'data_flow', nodes: [{ id: 'a', label: 'A', status: 'new' }] });
    expect(noGroups).toEqual({ ok: true, data: { kind: 'data_flow', groups: [], nodes: [{ id: 'a', label: 'A', status: 'new' }], edges: [] } });
    expect(parseData('diagram', { ...restockDiagram, nodes: restockDiagram.nodes.map((n, i) => (i ? n : { ...n, itemId: 'ui-account-page' })) }).ok).toBe(true);
    expect(parseData('database', changedTable).ok).toBe(true);
    expect(parseData('timeline', { order: 2, goal: 'Ship it.', doneWhen: ['Live'] })).toEqual({ ok: true, data: { order: 2, goal: 'Ship it.', doneWhen: ['Live'], itemIds: [] } });
  });

  it('names every broken reference in a diagram', () => {
    expect(
      problemsOf('diagram', {
        kind: 'system',
        groups: [{ id: 'web', label: 'Web' }, { id: 'web', label: 'Web again' }],
        nodes: [
          { id: 'a', label: 'A', status: 'new', group: 'web' },
          { id: 'a', label: 'A again', status: 'new' },
          { id: 'b', label: 'B', status: 'changed', group: 'mobile' },
        ],
        edges: [
          { id: 'e1', from: 'a', to: 'b' },
          { id: 'e1', from: 'ghost', to: 'gone' },
        ],
      }),
    ).toEqual([
      'Node id "a" is used more than once. Node ids must be unique.',
      'Edge id "e1" is used more than once. Edge ids must be unique.',
      'Group id "web" is used more than once. Group ids must be unique.',
      'Node "b" is in group "mobile", which isn\'t one of the group ids.',
      'Edge "e1" starts at "ghost", which isn\'t one of the node ids.',
      'Edge "e1" ends at "gone", which isn\'t one of the node ids.',
    ]);
  });

  it('names every broken reference in a flow', () => {
    expect(problemsOf('flows', { kind: 'system', steps: [{ n: 1, label: 'Starts' }] })).toEqual(['A "system" flow needs at least one lane in lanes.']);
    expect(problemsOf('flows', { kind: 'both', lanes: [], steps: [{ n: 1, label: 'Starts' }] })).toEqual(['A "both" flow needs at least one lane in lanes.']);
    expect(
      problemsOf('flows', {
        kind: 'system',
        lanes: [{ id: 'job', label: 'Job', status: 'new' }, { id: 'job', label: 'Job again', status: 'new' }],
        steps: [
          { n: 1, from: 'job', to: 'db', label: 'Reads' },
          { n: 1, from: 'queue', to: 'job', label: 'Wakes' },
        ],
      }),
    ).toEqual([
      'Lane id "job" is used more than once. Lane ids must be unique.',
      'Step number 1 is used more than once. Step numbers must be unique.',
      'Step 1 ends on lane "db", which isn\'t one of the lane ids.',
      'Step 1 starts on lane "queue", which isn\'t one of the lane ids.',
    ]);
    expect(problemsOf('flows', { kind: 'user', steps: [{ n: 1, from: 'Customer', to: 'Account page', label: 'Opens it' }] })).toEqual([]);
  });

  it('refuses a table that lists a field twice', () => {
    expect(problemsOf('database', { ...newTable, fields: [...newTable.fields, { name: 'sentAt', type: 'DateTime', change: 'added' }] })).toEqual([
      'Field "sentAt" is listed more than once. Field names must be unique.',
    ]);
  });

  it('keeps mockup markup to body markup that loads nothing', () => {
    const withAfter = (after: string) => problemsOf('mockups', { ...mockup, after });
    expect(withAfter('<div>Hi</div><script>alert(1)</script>')).toEqual(["after: remove the <script> tags. Mockups can't run scripts."]);
    expect(withAfter('<!doctype html><html><body><div>Hi</div></body></html>')).toEqual([
      "after: remove the <!doctype> tag. Write only the page's body markup.",
      "after: remove the <html> tag. Write only the page's body markup.",
      "after: remove the <body> tag. Write only the page's body markup.",
    ]);
    expect(withAfter('<head><title>x</title></head><header class="p-4">Acme</header>')).toEqual(["after: remove the <head> tag. Write only the page's body markup."]);
    // A refresh tag would navigate the frame away, and no CSP directive stops that. SVG's <metadata> is fine.
    expect(withAfter('<meta http-equiv="refresh" content="0;url=/x"><div>Hi</div>')).toEqual(["after: remove the <meta> tag. Write only the page's body markup."]);
    expect(withAfter('<svg viewBox="0 0 4 4"><metadata>Logo</metadata><rect width="4" height="4"/></svg>')).toEqual([]);
    expect(withAfter('<link rel="stylesheet" href="x.css"><iframe src="/x"></iframe><object></object><embed>')).toEqual([
      "after: remove the <link> tag. Mockups can't load or embed other files.",
      "after: remove the <iframe> tag. Mockups can't load or embed other files.",
      "after: remove the <object> tag. Mockups can't load or embed other files.",
      "after: remove the <embed> tag. Mockups can't load or embed other files.",
    ]);
    const outside = "after: a src or srcset points at another site. Use inline SVG or plain boxes for images; outside files don't load in mockups.";
    expect(withAfter('<img src="https://cdn.acme.test/logo.png">')).toEqual([outside]);
    expect(withAfter("<img src='//cdn.acme.test/logo.png'>")).toEqual([outside]);
    expect(withAfter('<img SRC=http://acme.test/a.png>')).toEqual([outside]);
    expect(withAfter('<img/src="https://cdn.acme.test/a.png">')).toEqual([outside]);
    expect(withAfter('<img alt="x"src="https://cdn.acme.test/a.png">')).toEqual([outside]);
    expect(withAfter('<svg viewBox="0 0 4 4"><image href="https://cdn.acme.test/a.png"/></svg>')).toEqual([outside]);
    expect(withAfter('<svg viewBox="0 0 4 4"><use href="//cdn.acme.test/a.svg#x"/></svg>')).toEqual([outside]);
    expect(withAfter('<video poster="https://cdn.acme.test/a.png"></video>')).toEqual([outside]);
    expect(withAfter('<a href="https://acme.test">Docs</a>')).toEqual([]);
    expect(withAfter('<img data-src="https://cdn.acme.test/a.png">')).toEqual([]);
    expect(withAfter('<img srcset="small.png 1x, https://cdn.acme.test/big.png 2x">')).toEqual([outside]);
    expect(withAfter('<img data-src="https://cdn.acme.test/a.png" src="data:image/png;base64,AA=="><svg viewBox="0 0 4 4"><rect width="4" height="4"/></svg>')).toEqual([]);
    expect(problemsOf('mockups', { ...mockup, before: '<script src="/x.js"></script>' })).toEqual(["before: remove the <script> tags. Mockups can't run scripts."]);
    expect(problemsOf('mockups', { ...mockup, after: 'x'.repeat(MOCKUP_MAX_CHARS + 1) })).toEqual(['after: Mockup markup can be at most 100,000 characters.']);
  });

  it('picks the data kind from the screen, and timeline for list types that have one', () => {
    expect(dataKindOf({ screen: 'diagram' })).toBe('diagram');
    expect(dataKindOf({ screen: 'database' })).toBe('database');
    expect(dataKindOf({ screen: 'mockups' })).toBe('mockups');
    expect(dataKindOf({ screen: 'flows' })).toBe('flows');
    expect(dataKindOf({ screen: 'list' })).toBeNull();
    expect(dataKindOf({ screen: 'list', timeline: false })).toBeNull();
    expect(dataKindOf({ screen: 'list', timeline: true })).toBe('timeline');
  });

  it('describes what a subagent may write, and what it refers to', () => {
    expect(dataProblems(null, { anything: true })).toEqual(["This plumbing type's items don't take data. Leave data out."]);
    expect(dataProblems(null, undefined)).toEqual([]);
    expect(dataProblems('diagram', undefined)).toEqual([]);
    expect(dataProblems('diagram', 'a picture')).toEqual(['data: Expected object, received string']);
    const badStatus = dataProblems('diagram', { ...restockDiagram, nodes: restockDiagram.nodes.map((n, i) => (i === 2 ? { ...n, status: 'old' } : n)) });
    expect(badStatus).toHaveLength(1);
    expect(badStatus[0]).toMatch(/^nodes\.2\.status: Invalid enum value/);

    expect(dataProblems('timeline', phase)).toEqual([]);
    expect(dataProblems('timeline', phase, { itemIds: new Set(['architecture-reminder-job']) })).toEqual(['itemIds: there\'s no item "database-restock-reminder".']);
    expect(dataProblems('timeline', phase, { itemIds: new Set(phase.itemIds) })).toEqual([]);

    expect(dataProblems('flows', userFlow, { mockupItemIds: new Set(['ui-account-page']) })).toEqual([
      'Step 2: mockupId "ui-restock-card" isn\'t a UI item. Use the id of an item whose screen is mockups.',
    ]);
    expect(dataProblems('flows', userFlow, { mockupItemIds: new Set(['ui-account-page', 'ui-restock-card']) })).toEqual([]);
    expect(dataProblems('flows', userFlow)).toEqual([]);
  });

  it('documents every allowed value, and its example is valid', () => {
    const values: Record<DataKind, readonly string[]> = {
      diagram: [...diagramKindValues, ...nodeStatusValues, ...edgeStyleValues],
      database: [...tableChangeValues, ...fieldChangeValues, ...migrationKindValues],
      mockups: [],
      flows: [...flowKindValues, ...nodeStatusValues],
      timeline: [],
    };
    for (const kind of Object.keys(values) as DataKind[]) {
      const doc = dataShapeDoc(kind);
      for (const v of values[kind]) expect(doc, `${kind} mentions "${v}"`).toContain(`"${v}"`);
      expect(doc).toContain("data replaces the item's whole data");
      const example: unknown = JSON.parse(doc.slice(doc.indexOf('Example:') + 'Example:'.length));
      expect(parseData(kind, example).ok, `${kind} example parses`).toBe(true);
    }
    const ui = dataShapeDoc('mockups');
    for (const bit of ["Write only the page's body markup", '<meta>', 'kitFiles', 'Tailwind classes and theme tokens', 'No scripts', 'inline SVG or plain boxes', '100,000', 'Send it only when the screen exists today']) {
      expect(ui).toContain(bit);
    }
  });
});

describe('anchors', () => {
  const anchor = { itemId: 'architecture-map', kind: 'node' as const, ref: 'reminder-job', label: 'Daily reminder job' };

  it('says which part of an item a pin is about', () => {
    expect(anchorSchema.parse(anchor)).toEqual(anchor);
    expect(anchorSchema.parse({ itemId: 'ui-account', kind: 'element', ref: 'body > main:nth-of-type(1)', label: 'Change', side: 'before' })).toMatchObject({ side: 'before' });
    expect(anchorSchema.safeParse({ ...anchor, kind: 'box' }).success).toBe(false);
    expect(anchorSchema.safeParse({ ...anchor, side: 'during' }).success).toBe(false);
  });

  it('is kept on items, and items without one still read', () => {
    const item = { id: 'architecture-about-job', type: 'architecture', title: 'About the job', summary: 's', threadId: 't-architecture-about-job', createdBy: 'you' };
    expect(itemSchema.parse({ ...item, anchor }).anchor).toEqual(anchor);
    expect(itemSchema.parse(item).anchor).toBeUndefined();
  });

  it('never hides an item over a malformed anchor', () => {
    const item = { id: 'architecture-about-job', type: 'architecture', title: 'About the job', summary: 's', threadId: 't-architecture-about-job', createdBy: 'you' };
    const parsed = itemSchema.safeParse({ ...item, anchor: { bogus: true } });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.anchor).toBeUndefined();
    expect(parsed.data?.title).toBe('About the job');
  });

  it('pins boxes on diagrams, elements on mockups and steps on flows', () => {
    expect(anchorKindFor('diagram')).toBe('node');
    expect(anchorKindFor('mockups')).toBe('element');
    expect(anchorKindFor('flows')).toBe('step');
    expect(anchorKindFor('database')).toBeNull();
    expect(anchorKindFor('timeline')).toBeNull();
    expect(anchorKindFor(null)).toBeNull();
  });
});
