import { expect, test } from '@playwright/test';
import { api, asClaude, importProject, type TestItem } from './claude';
import { noSideScroll } from './env';

const NO_WINDOW = 'No Claude window is listening. Run /dev-plumbing in any clone.';
const channels: TestItem = { key: 'channels', title: 'Which channels?', summary: 'SMS, email or both.', fields: { blocking: 'true' }, message: { text: 'SMS, email or both?' } };
const lead: TestItem = { key: 'lead', title: 'How many days before?', summary: 'When the reminder goes out.', fields: { default: '3 days' }, message: { text: 'How many days before the due date?' } };
const twice: TestItem = { key: 'twice', title: 'The job might run twice', summary: 'A second run would send every reminder again.', fields: { severity: 'low' } };

test('the checklist says what blocks Finalize, what uses its default and what nobody reviewed', async ({ page }) => {
  const p = await importProject('fin-checklist', 'Finalize checklist', { questions: [channels, lead], concerns: [twice] });
  await page.goto(p.url);
  const header = page.getByRole('button', { name: 'Finalize spec', exact: true });
  await expect(header).toBeDisabled();
  await expect(header).toHaveAttribute('title', '1 item blocks Finalize');

  await page.goto(`${p.url}/finalize`);
  await expect(page.getByRole('heading', { name: 'Finalize spec', exact: true })).toBeVisible();
  const blocking = page.getByTestId('checklist-blocking');
  await expect(blocking.getByRole('heading')).toHaveText('These block Finalize');
  await expect(blocking).toContainText('Which channels?');
  await expect(blocking).toContainText('Blocking question, not resolved.');
  const defaults = page.getByTestId('checklist-defaults');
  await expect(defaults.getByRole('heading')).toHaveText('These will use their default');
  await expect(defaults).toContainText('How many days before?');
  await expect(defaults).toContainText('Default: 3 days');
  const unreviewed = page.getByTestId('checklist-unreviewed');
  await expect(unreviewed.getByRole('heading')).toHaveText('Nobody has reviewed these');
  await expect(unreviewed).toContainText('The job might run twice');
  await expect(page.getByTestId('checklist-parked')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start finalize' })).toBeDisabled();

  await blocking.getByRole('link', { name: /Which channels\?/ }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/th/t-questions-channels$`));
});

test('once nothing blocks it, Finalize waits for a Claude window, then says Claude is writing', async ({ page }) => {
  const p = await importProject('fin-start', 'Finalize start', { questions: [channels, lead] });
  const P = `/api/projects/${p.repo}/${p.project}`;
  await page.goto(`${p.url}/finalize`);
  const start = page.getByRole('button', { name: 'Start finalize' });
  await expect(start).toBeDisabled();
  // Parking the blocking question leaves it out of the final, so it no longer blocks.
  await api(`${P}/threads/t-questions-channels/park`, 'POST', { parked: true });
  await expect(page.getByTestId('checklist-blocking')).toHaveCount(0);
  await expect(page.getByText('Nothing blocks Finalize.')).toBeVisible();
  const parked = page.getByTestId('checklist-parked');
  await expect(parked.getByRole('heading')).toHaveText('Parked: left out of the final');
  await expect(parked).toContainText('Which channels?');
  // The header's Finalize spec is now a link to this page.
  await expect(page.getByRole('link', { name: 'Finalize spec', exact: true })).toHaveAttribute('href', `${p.url}/finalize`);

  await start.click();
  const status = page.getByTestId('finalize-status');
  await expect(status).toHaveText(NO_WINDOW);
  await expect(start).toHaveCount(0);

  const wait = await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-fin-start', timeoutSeconds: 0 });
  expect(wait.kind).toBe('finalize');
  await expect(status).toHaveText('Claude is writing the final.');

  // The finalizer came back without sending a final.
  const { request } = await api(`${P}/finalize`);
  await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-fin-start', timeoutSeconds: 0, finished: { finalize: request.id } });
  await expect(status).toHaveText("The finalizer didn't send a final.");
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  // The window polled moments ago, so whether it still counts as listening depends on timing.
  await expect(status).toHaveText(/^(Waiting for Claude to write the final\.|No Claude window is listening\. Run \/dev-plumbing in any clone\.)$/);
  expect((await api(`${P}/finalize`)).request.state).toBe('requested');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('Finalize spec sits under the title, says what blocks it, and the page fits', async ({ page }) => {
    const p = await importProject('fin-phone-start', 'Finalize phone start', { questions: [channels, lead] });
    await page.goto(p.url);
    await expect(page.getByRole('button', { name: 'Finalize spec', exact: true })).toBeDisabled();
    await expect(page.getByText('1 item blocks Finalize')).toBeVisible();
    await api(`/api/projects/${p.repo}/${p.project}/threads/t-questions-channels/park`, 'POST', { parked: true });
    await page.getByRole('link', { name: 'Finalize spec', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${p.url}/finalize$`));
    await expect(page.getByTestId('checklist-parked')).toContainText('Which channels?');
    await expect(page.getByRole('button', { name: 'Start finalize' })).toBeEnabled();
    // Start finalize is this page's main action, so Submit all's bar isn't pinned here.
    await expect(page.getByRole('button', { name: /^Submit all/ })).toHaveCount(0);
    expect(await noSideScroll(page)).toEqual([]);
  });
});
