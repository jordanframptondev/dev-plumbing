import { expect, test, type Page } from '@playwright/test';
import { importProject, type TestItem } from './claude';
import { noSideScroll } from './env';

const questions: TestItem[] = [
  { key: 'who', title: 'Who gets reminders?', summary: 'Audience.' },
  { key: 'days', title: 'How many days before?', summary: 'Lead time.' },
];
// Out of order on purpose: 2, 1, 3. "Build the table" waits for an answer; the rest are idle.
const phases: TestItem[] = [
  {
    key: 'send',
    title: 'Send reminders',
    summary: 'The daily job sends them.',
    data: { order: 2, goal: 'Customers get a reminder before they run out.', doneWhen: ['The job runs daily', 'Every send is logged'], itemIds: ['questions-who', 'questions-days'] },
  },
  {
    key: 'table',
    title: 'Build the table',
    summary: 'Storage first.',
    data: { order: 1, goal: 'Reminders can be stored.', doneWhen: ['The migration runs'], itemIds: ['questions-days'] },
    message: { text: 'Is the table enough on its own for a first phase?' },
  },
  {
    key: 'reorder',
    title: 'Reorder in one tap',
    summary: 'The reorder link.',
    data: { order: 3, goal: 'One tap reorders the item.', doneWhen: ['The link works', 'Reorders are tracked', 'Support knows about it'], itemIds: [] },
  },
  { key: 'polish', title: 'Polish', summary: 'Written before phases had data.' },
];
const chips = (page: Page) => page.getByTestId('phase-chip');
const rowFor = (page: Page, title: string) => page.getByTestId('list-row').filter({ hasText: title });

test('the timeline shows phases in order with their counts, and phases without data last', async ({ page }) => {
  const p = await importProject('phases-order', 'Phases order', { questions, phases });
  await page.goto(`${p.url}/t/phases`);
  await expect(chips(page)).toHaveCount(4);
  await expect(chips(page).nth(0)).toContainText('Phase 1');
  await expect(chips(page).nth(0)).toContainText('Build the table');
  await expect(chips(page).nth(1)).toContainText('Phase 2');
  await expect(chips(page).nth(1)).toContainText('Send reminders');
  await expect(chips(page).nth(1)).toContainText('Done when: 2');
  await expect(chips(page).nth(1)).toContainText('2 items');
  await expect(chips(page).nth(2)).toContainText('Phase 3');
  await expect(chips(page).nth(2)).toContainText('Done when: 3');
  await expect(chips(page).nth(2)).toContainText('0 items');
  await expect(chips(page).nth(3)).toContainText('Phase ?');
  await expect(chips(page).nth(3)).toContainText('Polish');
  await expect(chips(page).nth(3)).toContainText('No goal yet');
  // On a wide screen the chips sit side by side.
  const a = (await chips(page).nth(0).boundingBox())!;
  const b = (await chips(page).nth(1).boundingBox())!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByTestId('list-row').first()).toContainText('Build the table');
  await expect(page.getByTestId('list-row').last()).toContainText('Polish');
});

test("a phase row shows its goal, done-when and items, and an item link opens that item's thread", async ({ page }) => {
  const p = await importProject('phases-links', 'Phases links', { questions, phases });
  await page.goto(`${p.url}/t/phases`);
  const detail = rowFor(page, 'Build the table').getByTestId('phase-detail');
  await expect(detail).toContainText('Reminders can be stored.');
  await expect(detail).toContainText('The migration runs');
  await detail.getByRole('link', { name: 'Questions › How many days before?' }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/th/t-questions-days$`));
});

test('a click on a chip shows its row and outlines it', async ({ page }) => {
  const p = await importProject('phases-pick', 'Phases pick', { questions, phases });
  await page.goto(`${p.url}/t/phases`);
  await expect(page.getByRole('tab', { name: 'Needs you · 1' })).toHaveAttribute('aria-selected', 'true');
  await chips(page).filter({ hasText: 'Reorder in one tap' }).click();
  // Its row is idle, so the list switches to All to show it.
  await expect(page.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  const row = rowFor(page, 'Reorder in one tap');
  await expect(row).toHaveAttribute('data-selected', 'true');
  await expect(row).toHaveCSS('outline-style', 'solid');
  await expect(row).toBeInViewport();
  await expect(rowFor(page, 'Send reminders')).not.toHaveAttribute('data-selected', 'true');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('the timeline stacks', async ({ page }) => {
    const p = await importProject('phases-phone', 'Phases phone', { questions, phases });
    await page.goto(`${p.url}/t/phases`);
    await expect(chips(page)).toHaveCount(4);
    const a = (await chips(page).nth(0).boundingBox())!;
    const b = (await chips(page).nth(1).boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
    expect(Math.abs(a.x - b.x)).toBeLessThan(1);
    expect(await noSideScroll(page)).toEqual([]);
  });
});

test.describe('on a tablet', () => {
  test.use({ viewport: { width: 900, height: 1000 } });
  test('the timeline uses at most two columns', async ({ page }) => {
    const p = await importProject('phases-tablet', 'Phases tablet', { questions, phases });
    await page.goto(`${p.url}/t/phases`);
    await expect(chips(page)).toHaveCount(4);
    const [a, b, c] = await Promise.all([0, 1, 2].map(async (i) => (await chips(page).nth(i).boundingBox())!));
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(1);
    expect(c!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
    expect(Math.abs(a!.x - c!.x)).toBeLessThan(1);
    expect(await noSideScroll(page)).toEqual([]);
  });
});
