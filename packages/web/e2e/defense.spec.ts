import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { api, asClaude, defenseInput, fixtureRepo, importProject, PLAN_TEXT, writeDefense } from './claude';
import { noSideScroll } from './env';

const NO_WINDOW = 'No Claude window is listening. Run /dev-plumbing in any clone.';
const INTRO = "Claude writes a defense of this plan: how it works, what could fail and what's still unknown. Then you study it and practise explaining it.";
const META = /^Level 2 · Standard · Based on the draft \(v1\) · Generated /;

test('Generate asks a Claude window for the Whiteboard Defense, and the page shows it once it is saved', async ({ page }) => {
  const p = await importProject('def-generate', 'Defense generate');
  const P = `/api/projects/${p.repo}/${p.project}`;
  await page.goto(p.url);
  const nav = page.getByRole('complementary', { name: 'Project navigation' });
  await expect(nav.getByTestId('nav-defense')).toContainText('Not yet');
  // The header's Whiteboard Defense is a link to the page.
  await page.getByRole('main').getByRole('link', { name: 'Whiteboard Defense', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/defense(\\?mode=study)?$`));
  await expect(page.getByRole('heading', { name: 'Whiteboard Defense', exact: true })).toBeVisible();
  await expect(page.getByText(INTRO)).toBeVisible();

  const generate = page.getByTestId('defense-generate');
  await expect(generate).toHaveText('Generate');
  await generate.click();
  const status = page.getByTestId('defense-status');
  await expect(status).toHaveText(NO_WINDOW);
  await expect(generate).toHaveCount(0);
  await expect(page.getByTestId('defense-cancel')).toBeVisible();

  const wait = await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-def-generate', timeoutSeconds: 0 });
  expect(wait.kind).toBe('whiteboard');
  await expect(status).toHaveText("Claude is writing the Whiteboard Defense. Threads you send now wait until it's done.");
  await expect(nav.getByTestId('nav-defense')).toContainText('Writing…');
  const { request } = await api(`${P}/whiteboard`);
  expect(await asClaude('/whiteboard', { repo: p.repo, project: p.project, request: request.id, defense: defenseInput() })).toMatchObject({ ok: true, level: 2, questions: 3, concerns: 2 });

  await expect(page.getByTestId('defense-meta')).toHaveText(META);
  await expect(page.getByText('It sends messages to customers.')).toBeVisible();
  await expect(status).toHaveCount(0);
  await expect(page.getByTestId('defense-generate')).toHaveText('Regenerate');
  const contents = page.getByRole('navigation', { name: 'Contents' }).getByRole('link');
  await expect(contents).toHaveCount(13);
  await expect(contents.first()).toHaveText('1. Executive summary');
  await expect(contents.last()).toHaveText('13. Checklist');
  await expect(nav.getByTestId('nav-defense')).toHaveText('Whiteboard Defense');
});

test('Cancel takes back a request no window has picked up', async ({ page }) => {
  const p = await importProject('def-cancel', 'Defense cancel');
  await page.goto(`${p.url}/defense`);
  await page.getByTestId('defense-generate').click();
  await expect(page.getByTestId('defense-status')).toHaveText(NO_WINDOW);
  await page.getByTestId('defense-cancel').click();
  await expect(page.getByTestId('defense-status')).toHaveCount(0);
  await expect(page.getByTestId('defense-generate')).toHaveText('Generate');
  expect((await api(`/api/projects/${p.repo}/${p.project}/whiteboard`)).request).toBeNull();
});

test('Export .md writes the defense next to the plan in the clone you pick', async ({ page }) => {
  const p = await importProject('def-export', 'Defense export');
  await writeDefense(p);
  await page.goto(`${p.url}/defense`);
  const form = page.getByTestId('defense-export');
  await expect(form.getByLabel('Export into')).toHaveValue(fixtureRepo());
  await expect(form.getByLabel('Export into').locator('option')).toHaveText([`${fixtureRepo()} (source)`]);
  await expect(form.getByTestId('export-target')).toHaveText(`${fixtureRepo()}/docs/specs/def-export.whiteboard-defense.md`);
  await form.getByRole('button', { name: 'Export .md' }).click();
  await expect(form.getByTestId('defense-exported')).toContainText('/docs/specs/def-export.whiteboard-defense.md.');

  const written = fs.readFileSync(path.join(fixtureRepo(), 'docs/specs/def-export.whiteboard-defense.md'), 'utf8');
  expect(written).toMatch(/^# Whiteboard Defense: /);
  expect(written).toContain('## 5. Security model');
  // The rules file's checklist, which the service copied.
  expect(written).toContain('- [ ] I can explain the purpose.');
  // The plan itself is untouched.
  expect(fs.readFileSync(path.join(fixtureRepo(), 'docs/specs/def-export.md'), 'utf8')).toBe(PLAN_TEXT('Defense export'));
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('the Defense tab opens the page, and the page fits the width', async ({ page }) => {
    const p = await importProject('def-phone', 'Defense phone');
    await writeDefense(p);
    await page.goto(p.url);
    await page.getByRole('tab', { name: 'Defense', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${p.url}/defense(\\?mode=study)?$`));
    await expect(page.getByTestId('defense-meta')).toHaveText(META);
    await expect(page.getByRole('tab', { name: 'Defense', exact: true })).toHaveAttribute('aria-selected', 'true');
    // Regenerate is this page's action, so Submit all's bar isn't pinned here.
    await expect(page.getByRole('button', { name: /^Submit all/ })).toHaveCount(0);
    expect(await noSideScroll(page)).toEqual([]);
  });
});
