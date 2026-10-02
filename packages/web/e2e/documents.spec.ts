import { expect, test } from '@playwright/test';
import { api, asClaude, importProject } from './claude';

const channels = { key: 'channels', title: 'Which channels?', summary: 'SMS or email.', message: { text: 'SMS, email or both?' } };

test('the Draft shows what changed and which thread changed it, with Undo for small edits', async ({ page }) => {
  const p = await importProject('docs-changes', 'Docs changes', { questions: [channels] });
  const P = `/api/projects/${p.repo}/${p.project}`;
  await api(`${P}/threads/t-questions-channels/draft`, 'PUT', { text: 'Both.' });
  await api(`${P}/submit`, 'POST', { scope: 'all' });
  await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-docs', timeoutSeconds: 0 });
  await asClaude('/reply', {
    repo: p.repo,
    project: p.project,
    threadId: 't-questions-channels',
    text: 'Both, and I tidied the wording.',
    smallEdits: [{ summary: 'Clearer channels wording', change: { md: [{ find: 'Send by SMS.', replace: 'Send by SMS and email.' }] } }],
    resolve: { decision: 'Reminders go by SMS and email' },
  });

  await page.goto(`${p.url}/d/draft`);
  await expect(page.getByTestId('document')).toContainText('Send by SMS and email.');
  await page.getByRole('tab', { name: 'Changes' }).click();
  const changes = page.getByTestId('changes');
  await expect(changes.getByTestId('diff')).toContainText('+ Send by SMS and email.');
  await expect(changes.getByTestId('diff')).toContainText('− Send by SMS.');
  await expect(changes).toContainText('changed by: Which channels?');

  // The switch resets when you leave the Draft and come back (in-app, via the project navigation).
  const nav = page.getByRole('complementary', { name: 'Project navigation' });
  await nav.getByRole('link', { name: 'Original', exact: true }).click();
  await expect(page.getByTestId('document')).toContainText('Send by SMS.');
  await nav.getByRole('link', { name: 'Draft', exact: true }).click();
  await expect(page.getByTestId('document')).toBeVisible();
  await page.getByRole('tab', { name: 'Changes' }).click();

  await changes.getByRole('button', { name: 'Undo' }).click();
  await expect(changes).toContainText('Undone');
  await expect(changes).toContainText('The draft is the same as the original so far.');
});

test('an accepted option is listed as accepted, without Undo', async ({ page }) => {
  const keep = { id: 'keep', label: 'Keep 180 days', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in a table for 180 days.' }] } };
  const p = await importProject('docs-accept', 'Docs accept', { questions: [{ key: 'keep', title: 'How long to keep rows?', summary: 'Retention.', message: { text: 'Keep 180 days?', options: [keep] } }] });
  const P = `/api/projects/${p.repo}/${p.project}`;
  await api(`${P}/threads/t-questions-keep/draft`, 'PUT', { optionId: 'keep' });
  await api(`${P}/submit`, 'POST', { scope: 'thread', threadId: 't-questions-keep' });
  await page.goto(`${p.url}/d/draft`);
  await page.getByRole('tab', { name: 'Changes' }).click();
  const changes = page.getByTestId('changes');
  await expect(changes).toContainText('Accepted');
  await expect(changes).toContainText('How long to keep rows?: Keep 180 days');
  await expect(changes.getByRole('button', { name: 'Undo' })).toHaveCount(0);
});
