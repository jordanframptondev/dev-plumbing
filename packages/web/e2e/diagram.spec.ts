import { expect, test, type Locator, type Page } from '@playwright/test';
import { api, importProject, writeRawData, type TestItem } from './claude';
import { noSideScroll, readJson, writeJson } from './env';

const system: TestItem = {
  key: 'system',
  title: 'System view',
  summary: 'The reminders page, the daily job and what it talks to.',
  data: {
    kind: 'system',
    groups: [
      { id: 'web', label: 'Web app' },
      { id: 'jobs', label: 'Jobs' },
    ],
    nodes: [
      { id: 'page', label: 'Reminders page', group: 'web', status: 'new', codeRef: { path: 'apps/web/app/reminders/page.tsx' } },
      { id: 'job', label: 'Reminder job', group: 'jobs', status: 'changed', codeRef: { path: 'apps/web/lib/reminders.ts', symbol: 'sendRestockReminders' } },
      { id: 'retry', label: 'Retry queue', group: 'jobs', status: 'new', codeRef: { path: 'apps/web/lib/retry.ts' } },
      { id: 'db', label: 'Orders database', status: 'unchanged' },
      { id: 'sms', label: 'SMS provider', status: 'external' },
    ],
    edges: [
      { id: 'schedules', from: 'page', to: 'job', label: 'schedules' },
      { id: 'reads', from: 'job', to: 'db', label: 'reads' },
      { id: 'retries', from: 'job', to: 'retry' },
      { id: 'sends', from: 'job', to: 'sms', style: 'dashed' },
    ],
  },
};
const dataFlow: TestItem = {
  key: 'data-flow',
  title: 'Reminder data flow',
  summary: 'From an order to a reminder row.',
  data: {
    kind: 'data_flow',
    groups: [],
    nodes: [
      { id: 'order', label: 'Order placed', status: 'unchanged' },
      { id: 'due', label: 'Due date', status: 'new' },
      { id: 'reminder', label: 'Reminder row', status: 'new' },
    ],
    edges: [
      { id: 'a', from: 'order', to: 'due' },
      { id: 'b', from: 'due', to: 'reminder', label: 'writes' },
    ],
  },
};

/** 20 boxes in four groups, each linked to the next one. */
function twentyBoxes() {
  const groups = ['web', 'api', 'jobs', 'data'].map((id) => ({ id, label: `The ${id} part` }));
  const statuses = ['new', 'changed', 'unchanged', 'external'];
  const nodes = Array.from({ length: 20 }, (_, i) => ({
    id: `box-${i}`,
    label: `Box ${i}`,
    status: statuses[i % 4],
    ...(i < 16 ? { group: groups[i % 4]!.id } : {}),
  }));
  const edges = nodes.slice(1).map((n, i) => ({ id: `line-${i}`, from: `box-${i}`, to: n.id }));
  return { kind: 'system', groups, nodes, edges };
}

const section = (page: Page, title: string) => page.getByTestId('diagram-section').filter({ hasText: title });
const box = (scope: Page | Locator, id: string) => scope.locator(`[data-testid=diagram-node][data-node="${id}"]`);

test('draws each diagram with its boxes, statuses, file checks and lines', async ({ page }) => {
  const p = await importProject('diagram-draws', 'Diagram draws', { architecture: [system, dataFlow] });
  await page.goto(`${p.url}/t/architecture`);
  const sys = section(page, 'System view');
  await expect(box(sys, 'page')).toHaveAttribute('data-status', 'new');
  await expect(box(sys, 'job')).toHaveAttribute('data-status', 'changed');
  await expect(box(sys, 'db')).toHaveAttribute('data-status', 'unchanged');
  await expect(box(sys, 'sms')).toHaveAttribute('data-status', 'external');
  // ✓ on a file that's in the clone, "not found" on one that isn't.
  await expect(box(sys, 'job').locator('[data-check=found]')).toHaveCount(1);
  await expect(box(sys, 'retry').locator('[data-check=missing]')).toHaveText('not found');
  await expect(sys.getByTestId('diagram-edge')).toHaveCount(4);
  await expect(sys.getByText('System', { exact: true })).toBeVisible();
  // The fixture repo is the clone, so the boxes were checked, and the legend sits under the drawing.
  await expect(sys.getByTestId('diagram-checks')).toHaveCount(0);
  await expect(sys.getByTestId('diagram-legend')).toContainText('outside the repo');
  const flow = section(page, 'Reminder data flow');
  await expect(flow.getByTestId('diagram-node')).toHaveCount(3);
  await expect(flow.getByText('Data flow', { exact: true })).toBeVisible();

  // ?item= opens one diagram.
  await page.goto(`${p.url}/t/architecture?item=architecture-data-flow`);
  await expect(section(page, 'Reminder data flow')).toHaveAttribute('data-selected', 'true');
  await expect(section(page, 'System view')).not.toHaveAttribute('data-selected', 'true');
});

test('Ask about this box starts a thread about it, the box gets a bubble, and the thread outlives the box', async ({ page }) => {
  const p = await importProject('diagram-ask', 'Diagram ask', { architecture: [system] });
  await page.goto(`${p.url}/t/architecture`);
  await page.getByRole('button', { name: 'Reminder job, changed' }).click();
  const panel = page.getByTestId('node-panel');
  await expect(panel.getByRole('heading')).toHaveText('Reminder job');
  await expect(panel).toContainText('Changed');
  await expect(panel).toContainText('apps/web/lib/reminders.ts · sendRestockReminders ✓');
  await panel.getByRole('button', { name: 'Ask about this box' }).click();
  await expect(panel.getByRole('textbox', { name: 'Title' })).toHaveValue('About Reminder job');
  await panel.getByRole('textbox', { name: 'Your message' }).fill('Does it retry a failed send?');
  await panel.getByRole('button', { name: 'Add and send' }).click();

  // The thread view shows the new thread; Task 16 adds its "On" line.
  await expect(page).toHaveURL(/\/th\/t-architecture-about-reminder-job$/);
  await expect(page.getByText('Does it retry a failed send?')).toBeVisible();
  await expect(page.getByTestId('thread-status')).toHaveText('With Claude');
  const detail = await api(`/api/projects/${p.repo}/${p.project}/threads/t-architecture-about-reminder-job`);
  expect(detail.item.anchor).toEqual({ itemId: 'architecture-system', kind: 'node', ref: 'job', label: 'Reminder job' });

  await page.goto(`${p.url}/t/architecture`);
  const job = box(page, 'job');
  await expect(job.getByTestId('diagram-bubble')).toHaveAttribute('data-count', '1');
  await expect(job.getByTestId('diagram-bubble')).toHaveAttribute('data-tone', 'slate');
  await job.click();
  await page.getByTestId('node-panel').getByRole('link', { name: 'About Reminder job' }).click();
  await expect(page).toHaveURL(/\/th\/t-architecture-about-reminder-job$/);
  // A thread about a box is a bubble, not another row.
  await page.goto(`${p.url}/t/architecture`);
  await expect(box(page, 'job')).toBeVisible();
  await expect(page.getByTestId('other-item')).toHaveCount(0);

  // Claude redraws the diagram without that box: its thread stays under the diagram, marked "Not in this version".
  const drawing = system.data as { nodes: { id: string }[]; edges: { from: string; to: string }[] };
  writeRawData(p, 'architecture-system', {
    ...drawing,
    nodes: drawing.nodes.filter((n) => n.id !== 'job'),
    edges: drawing.edges.filter((e) => e.from !== 'job' && e.to !== 'job'),
  });
  await page.goto(`${p.url}/t/architecture`);
  const sys = section(page, 'System view');
  await expect(sys.getByTestId('diagram-node')).toHaveCount(4);
  await expect(sys.getByTestId('gone-pin')).toHaveText([/About Reminder job\s*Not in this version/]);
  await expect(page.getByTestId('other-item')).toHaveCount(0);
});

test("a diagram that can't be drawn doesn't hide the others", async ({ page }) => {
  const p = await importProject('diagram-broken', 'Diagram broken', {
    architecture: [system, dataFlow, { key: 'notes', title: 'Notes on the job', summary: 'Nothing to draw yet.' }],
  });
  writeRawData(p, 'architecture-data-flow', { kind: 'data_flow', nodes: 'not a list' });
  await page.goto(`${p.url}/t/architecture`);
  const problem = page.getByTestId('data-problem');
  await expect(problem).toContainText('Reminder data flow');
  await expect(problem).toContainText("This item's drawing couldn't be shown");
  await expect(problem.getByRole('listitem').first()).toContainText('nodes');
  await problem.getByText('Raw data').click();
  await expect(problem.locator('pre')).toContainText('not a list');
  await expect(problem.getByRole('link', { name: 'Open thread →' })).toHaveAttribute('href', `${p.url}/th/t-architecture-data-flow`);
  // The other diagram still draws, and the item without data is still listed.
  await expect(section(page, 'System view').getByTestId('diagram-node')).toHaveCount(5);
  await expect(page.getByTestId('other-item')).toHaveText([/Notes on the job/]);
});

test('boxes take the dark theme colours', async ({ page }) => {
  const p = await importProject('diagram-dark', 'Diagram dark', { architecture: [system] });
  const saved = readJson('settings.json');
  writeJson('settings.json', { ...saved, theme: 'dark' });
  try {
    await page.goto(`${p.url}/t/architecture`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const rect = box(page, 'page').locator('[data-part=box]');
    // Dark moss, #8DB587.
    await expect.poll(() => rect.evaluate((el) => getComputedStyle(el).stroke)).toBe('rgb(141, 181, 135)');
  } finally {
    writeJson('settings.json', saved);
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('a 20-box diagram fits a phone', async ({ page }) => {
    const p = await importProject('diagram-phone', 'Diagram phone', { architecture: [{ key: 'big', title: 'Everything', summary: 'Twenty boxes.', data: twentyBoxes() }] });
    await page.goto(`${p.url}/t/architecture`);
    await expect(page.getByTestId('diagram-node')).toHaveCount(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    expect(await noSideScroll(page)).toEqual([]);
    await box(page, 'box-0').click();
    await expect(page.getByTestId('node-panel')).toBeVisible();
    await expect(page.getByTestId('node-panel').getByRole('heading')).toHaveText('Box 0');
    expect(await noSideScroll(page)).toEqual([]);
  });
});
