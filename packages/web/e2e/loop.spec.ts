import { expect, test } from '@playwright/test';
import { api, asClaude, importProject } from './claude';
import { noSideScroll } from './env';

const perSend = { id: 'per-send', label: 'One row per send', detail: 'Full history for support.', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per send.' }] } };
const perSub = { id: 'per-sub', label: 'One row per subscription', detail: 'Simpler, no history.' };
const rows = { key: 'rows', title: 'Rows per send?', summary: 'How often a reminder row is written.', message: { text: 'Which do you want?', options: [perSend, perSub], recommended: 'per-send' } };
const channels = { key: 'channels', title: 'Which channels?', summary: 'SMS, email or both.', message: { text: 'SMS, email or both?' } };

test('answers with an option and a note, and Claude replies in the thread', async ({ page }) => {
  const p = await importProject('loop-note', 'Loop with a note', { questions: [rows] });
  await page.goto(`${p.url}/th/t-questions-rows`);
  await expect(page.getByRole('heading', { name: 'Rows per send?' })).toBeVisible();
  await expect(page.getByText('raised when the plan was imported')).toBeVisible();
  await page.getByRole('radio', { name: /One row per send/ }).check();
  await expect(page.getByText('Recommended', { exact: true })).toBeVisible();
  const preview = page.getByRole('region', { name: 'What changes if you accept' });
  await expect(preview.getByTestId('diff')).toContainText('+ Log one row per send.');
  await page.getByRole('textbox', { name: 'Note for One row per send' }).fill('Delete rows after 180 days.');
  await expect(page.getByText('Draft saved · goes with Submit all')).toBeVisible();
  await page.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByTestId('send-notice')).toHaveText('Saved. No Claude window is listening. Run /dev-plumbing in any clone.');
  await expect(page.getByText('With Claude. A subagent is working on this thread.')).toBeVisible();

  const wait = await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-loop', timeoutSeconds: 0 });
  expect(wait.groups[0].threads).toEqual(['t-questions-rows']);
  await asClaude('/reply', {
    repo: p.repo,
    project: p.project,
    threadId: 't-questions-rows',
    text: 'Kept for 180 days, then deleted by the daily job.',
    filesRead: ['docs/specs/loop-note.md'],
    resolve: { decision: 'One row per send, deleted after 180 days' },
  });
  await expect(page.getByText('Kept for 180 days, then deleted by the daily job.')).toBeVisible();
  await expect(page.getByText('Read 1 file')).toBeVisible();
  await expect(page.getByTestId('thread-status')).toHaveText('Resolved');
  expect((await api(`/api/projects/${p.repo}/${p.project}/docs/draft`)).text).toContain('Log one row per send.');
});

test('a plain accept applies straight away and resolves the thread', async ({ page }) => {
  const p = await importProject('loop-accept', 'Loop accept', { questions: [rows] });
  await page.goto(`${p.url}/th/t-questions-rows`);
  await page.getByRole('radio', { name: /One row per send/ }).check();
  await page.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByTestId('send-notice')).toHaveText('Applied. 1 thread resolved.');
  await expect(page.getByTestId('thread-status')).toHaveText('Resolved');
  await expect(page.getByText('Applied and resolved.')).toBeVisible();
  await expect(page.getByText('You chose: One row per send')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Park' })).toBeHidden();
});

test("a note on another option isn't saved", async ({ page }) => {
  const p = await importProject('loop-hidden', 'Loop hidden note', { questions: [rows] });
  await page.goto(`${p.url}/th/t-questions-rows`);
  await page.getByRole('radio', { name: /One row per send/ }).check();
  await page.getByRole('textbox', { name: 'Note for One row per send' }).fill('Delete rows after 180 days.');
  await page.getByRole('radio', { name: 'Custom answer' }).check();
  await page.getByRole('textbox', { name: 'Custom answer' }).fill('Ask support first.');
  await expect(page.getByText('Draft saved · goes with Submit all')).toBeVisible();
  await expect
    .poll(async () => (await api(`/api/projects/${p.repo}/${p.project}/threads/t-questions-rows`)).thread.draft?.text)
    .toBe('Ask support first.');
  const draft = (await api(`/api/projects/${p.repo}/${p.project}/threads/t-questions-rows`)).thread.draft;
  expect(draft.optionId).toBe('custom');
  expect(draft.note ?? '').toBe('');
  // Switching back shows the typed note again.
  await page.getByRole('radio', { name: /One row per send/ }).check();
  await expect(page.getByRole('textbox', { name: 'Note for One row per send' })).toHaveValue('Delete rows after 180 days.');
});

test('a failed Send keeps autosave working', async ({ page }) => {
  const p = await importProject('loop-failsend', 'Loop failed send', { questions: [rows] });
  await page.goto(`${p.url}/th/t-questions-rows`);
  await page.route('**/submit', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }));
  await page.getByRole('radio', { name: /One row per send/ }).check();
  await page.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByRole('alert')).toContainText('boom');
  await page.unroute('**/submit');
  await page.getByRole('textbox', { name: 'Note for One row per send' }).fill('Still saved.');
  await expect(page.getByText('Draft saved · goes with Submit all')).toBeVisible();
  await expect
    .poll(async () => (await api(`/api/projects/${p.repo}/${p.project}/threads/t-questions-rows`)).thread.draft?.note)
    .toBe('Still saved.');
});

test('only one primary button on the desktop thread view', async ({ page }) => {
  const p = await importProject('loop-primary', 'Loop primary', { questions: [rows] });
  await page.goto(`${p.url}/th/t-questions-rows`);
  await expect(page.getByRole('button', { name: 'Send this thread' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Submit all/ }).first()).not.toHaveClass(/bg-button/);
  await expect(page.getByRole('button', { name: 'Send this thread' })).toHaveClass(/bg-button/);
});

test('Custom answer, Park, and a thread with no options', async ({ page }) => {
  const p = await importProject('loop-custom', 'Loop custom', { questions: [rows, channels] });
  await page.goto(`${p.url}/th/t-questions-rows`);
  await page.getByRole('radio', { name: 'Custom answer' }).check();
  await page.getByRole('textbox', { name: 'Custom answer' }).fill('Ask support what they need first.');
  await page.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByTestId('thread-status')).toHaveText('With Claude');

  await page.goto(`${p.url}/th/t-questions-channels`);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Your answer' }).fill('Both.');
  await page.getByRole('button', { name: 'Park' }).click();
  await expect(page.getByTestId('thread-status')).toHaveText('Parked');
  await page.getByRole('button', { name: 'Unpark' }).click();
  await expect(page.getByTestId('thread-status')).toHaveText('Draft, not sent');
});

test('inbox rows open the thread view', async ({ page }) => {
  const p = await importProject('loop-inbox', 'Loop inbox', { questions: [channels] });
  await page.goto(p.url);
  await page.getByTestId('inbox-row').filter({ hasText: 'Which channels?' }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/th/t-questions-channels$`));
  await expect(page.getByTestId('thread-view')).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('one column, with Send this thread pinned at the bottom', async ({ page }) => {
    const p = await importProject('loop-phone', 'Loop phone', { questions: [rows] });
    await page.goto(`${p.url}/th/t-questions-rows`);
    await page.getByRole('radio', { name: /One row per subscription/ }).check();
    const send = page.getByRole('button', { name: 'Send this thread' });
    const box = await send.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(812 - 60);
    await expect(page.getByRole('button', { name: /Submit all/ })).toBeHidden();
    expect(await noSideScroll(page)).toEqual([]);
  });
});
