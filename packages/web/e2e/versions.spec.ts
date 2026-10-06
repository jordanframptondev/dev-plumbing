import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { api, asClaude, fixtureRepo, importProject, PLAN_TEXT, type TestItem } from './claude';
import { noSideScroll } from './env';

const keep = { id: 'keep', label: 'Keep 180 days', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in a table for 180 days.' }] } };
const retention: TestItem = { key: 'keep', title: 'How long to keep rows?', summary: 'Retention.', message: { text: 'Keep 180 days?', options: [keep] } };

/**
 * A project at v2. Your draft moved on first (accepting an option changed Data), then the plan changed in the repo
 * (Channels gains email). Claude brought the change in, and every importer came back with nothing new.
 */
async function updated(name: string, title: string) {
  const p = await importProject(name, title, { questions: [retention] });
  const P = `/api/projects/${p.repo}/${p.project}`;
  await api(`${P}/threads/t-questions-keep/draft`, 'PUT', { optionId: 'keep' });
  await api(`${P}/submit`, 'POST', { scope: 'thread', threadId: 't-questions-keep' });
  const rel = `docs/specs/${name}.md`;
  fs.writeFileSync(path.join(fixtureRepo(), rel), PLAN_TEXT(title).replace('Send by SMS.', 'Send by SMS and email.'));
  expect(await asClaude('/open', { cwd: fixtureRepo(), plan: rel })).toMatchObject({ kind: 'plan-changed', version: 1, nextVersion: 2, added: 1, removed: 1 });
  const open = await asClaude('/open', { cwd: fixtureRepo(), plan: rel, update: true });
  expect(open).toMatchObject({ kind: 'updated', version: 2, merged: { clean: 1, conflicts: 0 } });
  for (const t of open.importTypes as { id: string }[]) {
    await asClaude('/items', { repo: p.repo, project: p.project, type: t.id, cwd: fixtureRepo(), noChanges: 'Nothing changed for this type.' });
  }
  return p;
}

test('after an update, Documents says which version you are on, and Versions lists each one, the current first', async ({ page }) => {
  const p = await updated('ver-list', 'Versions list');
  await page.goto(p.url);
  const nav = page.getByRole('complementary', { name: 'Project navigation' });
  await expect(nav.getByRole('link', { name: 'Original (v2)', exact: true })).toBeVisible();
  // No conflicts, so no Plan changes.
  await expect(nav.getByTestId('nav-type-plan-changes')).toHaveCount(0);
  await nav.getByRole('link', { name: 'Draft (v2)', exact: true }).click();
  // Both sides' changes are in the draft.
  await expect(page.getByTestId('document')).toContainText('Log reminders in a table for 180 days.');
  await expect(page.getByTestId('document')).toContainText('Send by SMS and email.');

  await nav.getByRole('link', { name: 'Versions', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/versions$`));
  await expect(page.getByRole('heading', { name: 'Versions', exact: true })).toBeVisible();
  const rows = page.getByTestId('versions-list').getByTestId('version-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('v2');
  await expect(rows.nth(0)).toContainText('Current');
  await expect(rows.nth(0)).toContainText('main · 1 change merged · 0 conflicts');
  await expect(rows.nth(1)).toContainText('v1');
  await expect(rows.nth(1)).toContainText('main · Imported');
  await expect(rows.nth(1)).not.toContainText('Current');
});

test("an older version shows its own plan and draft, and compares with the current one", async ({ page }) => {
  const p = await updated('ver-compare', 'Versions compare');
  await page.goto(`${p.url}/versions`);
  await page.getByTestId('version-row').nth(1).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/versions/1$`));
  await expect(page.getByRole('heading', { name: 'v1', exact: true })).toBeVisible();
  const doc = page.getByTestId('version-doc');
  // v1's plan is the plan as imported.
  await expect(doc).toContainText('Send by SMS.');
  await expect(doc).toContainText('Log reminders in a table.');
  await expect(doc).not.toContainText('180 days');
  // v1's draft has the answer you accepted, and not the repo's later change.
  await page.getByRole('tab', { name: 'Draft', exact: true }).click();
  await expect(doc).toContainText('Log reminders in a table for 180 days.');
  await expect(doc).not.toContainText('Send by SMS and email.');

  await expect(page.getByLabel('Compare with')).toHaveValue('2');
  await expect(page.getByText('Changes to the plan from v1 to v2')).toBeVisible();
  const compare = page.getByTestId('version-compare');
  await expect(compare).toContainText('+ Send by SMS and email.');
  await expect(compare).toContainText('− Send by SMS.');

  // v1 is the import: no update changed its draft.
  await expect(page.getByTestId('version-update-diff')).toHaveCount(0);

  // The current version compares with the one before it, and shows what its update did to your draft.
  await page.getByRole('link', { name: '‹ Versions' }).click();
  await page.getByTestId('version-row').nth(0).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/versions/2$`));
  await expect(page.getByTestId('version-doc')).toContainText('Send by SMS and email.');
  await expect(page.getByLabel('Compare with')).toHaveValue('1');
  await expect(page.getByTestId('version-compare')).toContainText('+ Send by SMS and email.');
  const draftDiff = page.getByTestId('version-update-diff');
  await expect(draftDiff).toContainText('+ Send by SMS and email.');
  await expect(draftDiff).toContainText('− Send by SMS.');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('Versions is in the Plumbing list, and the list and a version fit the width', async ({ page }) => {
    const p = await updated('ver-phone', 'Versions phone');
    await page.goto(p.url);
    await page.getByRole('tab', { name: 'Plumbing' }).click();
    await page.getByRole('link', { name: 'Versions', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${p.url}/versions$`));
    await expect(page.getByTestId('version-row')).toHaveCount(2);
    expect(await noSideScroll(page)).toEqual([]);
    await page.getByTestId('version-row').nth(1).click();
    await expect(page.getByTestId('version-compare')).toContainText('+ Send by SMS and email.');
    expect(await noSideScroll(page)).toEqual([]);
  });
});
