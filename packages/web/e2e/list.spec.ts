import { expect, test } from '@playwright/test';
import { importProject, type TestItem } from './claude';

const questions: TestItem[] = [
  {
    key: 'who',
    title: 'Who gets reminders?',
    summary: 'Changes the daily job.',
    fields: { blocking: 'true' },
    message: { text: 'Start with active subscribers?', options: [{ id: 'all', label: 'Everyone' }, { id: 'active', label: 'Active subscribers only' }], recommended: 'active' },
  },
  {
    key: 'days',
    title: 'How many days before?',
    summary: 'Lead time.',
    fields: { blocking: 'false', default: '5 days' },
    message: { text: 'How early?', options: [{ id: 'd3', label: '3 days' }, { id: 'd5', label: '5 days' }, { id: 'd7', label: '7 days' }] },
  },
  {
    key: 'retention',
    title: 'How long to keep rows?',
    summary: 'Retention.',
    message: { text: 'Keep 180 days?', options: [{ id: 'keep', label: 'Keep 180 days', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in a table for 180 days.' }] } }] },
  },
];
const rowFor = (page: import('@playwright/test').Page, title: string) => page.getByTestId('list-row').filter({ hasText: title });

test('answers questions inline without leaving the list', async ({ page }) => {
  const p = await importProject('list-inline', 'List inline', { questions });
  await page.goto(`${p.url}/t/questions`);
  await expect(page.getByRole('tab', { name: 'Needs you · 3' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('3 · 1 blocking open')).toBeVisible();
  const who = rowFor(page, 'Who gets reminders?');
  await expect(who.getByText('BLOCKING')).toBeVisible();
  await who.getByRole('radio', { name: /Active subscribers only/ }).check();
  await expect(who.getByText('Draft saved · goes with Submit all')).toBeVisible();
  const days = rowFor(page, 'How many days before?');
  await expect(days.getByText('Default', { exact: true })).toBeVisible();
  await expect(days.getByText("If you don't answer, the plan uses 5 days.")).toBeVisible();
  await days.getByRole('radio', { name: /7 days/ }).check();
  await expect(days.getByText('Draft saved · goes with Submit all')).toBeVisible();
  await page.getByRole('button', { name: 'Submit all · 2 drafts' }).first().click();
  await expect(page.getByTestId('submit-notice')).toContainText('No Claude window is listening');
  await page.getByRole('tab', { name: 'With Claude · 2' }).click();
  await expect(page.getByTestId('list-row')).toHaveCount(2);
});

test('a plain accept from the list folds the row with its decision', async ({ page }) => {
  const p = await importProject('list-accept', 'List accept', { questions });
  await page.goto(`${p.url}/t/questions`);
  const row = rowFor(page, 'How long to keep rows?');
  await row.getByRole('radio', { name: /Keep 180 days/ }).check();
  await row.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByTestId('send-notice')).toHaveText('Applied. 1 thread resolved.');
  await expect(page.getByRole('tab', { name: 'Resolved · 1' })).toBeVisible();
  await page.getByRole('tab', { name: 'Resolved · 1' }).click();
  await expect(rowFor(page, 'How long to keep rows?')).toContainText('→ How long to keep rows?: Keep 180 days');
});

test('concerns show severity and offer the presets', async ({ page }) => {
  const p = await importProject('list-concerns', 'List concerns', {
    concerns: [{ key: 'twice', title: 'Job runs twice', summary: 'Duplicate sends.', fields: { severity: 'high', likelihood: 'unlikely' }, message: { text: 'A second run could send twice. Fix: one reminder per customer per day.' } }],
  });
  await page.goto(`${p.url}/t/concerns`);
  const row = rowFor(page, 'Job runs twice');
  await expect(row.getByText('High · unlikely')).toBeVisible();
  for (const name of ["Accept Claude's fix", 'Accept the risk', 'Custom answer']) await expect(row.getByRole('radio', { name })).toBeVisible();
});

test('+ Question starts a thread with your message and sends it', async ({ page }) => {
  const p = await importProject('list-add', 'List add', { questions: [questions[0]!] });
  await page.goto(`${p.url}/t/questions`);
  await page.getByRole('button', { name: '+ Question' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Opt-out link in every email?');
  await page.getByRole('textbox', { name: 'Your message' }).fill('Legal will ask for one. Can we add it?');
  await page.getByRole('button', { name: 'Add and send' }).click();
  await expect(page).toHaveURL(/\/th\/t-questions-opt-out-link-in-every-email$/);
  await expect(page.getByText('Legal will ask for one. Can we add it?')).toBeVisible();
  await expect(page.getByTestId('thread-status')).toHaveText('With Claude');
});

test('Needs you counts only rows waiting on you; idle rows live under All', async ({ page }) => {
  const p = await importProject('list-idle', 'List idle', {
    questions: [questions[2]!, { key: 'info', title: 'Background note', summary: 'Just information.' }],
  });
  await page.goto(`${p.url}/t/questions`);
  await expect(page.getByRole('tab', { name: 'Needs you · 1' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('list-row')).toHaveCount(1);
  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByTestId('list-row')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Needs you · 1' }).click();
  const row = rowFor(page, 'How long to keep rows?');
  await row.getByRole('radio', { name: /Keep 180 days/ }).check();
  await row.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByTestId('send-notice')).toBeVisible();
  await expect(page.getByText('Nothing needs you right now.')).toBeVisible();
  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByTestId('send-notice')).toHaveCount(0);
});
