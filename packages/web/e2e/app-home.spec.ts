import { expect, test } from '@playwright/test';
import { noSideScroll } from './env';

test('search sits at the very top', async ({ page }) => {
  await page.goto('/');
  const box = await page.getByRole('searchbox', { name: 'Search plumbing projects' }).boundingBox();
  expect(box!.y).toBeLessThan(40);
});

test('lists needs-you first and pages with Load more', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'All' }).click();
  const rows = page.getByTestId('project-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Restock reminders');
  await expect(rows.nth(1)).toContainText('Checkout redesign');
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
});

test('active is the default tab and finalized projects have their own', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('project-row')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Finalized' }).click();
  await expect(page.getByTestId('project-row')).toHaveCount(1);
  await expect(page.getByTestId('project-row')).toContainText('Onboarding emails');
});

test('search filters, and says when nothing matches', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'All' }).click();
  const search = page.getByRole('searchbox', { name: 'Search plumbing projects' });
  await search.fill('onboarding');
  await expect(page.getByTestId('project-row')).toHaveCount(1);
  await search.fill('zzz');
  await expect(page.getByTestId('empty-state')).toContainText('No plumbing projects match');
});

test('rows show who is waiting', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('project-row').first()).toContainText('2 need you');
  await expect(page.getByTestId('project-row').first()).toContainText('1 draft');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('one column and no sideways scrolling', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('project-row').first()).toBeVisible();
    expect(await noSideScroll(page)).toEqual([]);
  });
});
