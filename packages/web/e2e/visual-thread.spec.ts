import { expect, test } from '@playwright/test';
import { api, asClaude, importProject, writeRawData, type TestItem } from './claude';

const diagram = {
  kind: 'system',
  groups: [
    { id: 'web', label: 'apps/web' },
    { id: 'jobs', label: 'packages/jobs' },
  ],
  nodes: [
    { id: 'page', label: 'Reminders page', group: 'web', status: 'new' },
    { id: 'worker', label: 'Reminder worker', group: 'jobs', status: 'new' },
    { id: 'sms', label: 'SMS provider', status: 'external' },
  ],
  edges: [
    { id: 'page-worker', from: 'page', to: 'worker' },
    { id: 'worker-sms', from: 'worker', to: 'sms', label: 'send' },
  ],
};
const system: TestItem = { key: 'system', title: 'Restock system', summary: 'The parts that send reminders.', data: diagram };

test("an item's thread draws it, and folds it with the card", async ({ page }) => {
  const p = await importProject('vt-diagram', 'Visual thread diagram', { architecture: [system] });
  await page.goto(`${p.url}/th/t-architecture-system`);
  const drawing = page.getByTestId('item-drawing');
  await expect(drawing.getByTestId('diagram-node')).toHaveCount(3);
  await expect(drawing.locator('[data-testid="diagram-node"][data-node="sms"]')).toHaveAttribute('data-status', 'external');
  await expect(page.getByText(/arrives in a later update/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Collapse' }).click();
  await expect(page.getByTestId('item-drawing')).toHaveCount(0);
});

test("a pin's thread says what it's on, and links back to the drawing", async ({ page }) => {
  const p = await importProject('vt-pin', 'Visual thread pin', { architecture: [system] });
  const added = await api(`/api/projects/${p.repo}/${p.project}/items`, 'POST', {
    type: 'architecture',
    title: 'Why a separate worker?',
    text: 'Could the API send them itself?',
    anchor: { itemId: 'architecture-system', kind: 'node', ref: 'worker', label: 'Reminder worker' },
  });
  await page.goto(`${p.url}/th/${added.threadId}`);
  const card = page.getByRole('region', { name: 'Item' });
  await expect(card.getByText('On', { exact: true })).toBeVisible();
  await card.getByRole('link', { name: 'Restock system › Reminder worker' }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/t/architecture\\?item=architecture-system$`));
  await expect(page.locator('[data-testid="diagram-node"][data-node="worker"]').first()).toBeVisible();
});

test('a proposed drawing change is described, can be drawn, and applies when accepted', async ({ page }) => {
  const p = await importProject('vt-option', 'Visual thread option', { architecture: [system] });
  const P = `/api/projects/${p.repo}/${p.project}`;
  await api(`${P}/threads/t-architecture-system/draft`, 'PUT', { text: 'Do we need a cache in front of the provider?' });
  await api(`${P}/submit`, 'POST', { scope: 'thread', threadId: 't-architecture-system' });
  await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-visual-thread', timeoutSeconds: 0 });
  const withCache = { ...diagram, nodes: [...diagram.nodes, { id: 'cache', label: 'Send cache', group: 'jobs', status: 'new' }] };
  await asClaude('/reply', {
    repo: p.repo,
    project: p.project,
    threadId: 't-architecture-system',
    text: 'A small cache stops a second run from sending twice.',
    options: [
      { id: 'cache', label: 'Add a send cache', change: { items: [{ itemId: 'architecture-system', patch: { data: withCache } }] } },
      { id: 'none', label: 'No cache' },
    ],
    recommended: 'cache',
  });

  await page.goto(`${p.url}/th/t-architecture-system`);
  await page.getByRole('radio', { name: /Add a send cache/ }).check();
  const preview = page.getByRole('region', { name: 'What changes if you accept' });
  await expect(preview.getByTestId('data-preview')).toContainText('1 box added');
  await preview.getByRole('button', { name: 'View proposed' }).click();
  await expect(preview.locator('[data-testid="diagram-node"][data-node="cache"]')).toBeVisible();
  // Until it's accepted, the item's own drawing doesn't have it.
  await expect(page.getByTestId('item-drawing').locator('[data-node="cache"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByTestId('send-notice')).toHaveText('Applied. 1 thread resolved.');
  await expect(page.getByTestId('item-drawing').locator('[data-testid="diagram-node"][data-node="cache"]')).toBeVisible();
  await page.goto(`${p.url}/t/architecture`);
  await expect(page.locator('[data-testid="diagram-node"][data-node="cache"]')).toBeVisible();
  await page.goto(`${p.url}/d/draft`);
  await page.getByRole('tab', { name: 'Changes' }).click();
  const changes = page.getByTestId('changes');
  await expect(changes).toContainText('Accepted');
  await expect(changes).toContainText('Restock system: Add a send cache');
});

test('View proposed draws the mockup an option proposes, not the saved one', async ({ page }) => {
  const settings = { location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] }, kit: 'web', after: '<section class="rounded-card p-4"><h2>Restock settings</h2></section>' };
  const card: TestItem = { key: 'settings', title: 'Restock settings card', summary: 'On the account page.', data: settings };
  const p = await importProject('vt-mockup-option', 'Visual thread mockup option', { ui: [card] });
  const P = `/api/projects/${p.repo}/${p.project}`;
  await api(`${P}/threads/t-ui-settings/draft`, 'PUT', { text: 'Can people choose how many days before?' });
  await api(`${P}/submit`, 'POST', { scope: 'thread', threadId: 't-ui-settings' });
  await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-visual-thread-mockup', timeoutSeconds: 0 });
  const withDays = { ...settings, after: '<section class="rounded-card p-4"><h2>Restock settings</h2><label>Days before <input value="3"></label></section>' };
  await asClaude('/reply', {
    repo: p.repo,
    project: p.project,
    threadId: 't-ui-settings',
    text: 'A days field fits under the heading.',
    options: [
      { id: 'days', label: 'Add a days field', change: { items: [{ itemId: 'ui-settings', patch: { data: withDays } }] } },
      { id: 'keep', label: 'Keep it as it is' },
    ],
    recommended: 'days',
  });

  await page.goto(`${p.url}/th/t-ui-settings`);
  await page.getByRole('radio', { name: /Add a days field/ }).check();
  const preview = page.getByRole('region', { name: 'What changes if you accept' });
  await expect(preview.getByTestId('data-preview')).toContainText('After mockup redrawn');
  await preview.getByRole('button', { name: 'View proposed' }).click();
  await expect(preview.getByTestId('mockup-frame')).toHaveAttribute('src', /\/options\/days\/mockup\/after/);
  // The item's own drawing still loads the saved mockup.
  await expect(page.getByTestId('item-drawing').getByTestId('mockup-frame')).toHaveAttribute('src', /\/items\/ui-settings\/mockup\/after/);
});

const SETTINGS_CARD = { location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] }, kit: 'web', after: '<section class="rounded-card p-4"><h2>Restock settings</h2></section>' };
const withField = (label: string) => ({ ...SETTINGS_CARD, after: `<section class="rounded-card p-4"><h2>Restock settings</h2><label>${label} <input value="3"></label></section>` });

/** A UI item whose thread is waiting on you, with Claude's options, each redrawing the item's After mockup. */
async function mockupOptions(name: string, options: { id: string; label: string; field: string }[]) {
  const card: TestItem = { key: 'settings', title: 'Restock settings card', summary: 'On the account page.', data: SETTINGS_CARD };
  const p = await importProject(name, `Visual thread ${name}`, { ui: [card] });
  const P = `/api/projects/${p.repo}/${p.project}`;
  await api(`${P}/threads/t-ui-settings/draft`, 'PUT', { text: 'Can people choose when they hear?' });
  await api(`${P}/submit`, 'POST', { scope: 'thread', threadId: 't-ui-settings' });
  await asClaude('/wait', { repo: p.repo, project: p.project, windowId: `w-e2e-${name}`, timeoutSeconds: 0 });
  await asClaude('/reply', {
    repo: p.repo,
    project: p.project,
    threadId: 't-ui-settings',
    text: 'A field fits under the heading.',
    options: options.map((o) => ({ id: o.id, label: o.label, change: { items: [{ itemId: 'ui-settings', patch: { data: withField(o.field) } }] } })),
    recommended: options[0]!.id,
  });
  return p;
}

test('accepting a mockup redraw updates the thread view', async ({ page }) => {
  const p = await mockupOptions('vt-mockup-redraw', [{ id: 'days', label: 'Add a days field', field: 'Days before' }]);
  await page.goto(`${p.url}/th/t-ui-settings`);
  const saved = page.getByTestId('item-drawing').frameLocator('[data-testid=mockup-frame]');
  await expect(saved.getByRole('heading', { name: 'Restock settings' })).toBeVisible();
  await expect(saved.getByText('Days before')).toHaveCount(0);

  await page.getByRole('radio', { name: /Add a days field/ }).check();
  await page.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByTestId('send-notice')).toHaveText('Applied. 1 thread resolved.');
  // Same item, same URL, new markup: the frame shows it without a reload of the page.
  await expect(saved.getByText('Days before')).toBeVisible();
});

test("switching proposed options doesn't trap Back", async ({ page }) => {
  const p = await mockupOptions('vt-mockup-switch', [
    { id: 'days', label: 'Add a days field', field: 'Days before' },
    { id: 'weeks', label: 'Add a weeks field', field: 'Weeks before' },
  ]);
  // A page to go back to.
  await page.goto(p.url);
  await page.goto(`${p.url}/th/t-ui-settings`);
  await page.getByRole('radio', { name: /Add a days field/ }).check();
  const preview = page.getByRole('region', { name: 'What changes if you accept' });
  await preview.getByRole('button', { name: 'View proposed' }).click();
  const proposed = preview.frameLocator('[data-testid=mockup-frame]');
  await expect(proposed.getByText('Days before')).toBeVisible();
  const entries = await page.evaluate(() => history.length);

  await page.getByRole('radio', { name: /Add a weeks field/ }).check();
  await expect(proposed.getByText('Weeks before')).toBeVisible();
  // Switching added no history entry, so one Back leaves the thread view.
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await page.goBack({ timeout: 10_000 });
  await expect(page).toHaveURL(new RegExp(`${p.url}$`));
});

test("a thread whose drawing can't be shown says why, and keeps the rest of the card", async ({ page }) => {
  const p = await importProject('vt-broken', 'Visual thread broken', { architecture: [system] });
  await writeRawData(p, 'architecture-system', { kind: 'system', nodes: [], edges: [] });
  await page.goto(`${p.url}/th/t-architecture-system`);
  await expect(page.getByTestId('item-drawing')).toContainText("This item's drawing couldn't be shown");
  await expect(page.getByRole('heading', { level: 1, name: 'Restock system' })).toBeVisible();
});

test('tables, mockups, flows and phases draw in their threads', async ({ page }) => {
  const table: TestItem = {
    key: 'reminder',
    title: 'RestockReminder table',
    summary: 'Logs each reminder.',
    data: {
      model: 'RestockReminder',
      change: 'new',
      fields: [
        { name: 'id', type: 'String', change: 'added' },
        { name: 'subscriptionId', type: 'String', change: 'added' },
      ],
      schemaDiff: '+model RestockReminder {\n+  id             String @id @default(uuid())\n+  subscriptionId String\n+}',
    },
  };
  const card: TestItem = {
    key: 'settings',
    title: 'Restock settings card',
    summary: 'On the account page.',
    data: { location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] }, kit: 'web', after: '<section class="rounded-card p-4"><h2>Restock settings</h2></section>' },
  };
  const job: TestItem = {
    key: 'job',
    title: 'Daily reminder job',
    summary: 'From the job to the provider.',
    data: {
      kind: 'system',
      lanes: [
        { id: 'job', label: 'Reminder job', status: 'new' },
        { id: 'sms', label: 'SMS provider', status: 'external' },
      ],
      steps: [{ n: 1, from: 'job', to: 'sms', label: 'Send the reminder' }],
    },
  };
  const first: TestItem = {
    key: 'first',
    title: 'Ship the table first',
    summary: 'Storage first.',
    data: { order: 1, goal: 'Reminders can be stored.', doneWhen: ['The migration runs'], itemIds: ['database-reminder'] },
  };
  const p = await importProject('vt-kinds', 'Visual thread kinds', { database: [table], ui: [card], flows: [job], phases: [first] });

  await page.goto(`${p.url}/th/t-database-reminder`);
  await expect(page.getByTestId('item-drawing').getByTestId('table-card')).toBeVisible();

  await page.goto(`${p.url}/th/t-flows-job`);
  await expect(page.getByTestId('item-drawing').getByTestId('sequence-step')).toHaveCount(1);

  await page.goto(`${p.url}/th/t-phases-first`);
  const phase = page.getByTestId('item-drawing').getByTestId('phase-view');
  await expect(phase).toContainText('Reminders can be stored.');
  await expect(phase).toContainText('The migration runs');

  await page.goto(`${p.url}/th/t-ui-settings`);
  const mockup = page.getByTestId('item-drawing');
  await expect(mockup.getByTestId('mockup-frame')).toHaveAttribute('src', /\/items\/ui-settings\/mockup\/after/);
  await mockup.getByRole('link', { name: 'Open in UI changes' }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/t/ui\\?item=ui-settings$`));
});
