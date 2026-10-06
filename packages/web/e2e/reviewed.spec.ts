import { expect, test } from '@playwright/test';
import { importProject, rawItem, type TestItem } from './claude';
import { noSideScroll } from './env';

// Concerns the importer wrote without a question, which nobody has answered: all on "Nobody has reviewed these".
const twice: TestItem = { key: 'twice', title: 'The job might run twice', summary: 'A second run would send every reminder again.', fields: { severity: 'low' } };
const slow: TestItem = { key: 'slow', title: 'The due-soon query is slow', summary: 'It scans every subscription.', fields: { severity: 'low' } };
const cache: TestItem = { key: 'cache', title: 'Reminder copy is cached', summary: 'Edits take an hour to show.', fields: { severity: 'low' } };

test('marking items reviewed takes them off the Finalize warning list, and Undo puts one back', async ({ page }) => {
  const p = await importProject('reviewed-marks', 'Reviewed marks', { concerns: [twice, slow, cache] });
  await page.goto(`${p.url}/finalize`);
  const unreviewed = page.getByTestId('checklist-unreviewed');
  await expect(unreviewed.getByRole('heading')).toHaveText('Nobody has reviewed these');
  await expect(unreviewed.getByRole('link')).toHaveCount(3);
  await expect(page.getByTestId('reviewed-count')).toHaveCount(0);

  // Ticking a row marks it, without opening its thread.
  await unreviewed.getByRole('checkbox', { name: 'Mark The job might run twice as reviewed' }).check();
  await expect(unreviewed.getByRole('link')).toHaveCount(2);
  await expect(unreviewed).not.toContainText('The job might run twice');
  await expect(page.getByTestId('reviewed-count')).toHaveText('1 marked as reviewed');
  await expect(page).toHaveURL(new RegExp(`${p.url}/finalize$`));
  expect(rawItem(p, 'concerns-twice').reviewedAt).toEqual(expect.any(String));

  await unreviewed.getByRole('button', { name: 'Mark all as reviewed' }).click();
  await expect(page.getByTestId('checklist-unreviewed')).toHaveCount(0);
  await expect(page.getByTestId('reviewed-count')).toHaveText('3 marked as reviewed');
  // Start finalize is still the page's main action: nothing blocks it.
  await expect(page.getByRole('button', { name: 'Start finalize' })).toBeEnabled();

  // In the thread, the mark reads Reviewed, and Undo puts the item back on the list. The thread is as it was.
  await page.goto(`${p.url}/th/t-concerns-slow`);
  const mark = page.getByTestId('reviewed-mark');
  await expect(mark).toHaveText('✓ Reviewed · Undo');
  await expect(page.getByTestId('thread-status')).toHaveText('Nothing needed');
  await mark.getByRole('button', { name: 'Undo' }).click();
  await expect(mark.getByRole('button', { name: 'Mark as reviewed' })).toBeVisible();
  expect(rawItem(p, 'concerns-slow').reviewedAt).toBeUndefined();

  await page.goto(`${p.url}/finalize`);
  await expect(page.getByTestId('checklist-unreviewed').getByRole('link')).toHaveText([/The due-soon query is slow/]);
  await expect(page.getByTestId('reviewed-count')).toHaveText('2 marked as reviewed');
});

test.describe('reviewed marks on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('the checkboxes, Mark all and the thread mark fit the width', async ({ page }) => {
    const p = await importProject('reviewed-phone', 'Reviewed marks phone', { concerns: [twice, slow] });
    await page.goto(`${p.url}/finalize`);
    const unreviewed = page.getByTestId('checklist-unreviewed');
    await expect(unreviewed.getByRole('checkbox')).toHaveCount(2);
    await expect(unreviewed.getByRole('button', { name: 'Mark all as reviewed' })).toBeVisible();
    expect(await noSideScroll(page)).toEqual([]);
    await unreviewed.getByRole('checkbox', { name: 'Mark The job might run twice as reviewed' }).check();
    await expect(page.getByTestId('reviewed-count')).toHaveText('1 marked as reviewed');
    expect(await noSideScroll(page)).toEqual([]);

    await page.goto(`${p.url}/th/t-concerns-twice`);
    await expect(page.getByTestId('reviewed-mark')).toHaveText('✓ Reviewed · Undo');
    expect(await noSideScroll(page)).toEqual([]);
  });
});
