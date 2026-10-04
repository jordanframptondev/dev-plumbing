import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { api, asClaude, fixtureRepo, importProject, PLAN_TEXT, type TestItem } from './claude';
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

const STALE = 'The draft changed since Claude wrote this. Finalize again.';
const system: TestItem = {
  key: 'system',
  title: 'Restock system',
  summary: 'The parts that send reminders.',
  data: {
    kind: 'system',
    groups: [{ id: 'jobs', label: 'packages/jobs' }],
    nodes: [
      { id: 'worker', label: 'Reminder worker', group: 'jobs', status: 'new' },
      { id: 'sms', label: 'SMS provider', status: 'external' },
    ],
    edges: [{ id: 'worker-sms', from: 'worker', to: 'sms', label: 'send' }],
  },
};
const card: TestItem = {
  key: 'settings',
  title: 'Restock settings card',
  summary: 'A card on the reminders page.',
  data: {
    location: { app: 'web', route: '/reminders', files: ['apps/web/app/reminders/page.tsx'] },
    kit: 'web',
    after: '<main class="p-6"><div class="rounded-card bg-brand p-4">Restock soon</div></main>',
  },
};

/** A project whose finalize request a Claude window picked up and answered with this document. */
async function withProposal(name: string, title: string, items: Record<string, TestItem[]>, markdown: string) {
  const p = await importProject(name, title, items);
  const P = `/api/projects/${p.repo}/${p.project}`;
  await api(`${P}/finalize`, 'POST', {});
  const wait = await asClaude('/wait', { repo: p.repo, project: p.project, windowId: `w-e2e-${name}`, timeoutSeconds: 0 });
  expect(wait.kind).toBe('finalize');
  const { request } = await api(`${P}/finalize`);
  await asClaude('/finalize', { repo: p.repo, project: p.project, request: request.id, markdown });
  return { ...p, P };
}

test("Claude's final is previewed, then accepted into the repo with its mockups", async ({ page }) => {
  const markdown = [
    '# Finalize accept',
    '',
    '## 1. Title and summary',
    '',
    'Remind customers before an item runs out.',
    '',
    '## 4. Architecture',
    '',
    '{{diagram:architecture-system}}',
    '',
    '## 6. UI changes',
    '',
    'The reminders page gets a restock card. {{mockup:ui-settings:after}}',
    '',
  ].join('\n');
  const p = await withProposal('fin-accept', 'Finalize accept', { architecture: [system], ui: [card] }, markdown);
  await page.goto(`${p.url}/finalize`);
  const preview = page.getByTestId('proposal-preview');
  const mermaid = preview.getByTestId('mermaid-block');
  await expect(mermaid).toHaveCount(1);
  await expect(mermaid.locator('figcaption')).toHaveText('Mermaid');
  await expect(mermaid.locator('code')).toContainText('flowchart LR');
  await expect(mermaid.locator('code')).toContainText('Reminder worker');
  // The mockup files are written only into the repo copy, so the app shows the link as text.
  await expect(preview.getByTitle('Opens from the repo copy.')).toHaveText('After mockup');
  // There's no earlier final to compare with.
  await expect(page.getByRole('tab', { name: 'Changes since the last final' })).toHaveCount(0);

  const form = page.getByTestId('accept-form');
  await expect(form.getByLabel('Copy into')).toHaveValue(fixtureRepo());
  await expect(form.getByLabel('Copy into').locator('option')).toHaveText([`${fixtureRepo()} (source)`]);
  await expect(form.getByTestId('accept-target')).toHaveText(`${fixtureRepo()}/docs/specs/fin-accept.final.md`);
  await form.getByRole('button', { name: 'Accept' }).click();

  const done = page.getByTestId('final-done');
  await expect(done).toContainText('Finalized');
  await expect(done).toContainText(`Copied to ${fixtureRepo()}/docs/specs/fin-accept.final.md`);
  await expect(page.getByTestId('next-command')).toHaveText('writing-plans docs/specs/fin-accept.final.md');
  await expect(page.getByTestId('proposal-preview')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Finalize again', exact: true })).toBeVisible();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await done.getByRole('button', { name: 'Copy' }).click();
  await expect(done.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('writing-plans docs/specs/fin-accept.final.md');

  // The copy in the repo has the service's Mermaid and the mockup next to it. The plan itself is untouched.
  const copied = fs.readFileSync(path.join(fixtureRepo(), 'docs/specs/fin-accept.final.md'), 'utf8');
  expect(copied).toMatch(/```mermaid\nflowchart LR/);
  expect(copied).toContain('fin-accept.assets/ui-settings.after.html');
  expect(copied).not.toContain('{{');
  expect(fs.readFileSync(path.join(fixtureRepo(), 'docs/specs/fin-accept.assets/ui-settings.after.html'), 'utf8')).toContain('Restock soon');
  expect(fs.readFileSync(path.join(fixtureRepo(), 'docs/specs/fin-accept.md'), 'utf8')).toBe(PLAN_TEXT('Finalize accept'));

  await page.getByRole('complementary', { name: 'Project navigation' }).getByRole('link', { name: 'Final', exact: true }).click();
  await expect(page.getByTestId('final-exported')).toContainText(`Copied to ${fixtureRepo()}/docs/specs/fin-accept.final.md`);
  await expect(page.getByTestId('document')).toContainText('Remind customers before an item runs out.');

  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search plumbing projects' }).fill('Finalize accept');
  await page.getByRole('tab', { name: 'Finalized' }).click();
  await expect(page.getByTestId('project-row')).toHaveCount(1);
  await expect(page.getByTestId('project-row')).toContainText('Finalized');
});

test("a proposal for an older draft can't be accepted", async ({ page }) => {
  const p = await withProposal('fin-stale', 'Finalize stale', { questions: [lead] }, '# Finalize stale\n\n## 1. Title and summary\n\nRemind customers before an item runs out.\n');
  await page.goto(`${p.url}/finalize`);
  const accept = page.getByTestId('accept-form').getByRole('button', { name: 'Accept' });
  await expect(accept).toBeEnabled();

  // After Claude wrote the final, an answer in another thread brings a small edit to the draft. (A change to an item's
  // drawing data alone would make it stale too: staleness covers the draft, the items and the decisions.)
  await api(`${p.P}/threads/t-questions-lead/draft`, 'PUT', { text: '3 days is fine.' });
  await api(`${p.P}/submit`, 'POST', { scope: 'thread', threadId: 't-questions-lead' });
  await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-fin-stale-reply', timeoutSeconds: 0 });
  await asClaude('/reply', {
    repo: p.repo,
    project: p.project,
    threadId: 't-questions-lead',
    text: '3 days it is.',
    smallEdits: [{ summary: 'Say when reminders go', change: { md: [{ find: 'Remind customers before an item runs out.', replace: 'Remind customers 3 days before an item runs out.' }] } }],
    resolve: { decision: 'Reminders go 3 days before' },
  });

  await expect(page.getByText(STALE)).toBeVisible();
  await expect(accept).toBeDisabled();
  await expect(api(`${p.P}/finalize/accept`, 'POST', { clone: fixtureRepo() })).rejects.toThrow(STALE);
  expect(fs.existsSync(path.join(fixtureRepo(), 'docs/specs/fin-stale.final.md'))).toBe(false);

  // Finalize again asks for a new final, from the new draft. The window that answered still counts as listening.
  await page.getByRole('button', { name: 'Finalize again' }).click();
  await expect(page.getByTestId('finalize-status')).toHaveText('Waiting for Claude to write the final.');
  await expect(page.getByTestId('proposal-preview')).toHaveCount(0);
});

test('Discard throws the proposal away', async ({ page }) => {
  const p = await withProposal('fin-discard', 'Finalize discard', {}, '# Finalize discard\n\nNothing else to say.\n');
  await page.goto(`${p.url}/finalize`);
  await expect(page.getByTestId('proposal-preview')).toContainText('Nothing else to say.');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByTestId('proposal-preview')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start finalize' })).toBeEnabled();
  expect((await api(`${p.P}/finalize`)).request).toBeNull();
});

test('finalizing again shows what changed since the last final', async ({ page }) => {
  const p = await withProposal('fin-twice', 'Finalize twice', {}, '# Finalize twice\n\nSend by SMS.\n');
  await api(`${p.P}/finalize/accept`, 'POST', { clone: fixtureRepo() });
  await api(`${p.P}/finalize`, 'POST', {});
  expect((await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-fin-twice-again', timeoutSeconds: 0 })).kind).toBe('finalize');
  const { request } = await api(`${p.P}/finalize`);
  await asClaude('/finalize', { repo: p.repo, project: p.project, request: request.id, markdown: '# Finalize twice\n\nSend by SMS and email.\n' });

  await page.goto(`${p.url}/finalize`);
  await page.getByRole('tab', { name: 'Changes since the last final' }).click();
  const diff = page.getByTestId('proposal-diff');
  await expect(diff).toContainText('+ Send by SMS and email.');
  await expect(diff).toContainText('− Send by SMS.');
  await page.getByRole('tab', { name: 'Preview' }).click();
  await expect(page.getByTestId('proposal-preview')).toContainText('Send by SMS and email.');
});

test.describe('a proposal on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('the preview and the accept form fit the width', async ({ page }) => {
    const p = await withProposal('fin-phone-proposal', 'Finalize phone proposal', { architecture: [system] }, '# Finalize phone proposal\n\n## 4. Architecture\n\n{{diagram:architecture-system}}\n');
    await page.goto(`${p.url}/finalize`);
    await expect(page.getByTestId('proposal-preview').getByTestId('mermaid-block')).toBeVisible();
    await expect(page.getByTestId('accept-form').getByRole('button', { name: 'Accept' })).toBeVisible();
    expect(await noSideScroll(page)).toEqual([]);
  });
});
