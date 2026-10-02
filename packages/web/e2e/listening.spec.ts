import { expect, test } from '@playwright/test';
import { api, asClaude, importProject } from './claude';

const question = { key: 'channels', title: 'Which channels?', summary: 'SMS, email or both.', message: { text: 'SMS, email or both?' } };

test('shows Claude listening once a window is waiting', async ({ page }) => {
  const p = await importProject('listening', 'Listening check', { questions: [question] });
  await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-listen', timeoutSeconds: 0 });
  await page.goto(p.url);
  await expect(page.getByTestId('claude-listening')).toHaveText('Claude listening');
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search plumbing projects' }).fill('Listening check');
  await expect(page.getByTestId('project-row').getByTestId('claude-listening')).toBeVisible();
});

test('Submit all says when no Claude window is listening', async ({ page }) => {
  const p = await importProject('quiet', 'Quiet project', { questions: [question] });
  await api(`/api/projects/${p.repo}/${p.project}/threads/t-questions-channels/draft`, 'PUT', { text: 'Both.' });
  await page.goto(p.url);
  await page.getByRole('button', { name: 'Submit all · 1 draft' }).first().click();
  await expect(page.getByTestId('submit-notice')).toHaveText('Saved. No Claude window is listening. Run /dev-plumbing in any clone.');
  await expect(page.getByRole('button', { name: 'Submit all · 0 drafts' }).first()).toBeDisabled();
});

test("Claude's reply appears without reloading", async ({ page }) => {
  const p = await importProject('live', 'Live updates', { questions: [question] });
  await api(`/api/projects/${p.repo}/${p.project}/threads/t-questions-channels/draft`, 'PUT', { text: 'Both.' });
  await api(`/api/projects/${p.repo}/${p.project}/submit`, 'POST', { scope: 'all' });
  await page.goto(p.url);
  await expect(page.getByText('With Claude · 1')).toBeVisible();
  const wait = await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-live', timeoutSeconds: 0 });
  await asClaude('/reply', { repo: p.repo, project: p.project, threadId: wait.groups[0].threads[0], text: 'Both it is. Want SMS first?' });
  await expect(page.getByText('Your turn · 1')).toBeVisible();
  await expect(page.getByText('Claude: Both it is. Want SMS first?')).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('Submit all says what happened right by the button', async ({ page }) => {
    const p = await importProject('quiet-phone', 'Quiet phone', { questions: [question] });
    await api(`/api/projects/${p.repo}/${p.project}/threads/t-questions-channels/draft`, 'PUT', { text: 'Both.' });
    await page.goto(p.url);
    await page.getByRole('button', { name: 'Submit all · 1 draft' }).click();
    await expect(page.getByTestId('submit-notice-phone')).toHaveText('Saved. No Claude window is listening. Run /dev-plumbing in any clone.');
    await expect(page.getByTestId('submit-notice-phone')).toBeInViewport();
  });
});
