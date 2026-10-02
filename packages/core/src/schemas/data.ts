import { z } from 'zod';
import type { Screen } from './plumbingType';

// The data each visual screen draws (spec §13.1), defined once. Writes are checked against these shapes, reads parse
// with them, the web uses their types, and dataShapeDoc turns them into the text subagents follow.

export const nodeStatusValues = ['new', 'changed', 'unchanged', 'external'] as const;
export type NodeStatus = (typeof nodeStatusValues)[number];
export const migrationKindValues = ['additive', 'backfill', 'destructive', 'data-risk', 'rollback'] as const;
export const diagramKindValues = ['system', 'data_flow'] as const;
export const edgeStyleValues = ['solid', 'dashed'] as const;
export const tableChangeValues = ['new', 'changed', 'removed'] as const;
export const fieldChangeValues = ['added', 'changed', 'removed', 'unchanged'] as const;
export const flowKindValues = ['user', 'system', 'both'] as const;
export const MOCKUP_MAX_CHARS = 100_000;

export type DiagramData = {
  kind: 'system' | 'data_flow';
  groups: { id: string; label: string }[];
  nodes: { id: string; label: string; group?: string; status: NodeStatus; codeRef?: { path: string; symbol?: string }; itemId?: string }[];
  edges: { id: string; from: string; to: string; label?: string; style?: 'solid' | 'dashed' }[];
};
export type TableDiff = {
  model: string;
  change: 'new' | 'changed' | 'removed';
  fields: { name: string; type: string; change: 'added' | 'changed' | 'removed' | 'unchanged'; default?: string; note?: string }[];
  schemaDiff: string;
  migration?: { kind: (typeof migrationKindValues)[number]; text: string }[];
};
export type MockupData = { location: { app: string; route?: string; files: string[] }; kit: string; after?: string; before?: string };
export type FlowData = {
  kind: 'user' | 'system' | 'both';
  lanes?: { id: string; label: string; status: NodeStatus }[];
  steps: { n: number; from?: string; to?: string; label: string; mockupId?: string; systemNote?: string }[];
};
export type PhaseData = { order: number; goal: string; doneWhen: string[]; itemIds: string[] };

export type DataKind = 'diagram' | 'database' | 'mockups' | 'flows' | 'timeline';
export type VisualData = { diagram: DiagramData; database: TableDiff; mockups: MockupData; flows: FlowData; timeline: PhaseData };
/** Extra facts dataProblems checks references against. */
export type DataContext = { itemIds?: Set<string>; mockupItemIds?: Set<string> };

// Ids inside data are the subagent's own names (boxes, lines, lanes), so they aren't held to item-id rules.
const dataId = z.string().min(1).max(100);
const label = z.string().min(1).max(200);
const status = z.enum(nodeStatusValues);

export const diagramDataSchema: z.ZodType<DiagramData, z.ZodTypeDef, unknown> = z.object({
  kind: z.enum(diagramKindValues),
  groups: z.array(z.object({ id: dataId, label })).max(30).default([]),
  nodes: z
    .array(
      z.object({
        id: dataId,
        label,
        group: dataId.optional(),
        status,
        codeRef: z.object({ path: z.string().min(1).max(300), symbol: z.string().min(1).max(200).optional() }).optional(),
        itemId: dataId.optional(),
      }),
    )
    .min(1)
    .max(80),
  edges: z
    .array(z.object({ id: dataId, from: dataId, to: dataId, label: z.string().max(200).optional(), style: z.enum(edgeStyleValues).optional() }))
    .max(200)
    .default([]),
});

export const tableDiffSchema: z.ZodType<TableDiff, z.ZodTypeDef, unknown> = z.object({
  model: z.string().min(1).max(200),
  change: z.enum(tableChangeValues),
  fields: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        type: z.string().min(1).max(300),
        change: z.enum(fieldChangeValues),
        default: z.string().max(500).optional(),
        note: z.string().max(2_000).optional(),
      }),
    )
    .max(200),
  schemaDiff: z.string().max(50_000),
  migration: z.array(z.object({ kind: z.enum(migrationKindValues), text: z.string().min(1).max(2_000) })).max(20).optional(),
});

const markup = z.string().max(MOCKUP_MAX_CHARS, 'Mockup markup can be at most 100,000 characters.');

export const mockupDataSchema: z.ZodType<MockupData, z.ZodTypeDef, unknown> = z.object({
  location: z.object({
    app: z.string().min(1).max(100),
    route: z.string().max(300).optional(),
    files: z.array(z.string().min(1).max(300)).max(30).default([]),
  }),
  kit: z.string().max(100),
  after: markup.optional(),
  before: markup.optional(),
});

export const flowDataSchema: z.ZodType<FlowData, z.ZodTypeDef, unknown> = z.object({
  kind: z.enum(flowKindValues),
  lanes: z.array(z.object({ id: dataId, label, status })).max(12).optional(),
  steps: z
    .array(
      z.object({
        n: z.number().int().min(0).max(999),
        from: dataId.optional(),
        to: dataId.optional(),
        label: z.string().min(1).max(500),
        mockupId: dataId.optional(),
        systemNote: z.string().max(2_000).optional(),
      }),
    )
    .min(1)
    .max(60),
});

export const phaseDataSchema: z.ZodType<PhaseData, z.ZodTypeDef, unknown> = z.object({
  order: z.number().int().min(0).max(999),
  goal: z.string().min(1).max(1_000),
  doneWhen: z.array(z.string().min(1).max(500)).min(1).max(12),
  itemIds: z.array(dataId).max(200).default([]),
});

const schemas: { [K in DataKind]: z.ZodType<VisualData[K], z.ZodTypeDef, unknown> } = {
  diagram: diagramDataSchema,
  database: tableDiffSchema,
  mockups: mockupDataSchema,
  flows: flowDataSchema,
  timeline: phaseDataSchema,
};

/** Which data a plumbing type's items carry: its screen, or 'timeline' for a list with timeline: true; null for plain lists. */
export function dataKindOf(type: { screen: Screen; timeline?: boolean }): DataKind | null {
  if (type.screen !== 'list') return type.screen;
  return type.timeline ? 'timeline' : null;
}

/** Each value that appears more than once, once. */
function repeated<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const twice = new Set<T>();
  for (const v of values) (seen.has(v) ? twice : seen).add(v);
  return [...twice];
}

function diagramProblems(d: DiagramData): string[] {
  const problems: string[] = [];
  for (const id of repeated(d.nodes.map((n) => n.id))) problems.push(`Node id "${id}" is used more than once. Node ids must be unique.`);
  for (const id of repeated(d.edges.map((e) => e.id))) problems.push(`Edge id "${id}" is used more than once. Edge ids must be unique.`);
  for (const id of repeated(d.groups.map((g) => g.id))) problems.push(`Group id "${id}" is used more than once. Group ids must be unique.`);
  const nodes = new Set(d.nodes.map((n) => n.id));
  const groups = new Set(d.groups.map((g) => g.id));
  for (const n of d.nodes) {
    if (n.group !== undefined && !groups.has(n.group)) problems.push(`Node "${n.id}" is in group "${n.group}", which isn't one of the group ids.`);
  }
  for (const e of d.edges) {
    if (!nodes.has(e.from)) problems.push(`Edge "${e.id}" starts at "${e.from}", which isn't one of the node ids.`);
    if (!nodes.has(e.to)) problems.push(`Edge "${e.id}" ends at "${e.to}", which isn't one of the node ids.`);
  }
  return problems;
}

function tableProblems(t: TableDiff): string[] {
  return repeated(t.fields.map((f) => f.name)).map((name) => `Field "${name}" is listed more than once. Field names must be unique.`);
}

/** Each distinct tag name the pattern finds, lowercased. */
const tagsIn = (markup: string, pattern: RegExp) => [...new Set([...markup.matchAll(pattern)].map((m) => m[1].toLowerCase()))];

/**
 * Whether the markup loads a file from another site: a src, srcset or poster attribute, or an href on SVG <image> or <use>.
 * Entity-encoded URLs (&#104;ttp...) are left to the frame's CSP, which is the real guard.
 */
function loadsOutsideFiles(markup: string): boolean {
  // Not preceded by a word character or dash, so data-src stays allowed and `<img/src=...>` is caught.
  for (const m of markup.matchAll(/(?<![\w-])(?:src|srcset|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    const value = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (/(?:^|[\s,])(?:https?:|\/\/)/i.test(value)) return true;
  }
  for (const tag of markup.matchAll(/<(?:image|use)\b[^>]*>/gi)) {
    for (const m of tag[0].matchAll(/(?<![\w-])href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
      if (/^\s*(?:https?:|\/\/)/i.test(m[1] ?? m[2] ?? m[3] ?? '')) return true;
    }
  }
  return false;
}

/** Mockup markup is body markup that draws with the kit and nothing else: no scripts, no page tags, nothing loaded. */
function markupProblems(side: 'after' | 'before', markup: string): string[] {
  const problems: string[] = [];
  if (/<script\b/i.test(markup)) problems.push(`${side}: remove the <script> tags. Mockups can't run scripts.`);
  // <meta> too: a refresh tag would navigate the frame away, and no CSP directive stops that.
  for (const tag of tagsIn(markup, /<\/?(!doctype|html|head|body|meta)\b/gi)) problems.push(`${side}: remove the <${tag}> tag. Write only the page's body markup.`);
  // <template> too: a declarative shadow root (shadowrootmode) can hide a link from the frame's click guard.
  if (/<template\b/i.test(markup)) problems.push(`${side}: remove the <template> tags. Mockups can't use <template> elements.`);
  for (const tag of tagsIn(markup, /<(link|iframe|object|embed)\b/gi)) problems.push(`${side}: remove the <${tag}> tag. Mockups can't load or embed other files.`);
  if (loadsOutsideFiles(markup)) {
    problems.push(`${side}: a src or srcset points at another site. Use inline SVG or plain boxes for images; outside files don't load in mockups.`);
  }
  return problems;
}

function mockupProblems(m: MockupData): string[] {
  return [...(m.after ? markupProblems('after', m.after) : []), ...(m.before ? markupProblems('before', m.before) : [])];
}

function flowProblems(f: FlowData): string[] {
  const problems: string[] = [];
  const lanes = f.lanes ?? [];
  if (f.kind !== 'user' && !lanes.length) problems.push(`A "${f.kind}" flow needs at least one lane in lanes.`);
  for (const id of repeated(lanes.map((l) => l.id))) problems.push(`Lane id "${id}" is used more than once. Lane ids must be unique.`);
  for (const n of repeated(f.steps.map((s) => s.n))) problems.push(`Step number ${n} is used more than once. Step numbers must be unique.`);
  if (lanes.length) {
    const ids = new Set(lanes.map((l) => l.id));
    for (const s of f.steps) {
      if (s.from !== undefined && !ids.has(s.from)) problems.push(`Step ${s.n} starts on lane "${s.from}", which isn't one of the lane ids.`);
      if (s.to !== undefined && !ids.has(s.to)) problems.push(`Step ${s.n} ends on lane "${s.to}", which isn't one of the lane ids.`);
    }
  }
  return problems;
}

const crossChecks: { [K in DataKind]: (data: VisualData[K]) => string[] } = {
  diagram: diagramProblems,
  database: tableProblems,
  mockups: mockupProblems,
  flows: flowProblems,
  timeline: () => [],
};

/** Shape plus cross-references (edge ends are nodes, step lanes exist, unique ids and step numbers, markup rules). */
export function parseData<K extends DataKind>(kind: K, data: unknown): { ok: true; data: VisualData[K] } | { ok: false; problems: string[] } {
  const parsed = schemas[kind].safeParse(data);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join('.') || 'data'}: ${i.message}`) };
  const problems = crossChecks[kind](parsed.data);
  return problems.length ? { ok: false, problems } : { ok: true, data: parsed.data };
}

/**
 * Problems with data a subagent wants to write. kind null with data present is a problem; data undefined is fine.
 * ctx.itemIds: every item id that will exist (phase itemIds must be among them).
 * ctx.mockupItemIds: ids of items whose type's screen is mockups (step mockupId must be among them).
 */
export function dataProblems(kind: DataKind | null, data: unknown, ctx: DataContext = {}): string[] {
  if (data === undefined) return [];
  if (kind === null) return ["This plumbing type's items don't take data. Leave data out."];
  const parsed = parseData(kind, data);
  if (!parsed.ok) return parsed.problems;
  const problems: string[] = [];
  if (kind === 'timeline' && ctx.itemIds) {
    for (const id of (parsed.data as PhaseData).itemIds) if (!ctx.itemIds.has(id)) problems.push(`itemIds: there's no item "${id}".`);
  }
  if (kind === 'flows' && ctx.mockupItemIds) {
    for (const s of (parsed.data as FlowData).steps) {
      if (s.mockupId !== undefined && !ctx.mockupItemIds.has(s.mockupId)) {
        problems.push(`Step ${s.n}: mockupId "${s.mockupId}" isn't a UI item. Use the id of an item whose screen is mockups.`);
      }
    }
  }
  return problems;
}

const q = (values: readonly string[]) => values.map((v) => `"${v}"`).join(' | ');

const EXAMPLES: VisualData = {
  diagram: {
    kind: 'system',
    groups: [
      { id: 'web', label: 'apps/web' },
      { id: 'worker', label: 'apps/worker' },
    ],
    nodes: [
      { id: 'account-page', label: 'Account page', group: 'web', status: 'changed', codeRef: { path: 'apps/web/app/account/page.tsx' } },
      { id: 'reminder-job', label: 'Daily reminder job', group: 'worker', status: 'new' },
      { id: 'db', label: 'Postgres', status: 'unchanged' },
      { id: 'email', label: 'Email provider', status: 'external' },
    ],
    edges: [
      { id: 'e1', from: 'account-page', to: 'db', label: 'saves lead time' },
      { id: 'e2', from: 'reminder-job', to: 'db', label: 'finds due subscriptions' },
      { id: 'e3', from: 'reminder-job', to: 'email', label: 'sends', style: 'dashed' },
    ],
  },
  database: {
    model: 'RestockReminder',
    change: 'new',
    fields: [
      { name: 'id', type: 'String', change: 'added', default: 'cuid()' },
      { name: 'subscriptionId', type: 'String', change: 'added' },
      { name: 'subscription', type: 'Subscription', change: 'added' },
      { name: 'sentAt', type: 'DateTime?', change: 'added', note: 'Empty until the email goes out.' },
    ],
    schemaDiff: [
      '+model RestockReminder {',
      '+  id             String       @id @default(cuid())',
      '+  subscriptionId String',
      '+  subscription   Subscription @relation(fields: [subscriptionId], references: [id])',
      '+  sentAt         DateTime?',
      '+}',
    ].join('\n'),
    migration: [
      { kind: 'additive', text: 'Creates the RestockReminder table.' },
      { kind: 'rollback', text: 'Drop the RestockReminder table. Nothing else depends on it.' },
    ],
  },
  mockups: {
    location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] },
    kit: 'web',
    after:
      '<main class="mx-auto max-w-xl p-6"><h1 class="text-xl font-semibold">Account</h1><section class="mt-4 rounded-card border p-4"><h2 class="font-medium">Restock reminders</h2><p class="text-sm">We email you 5 days before an item runs out.</p><button class="mt-3 rounded bg-brand px-3 py-1.5 text-white">Change</button></section></main>',
    before: '<main class="mx-auto max-w-xl p-6"><h1 class="text-xl font-semibold">Account</h1></main>',
  },
  flows: {
    kind: 'both',
    lanes: [
      { id: 'customer', label: 'Customer', status: 'external' },
      { id: 'web', label: 'Web app', status: 'changed' },
      { id: 'db', label: 'Postgres', status: 'unchanged' },
    ],
    steps: [
      { n: 1, from: 'customer', to: 'web', label: 'Opens the account page', mockupId: 'ui-account-page' },
      { n: 2, from: 'web', to: 'db', label: 'Saves the lead time', systemNote: 'Updates Subscription.reminderLeadDays.' },
      { n: 3, label: 'The daily job picks it up tomorrow' },
    ],
  },
  timeline: {
    order: 1,
    goal: 'Reminders send for active subscriptions.',
    doneWhen: ['The daily job runs in staging', 'Each customer gets at most one email a day'],
    itemIds: ['architecture-reminder-job', 'database-restock-reminder'],
  },
};

const SHAPES: Record<DataKind, string> = {
  diagram: `Diagram data: one item is one diagram.

Shape:
{
  "kind": ${q(diagramKindValues)},
  "groups": [{ "id": string, "label": string }],
  "nodes": [{ "id": string, "label": string, "group"?: string, "status": ${q(nodeStatusValues)}, "codeRef"?: { "path": string, "symbol"?: string }, "itemId"?: string }],
  "edges": [{ "id": string, "from": string, "to": string, "label"?: string, "style"?: ${q(edgeStyleValues)} }]
}

- kind: "system" shows the parts and how they call each other; "data_flow" shows where data moves.
- groups: the apps or packages the boxes sit in, at most 30. Send [] when nothing groups.
- nodes: the boxes, 1 to 80. status is "new" (the plan adds it), "changed", "unchanged" (shown for context) or "external" (outside the repo, such as an email provider).
- codeRef: the box's real file, relative to the repo root, and optionally a symbol in it. The app checks it and marks it ✓ when found. Leave it out for files the plan creates.
- itemId: the id of an existing item this box is about, if there is one.
- edges: the lines, at most 200. label says what passes along the line. style "dashed" is for async or optional calls; the default is "solid".

Rules:
- Node ids, edge ids and group ids are each unique.
- Every edge's from and to is a node id.
- A node's group is a group id.
- Labels are names, not sentences (at most 200 characters).`,

  database: `Database data: one item is one table.

Shape:
{
  "model": string,
  "change": ${q(tableChangeValues)},
  "fields": [{ "name": string, "type": string, "change": ${q(fieldChangeValues)}, "default"?: string, "note"?: string }],
  "schemaDiff": string,
  "migration"?: [{ "kind": ${q(migrationKindValues)}, "text": string }]
}

- model: the model name exactly as in the schema file, such as "Subscription".
- change: "new" for a table the plan adds, "changed" for one it alters, "removed" for one it drops.
- fields: every field of the table, including unchanged ones, at most 200. type is written as in the schema ("String?", "Order[]", "DateTime"). default is the default as written, such as "now()". note is a short reason, when one helps.
- schemaDiff: the model's block as a diff. Each line starts with "+" (added), "-" (removed) or a space (unchanged).
- migration: what the migration does, one entry per step. "additive" only adds; "backfill" fills existing rows; "destructive" drops or narrows data; "data-risk" could lose or corrupt data if it goes wrong; "rollback" says how to undo it. Include a rollback entry.

Rules:
- Field names are unique within the table.
- The app checks changed and removed tables, and unchanged fields' types, against the repo's schema file, so copy names and types exactly.`,

  mockups: `Mockup data: one item is one screen.

Shape:
{
  "location": { "app": string, "route"?: string, "files": string[] },
  "kit": string,
  "after"?: string,
  "before"?: string
}

- location: the app's name from the repo profile (profile.apps), the screen's route (such as "/account") and its component files, relative to the repo root.
- kit: the name of the app whose design kit the mockup uses, from the repo profile. Usually the same as location.app.
- after: the screen after the change, as HTML body markup. Always send it.
- before: the screen as it is today, built from the current component. Send it only when the screen exists today.

Rules:
- Write only the page's body markup: no <html>, <head>, <body> or <meta> tags. The app adds the kit.
- Use the app's Tailwind classes and theme tokens, from the kit files listed for the app in the repo profile (profile.apps[].kitFiles). Read those files before writing markup.
- No scripts, and no <link>, <iframe>, <object>, <embed> or <template> tags.
- Images are inline SVG or plain boxes: no src or srcset pointing at http:, https: or //.
- after and before are each at most 100,000 characters.`,

  flows: `Flow data: one item is one flow.

Shape:
{
  "kind": ${q(flowKindValues)},
  "lanes"?: [{ "id": string, "label": string, "status": ${q(nodeStatusValues)} }],
  "steps": [{ "n": number, "from"?: string, "to"?: string, "label": string, "mockupId"?: string, "systemNote"?: string }]
}

- kind: "user" is what a person sees, screen by screen (drawn as a storyboard); "system" is how the parts call each other (drawn as a sequence diagram); "both" can be drawn either way, with the same step numbers.
- lanes: the parts the steps move between, at most 12, each with a status as on a diagram box. Required for "system" and "both".
- steps: 1 to 60, numbered from 1 in order. from and to are lane ids: different lanes draw an arrow, the same lane draws a self-call, and neither draws a note across the lanes.
- mockupId: on a user step, the id of the UI item (an item whose screen is mockups) that shows this screen.
- systemNote: what the system does at this step, in one sentence.

Rules:
- Step numbers are unique, and lane ids are unique.
- When there are lanes, every step's from and to is a lane id.
- "system" and "both" flows have at least one lane.
- mockupId is the id of an existing UI item.`,

  timeline: `Phase data: one item is one phase or milestone.

Shape:
{ "order": number, "goal": string, "doneWhen": string[], "itemIds": string[] }

- order: the phase's position, 1 for the first.
- goal: what the phase achieves, in one sentence.
- doneWhen: 1 to 12 checks that say the phase is finished.
- itemIds: the ids of the items built in this phase, from existingItems. While importing, keys of items in the same batch work too.

Rules:
- Every id in itemIds is an existing item.
- Every in-scope item belongs to a phase.`,
};

/** The text subagents follow when writing data of this kind (shape, rules, an example). */
export function dataShapeDoc(kind: DataKind): string {
  return `${SHAPES[kind]}
- data replaces the item's whole data, so a revision sends all of it, not just what changed.

Example:
${JSON.stringify(EXAMPLES[kind], null, 2)}`;
}

export const anchorKindValues = ['node', 'element', 'step'] as const;
export type Anchor = { itemId: string; kind: (typeof anchorKindValues)[number]; ref: string; label: string; side?: 'after' | 'before' };
export const anchorSchema: z.ZodType<Anchor, z.ZodTypeDef, unknown> = z.object({
  itemId: z.string().min(1).max(100),
  kind: z.enum(anchorKindValues),
  ref: z.string().min(1).max(2_000),
  label: z.string().min(1).max(600),
  side: z.enum(['after', 'before']).optional(),
});

/** The anchor kind each data kind accepts: diagram->node, mockups->element, flows->step; others none. */
export function anchorKindFor(kind: DataKind | null): Anchor['kind'] | null {
  if (kind === 'diagram') return 'node';
  if (kind === 'mockups') return 'element';
  if (kind === 'flows') return 'step';
  return null;
}
