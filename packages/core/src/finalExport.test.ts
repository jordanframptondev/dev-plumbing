import { describe, expect, it } from 'vitest';
import {
  availableTokens,
  diagramMermaid,
  expandTokens,
  migrationList,
  mockupAssetHtml,
  mockupAssetName,
  schemaBlock,
  sequenceMermaid,
  TOKEN_PATTERN,
  userFlowSteps,
  type TokenContext,
} from './finalExport';
import type { DiagramData, FlowData, Item, MockupData, PlumbingType, TableDiff } from './schemas';

const type = (id: string, title: string, screen: PlumbingType['screen'], order: number): PlumbingType => ({
  id,
  title,
  order,
  screen,
  emptyMessage: 'Nothing here.',
  fields: [],
  answerPresets: [],
  timeline: false,
  enabled: true,
  file: `${id}.md`,
  body: '',
  sections: {},
});
const TYPES = [
  type('architecture', 'Architecture', 'diagram', 1),
  type('database', 'Database', 'database', 2),
  type('ui', 'UI changes', 'mockups', 3),
  type('flows', 'Flows', 'flows', 4),
  type('questions', 'Questions', 'list', 5),
];

const DIAGRAM: DiagramData = {
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
};

const FLOW: FlowData = {
  kind: 'both',
  lanes: [
    { id: 'customer', label: 'Customer', status: 'external' },
    { id: 'web', label: 'Web app', status: 'changed' },
    { id: 'db', label: 'Postgres', status: 'unchanged' },
  ],
  steps: [
    { n: 2, from: 'web', to: 'db', label: 'Saves the lead time', systemNote: 'Updates Subscription.reminderLeadDays.' },
    { n: 1, from: 'customer', to: 'web', label: 'Opens the account page', mockupId: 'ui-account' },
    { n: 3, label: 'The daily job picks it up tomorrow' },
    { n: 4, from: 'web', to: 'web', label: 'Shows "Saved"' },
  ],
};
const USER_FLOW: FlowData = { kind: 'user', steps: [{ n: 1, label: 'Opens checkout' }, { n: 2, label: 'Pays', systemNote: 'Charges the card.' }] };
const SYSTEM_FLOW: FlowData = { kind: 'system', lanes: [{ id: 'job', label: 'Nightly job', status: 'new' }], steps: [{ n: 1, from: 'job', to: 'job', label: 'Syncs stock' }] };

const TABLE: TableDiff = {
  model: 'RestockReminder',
  change: 'new',
  fields: [
    { name: 'id', type: 'String', change: 'added', default: 'cuid()' },
    { name: 'sentAt', type: 'DateTime?', change: 'added' },
  ],
  schemaDiff: '+model RestockReminder {\n+  id     String    @id @default(cuid())\n+  sentAt DateTime?\n+}\n',
  migration: [
    { kind: 'additive', text: 'Creates the RestockReminder table.' },
    { kind: 'data-risk', text: 'None, the table is new.\nNothing reads it yet.' },
    { kind: 'rollback', text: 'Drop the RestockReminder table.' },
  ],
};
const MOCKUP: MockupData = {
  location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] },
  kit: 'web',
  after: '<main class="p-6"><h1>Account</h1><p>Reminders on</p></main>',
  before: '<main class="p-6"><h1>Account</h1></main>',
};

const item = (id: string, typeId: string, title: string, data?: unknown): Item => ({
  id,
  type: typeId,
  title,
  summary: title,
  threadId: `t-${id}`,
  createdBy: 'import',
  ...(data === undefined ? {} : { data }),
});
const ITEMS: Item[] = [
  item('architecture-system', 'architecture', 'System overview', DIAGRAM),
  item('architecture-old', 'architecture', 'Old diagram'),
  item('database-restock', 'database', 'RestockReminder table', TABLE),
  item('database-customer', 'database', 'Customer table', { model: 'Customer', change: 'changed', fields: [], schemaDiff: '' }),
  item('ui-account', 'ui', 'Account page', MOCKUP),
  item('ui-banner', 'ui', 'Reminder banner', { location: { app: 'web' }, kit: 'web', after: '<div class="banner">Soon</div>' }),
  item('flows-checkout', 'flows', 'Checkout', USER_FLOW),
  item('flows-sync', 'flows', 'Nightly sync', SYSTEM_FLOW),
  item('flows-restock', 'flows', 'Change the lead time', FLOW),
  item('questions-who', 'questions', 'Who gets reminders?'),
];
const ctx: TokenContext = { items: ITEMS, types: TYPES, assetsDir: 'restock.assets' };

describe('Mermaid from drawing data', () => {
  it('draws a diagram as a flowchart, with a subgraph per group and a class per status', () => {
    expect(diagramMermaid(DIAGRAM)).toBe(
      [
        '```mermaid',
        'flowchart LR',
        '  subgraph g_web["apps/web"]',
        '    n_account_page["Account page"]',
        '  end',
        '  subgraph g_worker["apps/worker"]',
        '    n_reminder_job["Daily reminder job"]',
        '  end',
        '  n_db["Postgres"]',
        '  n_email["Email provider"]',
        '  n_account_page -->|"saves lead time"| n_db',
        '  n_reminder_job -->|"finds due subscriptions"| n_db',
        '  n_reminder_job -.->|"sends"| n_email',
        '  classDef new stroke:#5f8a5b',
        '  classDef changed stroke:#c07a2c',
        '  classDef unchanged stroke:#cbcbcb',
        '  classDef external stroke-dasharray:4 3',
        '  class n_account_page changed',
        '  class n_reminder_job new',
        '  class n_db unchanged',
        '  class n_email external',
        '```',
      ].join('\n'),
    );
  });

  it('draws a flow as a sequence diagram whose numbers match its steps', () => {
    expect(sequenceMermaid(FLOW)).toBe(
      [
        '```mermaid',
        'sequenceDiagram',
        '  autonumber',
        '  participant l_customer as Customer',
        '  participant l_web as Web app',
        '  participant l_db as Postgres',
        '  l_customer->>l_web: Opens the account page',
        '  l_web->>l_db: Saves the lead time',
        '  Note right of l_db: Updates Subscription.reminderLeadDays.',
        '  Note over l_customer,l_db: 3. The daily job picks it up tomorrow',
        '  autonumber 4',
        '  l_web->>l_web: Shows #quot;Saved#quot;',
        '```',
      ].join('\n'),
    );
  });

  it('writes a user flow as numbered steps', () => {
    expect(userFlowSteps(FLOW)).toBe(
      [
        '1. Opens the account page',
        '2. Saves the lead time',
        '   - System: Updates Subscription.reminderLeadDays.',
        '3. The daily job picks it up tomorrow',
        '4. Shows "Saved"',
      ].join('\n'),
    );
    const long: FlowData = { kind: 'user', steps: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, label: `Step\n${i + 1}`, ...(i === 9 ? { systemNote: 'Saves it.' } : {}) })) };
    expect(userFlowSteps(long).split('\n').slice(-2)).toEqual(['10. Step 10', '    - System: Saves it.']);
  });

  it('escapes labels, so quotes, brackets and new lines are only text', () => {
    const odd: DiagramData = {
      kind: 'data_flow',
      groups: [{ id: 'core pkg', label: 'The "core"\npackage' }],
      nodes: [
        { id: 'a-b', label: 'Say "hi"\n  (now) [x] {y}', group: 'core pkg', status: 'new' },
        { id: 'a_b', label: 'Map<string, Item>; `raw` 100%', status: 'changed' },
        { id: 'end', label: 'end', status: 'unchanged' },
      ],
      edges: [
        { id: 'e1', from: 'a-b', to: 'a_b', label: 'a | b; "c"\nd' },
        { id: 'e2', from: 'a_b', to: 'end', label: '   ', style: 'dashed' },
      ],
    };
    expect(diagramMermaid(odd).split('\n').slice(1, 9)).toEqual([
      'flowchart LR',
      '  subgraph g_core_pkg["The #quot;core#quot; package"]',
      '    n_a_b["Say #quot;hi#quot; (now) [x] {y}"]',
      '  end',
      '  n_a_b_2["Map#lt;string, Item#gt;#59; #96;raw#96; 100#37;"]',
      '  n_end["end"]',
      '  n_a_b -->|"a | b#59; #quot;c#quot; d"| n_a_b_2',
      '  n_a_b_2 -.-> n_end',
    ]);
    const lanes: FlowData = {
      kind: 'system',
      lanes: [{ id: 'job', label: 'Job; "nightly"', status: 'new' }],
      steps: [
        { n: 1, label: 'Wakes up\nat 2am' },
        { n: 2, from: 'job', to: 'job', label: 'Retries; then gives up', systemNote: 'Logs it;\nquietly' },
      ],
    };
    expect(sequenceMermaid(lanes).split('\n').slice(1, -1)).toEqual([
      'sequenceDiagram',
      '  autonumber',
      '  participant l_job as Job#59; #quot;nightly#quot;',
      '  Note over l_job: 1. Wakes up at 2am',
      '  autonumber 2',
      '  l_job->>l_job: Retries#59; then gives up',
      '  Note right of l_job: Logs it#59; quietly',
    ]);
  });
});

describe('schema blocks and mockup files', () => {
  it('copies the schema diff exactly, in a diff fence', () => {
    expect(schemaBlock(TABLE)).toBe('```diff\n+model RestockReminder {\n+  id     String    @id @default(cuid())\n+  sentAt DateTime?\n+}\n```');
    expect(schemaBlock({ ...TABLE, schemaDiff: '+/// Use ``` for code\n+model A {}' })).toBe('````diff\n+/// Use ``` for code\n+model A {}\n````');
  });

  it('lists the migration notes with the Database screen labels', () => {
    expect(migrationList(TABLE)).toBe(
      ['- **Additive:** Creates the RestockReminder table.', '- **Data risk:** None, the table is new. Nothing reads it yet.', '- **Rollback:** Drop the RestockReminder table.'].join('\n'),
    );
  });

  it('makes each mockup a plain HTML file that names its app, route and kit', () => {
    expect(mockupAssetName('ui-account', 'after')).toBe('ui-account.after.html');
    expect(mockupAssetHtml({ title: 'Account page <after>', app: 'web', route: '/account', kitFiles: ['apps/web/app/globals.css', 'apps/web/app/theme.css'], body: MOCKUP.after! })).toBe(
      [
        '<!doctype html>',
        "<!-- dev-plumbing mockup: app web, route /account, kit files: apps/web/app/globals.css, apps/web/app/theme.css. The classes are the app's own; this file has no styles. -->",
        '<html>',
        '<head>',
        '<meta charset="utf-8">',
        '<title>Account page &lt;after&gt;</title>',
        '</head>',
        '<body>',
        '<main class="p-6"><h1>Account</h1><p>Reminders on</p></main>',
        '</body>',
        '</html>',
        '',
      ].join('\n'),
    );
    const bare = mockupAssetHtml({ title: 'Banner', app: 'web', route: '/a--b-->', kitFiles: [], body: '<div></div>' });
    expect(bare.split('\n')[1]).toBe("<!-- dev-plumbing mockup: app web, route /a- -b- ->, kit files: none. The classes are the app's own; this file has no styles. -->");
  });
});

describe('tokens', () => {
  it('uses the pattern from the plan', () => {
    expect(TOKEN_PATTERN.source).toBe('\\{\\{(diagram|sequence|steps|schema|migration|mockup):([a-z0-9][a-z0-9-]*)(?::(after|before))?\\}\\}');
    expect(TOKEN_PATTERN.flags).toBe('g');
  });

  it('expands every kind of token, keeping list indentation', () => {
    const markdown = [
      '## Architecture',
      '',
      '{{diagram:architecture-system}}',
      '',
      '## Data model',
      '',
      '{{schema:database-restock}}',
      '',
      '{{migration:database-restock}}',
      '',
      '## UI changes',
      '',
      'Account page: {{mockup:ui-account:after}}, and today {{mockup:ui-account:before}}.',
      '',
      '## Flows',
      '',
      '- Checkout:',
      '  {{steps:flows-checkout}}',
      '- Nightly sync:',
      '',
      '  {{sequence:flows-sync}}',
      '',
    ].join('\n');
    const r = expandTokens(markdown, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.markdown).toBe(
      [
        '## Architecture',
        '',
        diagramMermaid(DIAGRAM),
        '',
        '## Data model',
        '',
        schemaBlock(TABLE),
        '',
        migrationList(TABLE),
        '',
        '## UI changes',
        '',
        'Account page: [After mockup](restock.assets/ui-account.after.html), and today [Before mockup](restock.assets/ui-account.before.html).',
        '',
        '## Flows',
        '',
        '- Checkout:',
        '  1. Opens checkout',
        '  2. Pays',
        '     - System: Charges the card.',
        '- Nightly sync:',
        '',
        '  ```mermaid',
        '  sequenceDiagram',
        '    autonumber',
        '    participant l_job as Nightly job',
        '    l_job->>l_job: Syncs stock',
        '  ```',
        '',
      ].join('\n'),
    );
    expect(r.assets).toEqual([
      { itemId: 'ui-account', side: 'after' },
      { itemId: 'ui-account', side: 'before' },
    ]);
    expect(r.markdown).not.toContain('{{');
  });

  it('collects each mockup asset once, and links a folder name with spaces safely', () => {
    const r = expandTokens('{{mockup:ui-banner:after}} and again {{mockup:ui-banner:after}}, then {{mockup:ui-account:after}}', { ...ctx, assetsDir: 'restock (v2).assets' });
    expect(r).toEqual({
      ok: true,
      markdown:
        '[After mockup](restock%20%28v2%29.assets/ui-banner.after.html) and again [After mockup](restock%20%28v2%29.assets/ui-banner.after.html), then [After mockup](restock%20%28v2%29.assets/ui-account.after.html)',
      assets: [
        { itemId: 'ui-banner', side: 'after' },
        { itemId: 'ui-account', side: 'after' },
      ],
    });
  });

  it('encodes # and ? in the folder name, so they are not read as a fragment or query', () => {
    expect(expandTokens('{{mockup:ui-banner:after}}', { ...ctx, assetsDir: 'restock #2?.assets' })).toMatchObject({
      ok: true,
      markdown: '[After mockup](restock%20%232%3F.assets/ui-banner.after.html)',
    });
  });

  it('unknown or mismatched tokens are refused', () => {
    const markdown = [
      '{{diagram:architecture-gone}}',
      '{{diagram:questions-who}}',
      '{{diagram:architecture-old}}',
      '{{diagram:architecture-system:after}}',
      '{{sequence:flows-checkout}}',
      '{{steps:flows-sync}}',
      '{{schema:database-customer}}',
      '{{migration:database-customer}}',
      '{{schema:ui-account}}',
      'See {{mockup:ui-banner:before}} and {{mockup:ui-banner}}.',
      'Inline {{diagram:architecture-system}} is not a block.',
      '{{diagram:architecture-gone}}',
      '{{nonsense}} and {{ diagram:architecture-system }} and {{Diagram:architecture-system}}',
      'An open {{ that never closes',
    ].join('\n');
    expect(expandTokens(markdown, ctx)).toEqual({
      ok: false,
      problems: [
        '{{diagram:architecture-gone}}: there\'s no item "architecture-gone".',
        '{{diagram:questions-who}}: "Who gets reminders?" isn\'t a diagram item.',
        '{{diagram:architecture-old}}: "Old diagram" has no diagram data.',
        '{{diagram:architecture-system:after}}: only mockup tokens take :after or :before.',
        '{{sequence:flows-checkout}}: that flow is a user flow; use {{steps:flows-checkout}}.',
        '{{steps:flows-sync}}: that flow is a system flow; use {{sequence:flows-sync}}.',
        '{{schema:database-customer}}: "Customer table" has no schema diff.',
        '{{migration:database-customer}}: "Customer table" has no migration notes.',
        '{{schema:ui-account}}: "Account page" isn\'t a database item.',
        '{{mockup:ui-banner:before}}: "Reminder banner" has no before mockup.',
        '{{mockup:ui-banner}}: say which side: {{mockup:ui-banner:after}} or {{mockup:ui-banner:before}}.',
        '{{diagram:architecture-system}}: put this token on a line of its own.',
        'Unknown token: {{nonsense}}.',
        'Unknown token: {{ diagram:architecture-system }}.',
        'Unknown token: {{Diagram:architecture-system}}.',
        'Unknown token: {{ that never closes.',
      ],
    });
  });

  it('leaves {{ inside a code fence as it is, such as a GitHub Actions expression', () => {
    const markdown = [
      '## Deploy',
      '',
      '```yaml',
      'env:',
      '  TOKEN: ${{ secrets.TOKEN }}',
      '  NAME: ${{ github.ref_name }}',
      '```',
      '',
      'Nothing else.',
      '',
    ].join('\n');
    expect(expandTokens(markdown, ctx)).toEqual({ ok: true, markdown, assets: [] });
  });

  it('leaves {{ inside inline code as it is', () => {
    const markdown = 'The email says `Hi {{name}},` and the SMS ``{{ `first` }}``.\n';
    expect(expandTokens(markdown, ctx)).toEqual({ ok: true, markdown, assets: [] });
  });

  it('leaves a Handlebars template in a ~~~ fence as it is, and expands the tokens outside it', () => {
    const template = ['~~~handlebars', '{{#each reminders}}', '  <li>{{this.title}}</li>', '{{/each}}', '~~~'].join('\n');
    const r = expandTokens(`${template}\n\n{{diagram:architecture-system}}\n`, ctx);
    expect(r).toEqual({ ok: true, markdown: `${template}\n\n${diagramMermaid(DIAGRAM)}\n`, assets: [] });
  });

  it('a fence ends only at a fence of the same character, at least as long', () => {
    const fenced = ['````md', '```yaml', 'a: ${{ b }}', '```', '~~~~', '{{ still code }}', '````'].join('\n');
    expect(expandTokens(`${fenced}\n`, ctx)).toEqual({ ok: true, markdown: `${fenced}\n`, assets: [] });
    expect(expandTokens(`${fenced}\nAfter it, {{ stray\n`, ctx)).toEqual({ ok: false, problems: ['Unknown token: {{ stray.'] });
  });

  it('refuses a real token inside code, so nothing inside code is expanded', () => {
    const markdown = ['```md', '{{diagram:architecture-system}}', '```', '', 'Link it as `{{mockup:ui-account:after}}`.', '', '{{diagram:architecture-gone}}', ''].join('\n');
    expect(expandTokens(markdown, ctx)).toEqual({
      ok: false,
      problems: [
        '{{diagram:architecture-system}}: put tokens outside code blocks.',
        '{{mockup:ui-account:after}}: put tokens outside code blocks.',
        '{{diagram:architecture-gone}}: there\'s no item "architecture-gone".',
      ],
    });
  });

  it('expands a block token in a document with CRLF line ends', () => {
    const markdown = '# Final\r\n\r\n{{diagram:architecture-system}}\r\n\r\n```\r\n{{ kept }}\r\n```\r\n';
    expect(expandTokens(markdown, ctx)).toEqual({
      ok: true,
      markdown: `# Final\r\n\r\n${diagramMermaid(DIAGRAM)}\r\n\r\n\`\`\`\r\n{{ kept }}\r\n\`\`\`\r\n`,
      assets: [],
    });
  });

  it("doesn't depend on the shared pattern's position", () => {
    TOKEN_PATTERN.lastIndex = 10;
    expect(expandTokens('{{steps:flows-checkout}}', ctx)).toMatchObject({ ok: true, markdown: '1. Opens checkout\n2. Pays\n   - System: Charges the card.' });
    TOKEN_PATTERN.lastIndex = 0;
  });

  it('lists the tokens a finalizer may use', () => {
    expect(availableTokens(ITEMS, TYPES)).toEqual([
      '{{diagram:architecture-system}}: the Mermaid flowchart of "System overview".',
      '{{schema:database-restock}}: the schema diff of "RestockReminder table".',
      '{{migration:database-restock}}: the migration notes of "RestockReminder table".',
      '{{mockup:ui-account:after}}: a link to the after mockup of "Account page", copied into the assets folder.',
      '{{mockup:ui-account:before}}: a link to the before mockup of "Account page", copied into the assets folder.',
      '{{mockup:ui-banner:after}}: a link to the after mockup of "Reminder banner", copied into the assets folder.',
      '{{sequence:flows-restock}}: the Mermaid sequence diagram of "Change the lead time".',
      '{{steps:flows-restock}}: the numbered steps of "Change the lead time".',
      '{{steps:flows-checkout}}: the numbered steps of "Checkout".',
      '{{sequence:flows-sync}}: the Mermaid sequence diagram of "Nightly sync".',
    ]);
  });
});
