import { expect, test } from '@playwright/test';
import { noSideScroll } from './env';

const PROJECT = '/p/acme/restock-reminders';
const TYPE_TITLES = ['Architecture', 'Database', 'UI changes', 'Flows', 'Questions', 'Concerns', 'Ideas', 'Phases & milestones', 'Testing & rollout', 'Security & permissions'];

test('opens from the app home and shows where the plan came from', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('project-row').filter({ hasText: 'Restock reminders' }).click();
  await expect(page).toHaveURL(/\/p\/acme\/restock-reminders$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Restock reminders');
  const source = page.getByTestId('project-source');
  await expect(source).toContainText('docs/specs/restock-reminders.md');
  await expect(source).toContainText('~/Source/acme @ main');
});

test('lists every plumbing type on the left, in order', async ({ page }) => {
  await page.goto(PROJECT);
  const nav = page.getByRole('complementary', { name: 'Project navigation' });
  await expect(nav.getByTestId(/^nav-type-/)).toContainText(TYPE_TITLES);
  await expect(nav.getByTestId('nav-type-security')).toContainText('No changes');
});

test('a plumbing type with nothing in the plan says so', async ({ page }) => {
  await page.goto(PROJECT);
  await page.getByRole('complementary', { name: 'Project navigation' }).getByTestId('nav-type-security').click();
  const empty = page.getByTestId('no-changes');
  await expect(empty).toContainText("This plan doesn't change roles, permissions or how personal data is handled.");
  await expect(empty).toContainText("The plan doesn't touch roles, permissions or personal data.");
});

test('a plumbing type with items lists them', async ({ page }) => {
  await page.goto(`${PROJECT}/t/questions`);
  await expect(page.getByText('Who gets reminders at launch?')).toBeVisible();
  await expect(page.getByText('BLOCKING')).toBeVisible();
});

test('the inbox groups threads by whose turn it is', async ({ page }) => {
  await page.goto(PROJECT);
  const inbox = page.getByTestId('inbox');
  await expect(inbox).toContainText('Your turn · 2');
  await expect(inbox).toContainText('Drafts, not sent · 1');
  await expect(inbox).toContainText('With Claude · 1');
  await expect(inbox.getByTestId('inbox-row')).toHaveCount(4);
  await inbox.getByRole('button', { name: /Resolved 1 · Parked 1/ }).click();
  await expect(inbox.getByTestId('inbox-row')).toHaveCount(6);
});

test('shows the original and the draft, and says when there is no final yet', async ({ page }) => {
  await page.goto(PROJECT);
  const nav = page.getByRole('complementary', { name: 'Project navigation' });
  await nav.getByRole('link', { name: 'Original', exact: true }).click();
  await expect(page.getByTestId('document')).toContainText('A daily job finds subscriptions');
  await nav.getByRole('link', { name: 'Draft', exact: true }).click();
  await expect(page.getByTestId('document')).toContainText('Reminders go out by SMS and email.');
  await expect(nav.getByText('Final')).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Final', exact: true })).toHaveCount(0);
});

test('Open file explains when the plan is not on disk', async ({ page }) => {
  await page.goto(PROJECT);
  await page.getByTestId('project-source').getByRole('button', { name: 'Open file' }).click();
  await expect(page.getByTestId('project-source')).toContainText("isn't at");
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('one column with a section switcher and a pinned main action', async ({ page }) => {
    await page.goto(PROJECT);
    await expect(page.getByRole('complementary', { name: 'Project navigation' })).toBeHidden();
    await expect(page.getByTestId('inbox')).toBeVisible();
    const submit = page.getByRole('button', { name: 'Submit all · 1 draft' });
    const box = await submit.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(812 - 60);
    await page.getByRole('tab', { name: 'Plumbing' }).click();
    // The hidden desktop sidebar also has this link, so click the one inside <main>.
    await page.getByRole('main').getByTestId('nav-type-security').click();
    await expect(page.getByTestId('no-changes')).toBeVisible();
    expect(await noSideScroll(page)).toEqual([]);
  });
});
