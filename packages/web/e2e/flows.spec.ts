import type { FlowData } from '@dev-plumbing/core/schemas';
import { expect, test, type Page } from '@playwright/test';
import { importProject, writeRawData, type TestItem } from './claude';
import { noSideScroll } from './env';

const ui: TestItem[] = [
  {
    key: 'settings',
    title: 'Restock settings card',
    summary: 'A card on the account page.',
    data: {
      location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] },
      kit: 'web',
      after: '<section class="rounded-card bg-brand p-4 text-white"><h2>Restock settings</h2><p>Remind me 3 days before.</p></section>',
    },
  },
  { key: 'confirm', title: 'Reorder confirmation', summary: 'Shown after the tap.', data: { location: { app: 'web', route: '/reorder', files: [] }, kit: 'web' } },
];
const user: TestItem = {
  key: 'reorder',
  title: 'Reorder from a reminder',
  summary: 'What the customer does.',
  data: {
    kind: 'user',
    steps: [
      { n: 1, label: 'Open restock settings', mockupId: 'ui-settings', systemNote: 'Reads remindDaysBefore' },
      { n: 2, label: 'Confirm the reorder', mockupId: 'ui-confirm' },
      { n: 3, label: 'See the order placed' },
    ],
  },
};
const system: TestItem = {
  key: 'daily-job',
  title: 'Daily reminder job',
  summary: 'From the job to the provider.',
  data: {
    kind: 'system',
    lanes: [
      { id: 'job', label: 'Reminder job', status: 'new' },
      { id: 'db', label: 'Database', status: 'unchanged' },
      { id: 'sms', label: 'SMS provider', status: 'external' },
    ],
    steps: [
      { n: 1, from: 'job', to: 'db', label: 'Find subscriptions due soon' },
      { n: 2, from: 'job', to: 'job', label: 'Skip paused customers' },
      { n: 3, from: 'job', to: 'sms', label: 'Send the reminder' },
    ],
  },
};
const both: TestItem = {
  key: 'one-tap',
  title: 'Reorder in one tap',
  summary: 'The tap, and what happens behind it.',
  data: {
    kind: 'both',
    lanes: [
      { id: 'app', label: 'Web app', status: 'changed' },
      { id: 'api', label: 'Orders API', status: 'new' },
    ],
    steps: [
      { n: 1, from: 'app', to: 'api', label: 'Tap Reorder', mockupId: 'ui-confirm' },
      { n: 2, from: 'api', to: 'app', label: 'Show the order' },
    ],
  },
};
const flowFor = (page: Page, title: string) => page.getByTestId('flow').filter({ has: page.getByRole('heading', { name: title }) });
const seqStep = (page: Page, title: string, n: number) => flowFor(page, title).locator(`[data-testid="sequence-step"][data-step="${n}"]`);

test('a user flow is a storyboard that shows the UI mockups', async ({ page }) => {
  const p = await importProject('flows-user', 'Flows user', { ui, flows: [user] });
  await page.goto(`${p.url}/t/flows`);
  const flow = flowFor(page, 'Reorder from a reminder');
  await expect(flow.getByText('User flow', { exact: true })).toBeVisible();
  const steps = flow.getByTestId('story-step');
  await expect(steps).toHaveCount(3);
  const first = steps.filter({ hasText: 'Open restock settings' });
  await expect(first.getByTestId('mockup-frame')).toHaveAttribute('src', /\/items\/ui-settings\/mockup\/after/);
  await expect(first.getByText('Reads remindDaysBefore')).toBeVisible();
  await expect(first.getByRole('link', { name: 'Restock settings card' })).toBeVisible();
  // A UI item without markup is a plain card that still links to its screen.
  const second = steps.filter({ hasText: 'Confirm the reorder' });
  await expect(second.getByTestId('mockup-frame')).toHaveCount(0);
  await expect(second.getByRole('link', { name: 'Reorder confirmation' })).toBeVisible();
  await expect(steps.filter({ hasText: 'See the order placed' }).getByRole('link')).toHaveCount(0);
});

test('a system flow is a sequence diagram with lanes, arrows and a self-step', async ({ page }) => {
  const p = await importProject('flows-system', 'Flows system', { flows: [system] });
  await page.goto(`${p.url}/t/flows`);
  const flow = flowFor(page, 'Daily reminder job');
  await expect(flow.getByText('System flow', { exact: true })).toBeVisible();
  await expect(flow.getByTestId('sequence-lane')).toHaveCount(3);
  await expect(seqStep(page, 'Daily reminder job', 1)).toHaveAttribute('data-shape', 'arrow');
  await expect(seqStep(page, 'Daily reminder job', 2)).toHaveAttribute('data-shape', 'loop');
  await expect(seqStep(page, 'Daily reminder job', 3)).toContainText('3. Send the reminder');
  await expect(flow.getByTestId('storyboard')).toHaveCount(0);
  // ?item= opens one flow.
  await page.goto(`${p.url}/t/flows?item=flows-daily-job`);
  await expect(flowFor(page, 'Daily reminder job')).toHaveAttribute('data-selected', 'true');
});

test('a flow that is both switches between storyboard and sequence, with the same numbers', async ({ page }) => {
  const p = await importProject('flows-both', 'Flows both', { ui, flows: [both] });
  await page.goto(`${p.url}/t/flows`);
  const flow = flowFor(page, 'Reorder in one tap');
  await expect(flow.getByText('User and system', { exact: true })).toBeVisible();
  await expect(flow.getByRole('tab', { name: 'Storyboard' })).toHaveAttribute('aria-selected', 'true');
  await expect(flow.getByTestId('story-step').filter({ hasText: 'Tap Reorder' })).toHaveAttribute('data-step', '1');
  await expect(flow.getByTestId('story-step').filter({ hasText: 'Show the order' })).toHaveAttribute('data-step', '2');
  await flow.getByRole('tab', { name: 'Sequence' }).click();
  await expect(flow.getByTestId('storyboard')).toHaveCount(0);
  await expect(seqStep(page, 'Reorder in one tap', 1)).toContainText('1. Tap Reorder');
  await expect(seqStep(page, 'Reorder in one tap', 2)).toContainText('2. Show the order');
  await flow.getByRole('tab', { name: 'Storyboard' }).click();
  await expect(flow.getByTestId('story-step')).toHaveCount(2);
});

test('asking about a step starts a thread, and the step shows a bubble', async ({ page }) => {
  const p = await importProject('flows-ask', 'Flows ask', { flows: [system] });
  await page.goto(`${p.url}/t/flows`);
  await flowFor(page, 'Daily reminder job').getByRole('button', { name: 'Step 2: Skip paused customers' }).click();
  const panel = flowFor(page, 'Daily reminder job').getByTestId('step-panel');
  await expect(panel).toContainText('Skip paused customers');
  await expect(panel).toContainText('Reminder job');
  await panel.getByRole('button', { name: 'Ask about this step' }).click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('About Step 2: Skip paused customers');
  await page.getByRole('textbox', { name: 'Your message' }).fill('Should paused customers get a note instead?');
  await page.getByRole('button', { name: 'Add and send' }).click();
  await expect(page).toHaveURL(/\/th\/t-flows-about-step-2-skip-paused-customers$/);
  await expect(page.getByTestId('thread-status')).toHaveText('With Claude');

  await page.goto(`${p.url}/t/flows`);
  await expect(seqStep(page, 'Daily reminder job', 2).getByTestId('sequence-bubble')).toHaveText('1');
  await expect(seqStep(page, 'Daily reminder job', 1).getByTestId('sequence-bubble')).toHaveCount(0);
  await flowFor(page, 'Daily reminder job').getByRole('button', { name: 'Step 2: Skip paused customers' }).click();
  await flowFor(page, 'Daily reminder job').getByTestId('step-panel').getByRole('link', { name: 'About Step 2: Skip paused customers' }).click();
  await expect(page).toHaveURL(/\/th\/t-flows-about-step-2-skip-paused-customers$/);
});

test('a thread about a removed step stays listed as not in this version', async ({ page }) => {
  const p = await importProject('flows-gone', 'Flows gone', { flows: [system] });
  await page.goto(`${p.url}/t/flows`);
  await flowFor(page, 'Daily reminder job').getByRole('button', { name: 'Step 2: Skip paused customers' }).click();
  await flowFor(page, 'Daily reminder job').getByTestId('step-panel').getByRole('button', { name: 'Ask about this step' }).click();
  await page.getByRole('textbox', { name: 'Your message' }).fill('Should paused customers get a note instead?');
  await page.getByRole('button', { name: 'Add and send' }).click();
  await expect(page).toHaveURL(/\/th\/t-flows-about-step-2-skip-paused-customers$/);

  // Claude rewrites the flow without step 2.
  const before = system.data as FlowData;
  const without: FlowData = { ...before, steps: before.steps.filter((s) => s.n !== 2) };
  writeRawData(p, 'flows-daily-job', without);
  await page.goto(`${p.url}/t/flows`);
  const flow = flowFor(page, 'Daily reminder job');
  await expect(flow.getByTestId('sequence-step')).toHaveCount(2);
  const gone = flow.getByRole('listitem').filter({ hasText: 'Not in this version' });
  await expect(gone).toHaveCount(1);
  await gone.getByRole('link', { name: 'About Step 2: Skip paused customers' }).click();
  await expect(page).toHaveURL(/\/th\/t-flows-about-step-2-skip-paused-customers$/);
});

test("a flow that can't be drawn doesn't hide the others", async ({ page }) => {
  const p = await importProject('flows-broken', 'Flows broken', { ui, flows: [user, system] });
  await writeRawData(p, 'flows-reorder', { kind: 'user', steps: [] });
  await page.goto(`${p.url}/t/flows`);
  await expect(page.getByText("This item's drawing couldn't be shown")).toBeVisible();
  await expect(flowFor(page, 'Daily reminder job').getByTestId('sequence-step')).toHaveCount(3);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('storyboards stack and sequences fit the width', async ({ page }) => {
    const p = await importProject('flows-phone', 'Flows phone', { ui, flows: [user, system] });
    await page.goto(`${p.url}/t/flows`);
    await expect(page.getByTestId('sequence')).toBeVisible();
    const cards = page.getByTestId('story-step');
    await expect(cards).toHaveCount(3);
    const a = (await cards.nth(0).boundingBox())!;
    const b = (await cards.nth(1).boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
    expect(await noSideScroll(page)).toEqual([]);
  });

  test("tapping a step's card opens its panel right under it, on screen", async ({ page }) => {
    const long: TestItem = {
      key: 'long',
      title: 'Reorder, screen by screen',
      summary: 'Four screens, each with a mockup.',
      data: { kind: 'user', steps: [1, 2, 3, 4].map((n) => ({ n, label: `Screen ${n}`, mockupId: 'ui-settings' })) },
    };
    const p = await importProject('flows-phone-panel', 'Flows phone panel', { ui, flows: [long] });
    await page.goto(`${p.url}/t/flows`);
    const flow = flowFor(page, 'Reorder, screen by screen');
    await expect(flow.getByTestId('story-step')).toHaveCount(4);
    await flow.getByRole('button', { name: 'Step 1: Screen 1' }).click();
    const panel = flow.getByTestId('step-panel');
    await expect(panel).toContainText('Screen 1');
    await expect(panel).toBeInViewport();
    await expect(panel.getByRole('button', { name: 'Ask about this step' })).toBeInViewport();
    // Right under step 1, above step 2.
    const card = (await flow.locator('[data-testid="story-step"][data-step="1"]').boundingBox())!;
    const next = (await flow.locator('[data-testid="story-step"][data-step="2"]').boundingBox())!;
    const box = (await panel.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(card.y);
    expect(box.y + box.height).toBeLessThanOrEqual(next.y);
    expect(await noSideScroll(page)).toEqual([]);
  });
});

test.describe('on a tablet', () => {
  test.use({ viewport: { width: 900, height: 1000 } });
  test('a storyboard uses at most two columns', async ({ page }) => {
    const p = await importProject('flows-tablet', 'Flows tablet', { ui, flows: [user] });
    await page.goto(`${p.url}/t/flows`);
    const cards = page.getByTestId('story-step');
    await expect(cards).toHaveCount(3);
    const [a, b, c] = await Promise.all([0, 1, 2].map(async (i) => (await cards.nth(i).boundingBox())!));
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(1);
    expect(c!.y).toBeGreaterThanOrEqual(Math.max(a!.y + a!.height, b!.y + b!.height));
    expect(await noSideScroll(page)).toEqual([]);
  });
});
