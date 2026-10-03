import { expect, test, type Page } from '@playwright/test';
import { api, importProject, writeRawData, type TestItem } from './claude';
import { noSideScroll } from './env';

const CARD = '<div class="bg-brand rounded-card p-4" data-testid="card">Restock soon</div>';
const CARD_SELECTOR = 'body > main:nth-of-type(1) > div:nth-of-type(1)';
const SETTINGS_DATA = {
  location: { app: 'web', route: '/reminders', files: ['apps/web/app/reminders/page.tsx'] },
  kit: 'web',
  after: `<main class="p-6">${CARD}</main>`,
  before: '<main class="p-6"><p>No reminders yet</p></main>',
};
const settings: TestItem = { key: 'settings', title: 'Restock settings card', summary: 'A card on the reminders page.', data: SETTINGS_DATA };
const badge: TestItem = {
  key: 'badge',
  title: 'Restock badge',
  summary: 'A badge on each subscription item.',
  data: { location: { app: 'web', files: [] }, kit: 'web', after: '<span class="rounded-card bg-brand px-2">3 days left</span>' },
};
const orders: TestItem = {
  key: 'orders',
  title: 'Order history page',
  summary: 'Lists past orders.',
  body: 'Show the **next reminder** under each order.',
  data: { location: { app: 'web', route: '/orders', files: [] }, kit: 'web' },
};
const ASK = "Please draw the After mockup for this screen with the app's kit, and a Before from the current component if the screen exists today.";
const frameOf = (page: Page) => page.frameLocator('[data-testid=mockup-frame]');

test("draws the mockup with the app's kit, at desktop or mobile width", async ({ page }) => {
  const p = await importProject('mockups-kit', 'Mockups kit', { ui: [settings] });
  await page.goto(`${p.url}/t/ui`);
  await expect(page.getByTestId('mockup-location')).toHaveText('/reminders · apps/web/app/reminders/page.tsx · web');
  // These values exist only in the fixture's apps/web/app/globals.css, so the kit's @theme compiled in the frame.
  const card = frameOf(page).getByTestId('card');
  await expect(card).toHaveCSS('background-color', 'rgb(15, 118, 110)');
  await expect(card).toHaveCSS('border-radius', '14px');
  await expect(page.getByTestId('kit-warnings')).toHaveCount(0);
  const frame = page.getByTestId('mockup-frame');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(frame).toHaveAttribute('width', '1280');
  await page.getByRole('tab', { name: 'Mobile' }).click();
  await expect(frame).toHaveAttribute('width', '390');
  await expect(card).toBeVisible();
});

test("switches Before and After, and Before is off when there isn't one", async ({ page }) => {
  const p = await importProject('mockups-sides', 'Mockups sides', { ui: [settings, badge] });
  await page.goto(`${p.url}/t/ui?item=ui-settings`);
  await expect(frameOf(page).getByTestId('card')).toBeVisible();
  await page.getByRole('tab', { name: 'Before' }).click();
  await expect(frameOf(page).getByText('No reminders yet')).toBeVisible();
  await expect(page.getByTestId('mockup-frame')).toHaveAttribute('title', 'Before mockup');
  await page.getByRole('tab', { name: 'After' }).click();
  await expect(frameOf(page).getByTestId('card')).toBeVisible();
  await page.getByTestId('mockup-item').filter({ hasText: 'Restock badge' }).click();
  await expect(page).toHaveURL(/\?item=ui-badge$/);
  await expect(page.getByRole('tab', { name: 'Before' })).toBeDisabled();
  await expect(frameOf(page).getByText('3 days left')).toBeVisible();
});

test('+ Pin starts a thread about the element you click, and the pin shows on the mockup', async ({ page }) => {
  const p = await importProject('mockups-pin', 'Mockups pin', { ui: [settings] });
  await page.goto(`${p.url}/t/ui`);
  const card = frameOf(page).getByTestId('card');
  // Wait for the kit, so the card is where it will stay.
  await expect(card).toHaveCSS('background-color', 'rgb(15, 118, 110)');
  const hint = page.getByText('Click the part of the mockup you want to ask about.');
  await page.getByRole('button', { name: '+ Pin' }).click();
  await expect(hint).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(hint).toBeHidden();

  await page.getByRole('button', { name: '+ Pin' }).click();
  await card.click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('About Restock soon');
  await page.getByRole('textbox', { name: 'Your message' }).fill('Should it say how many days are left?');
  await page.getByRole('button', { name: 'Add and send' }).click();
  await expect(page).toHaveURL(/\/th\/t-ui-about-restock-soon$/);
  await expect(page.getByText('Should it say how many days are left?')).toBeVisible();
  const detail = await api(`/api/projects/${p.repo}/${p.project}/threads/t-ui-about-restock-soon`);
  expect(detail.item.anchor).toEqual({ itemId: 'ui-settings', kind: 'element', ref: CARD_SELECTOR, label: 'Restock soon', side: 'after' });

  await page.goto(`${p.url}/t/ui`);
  const pin = page.getByTestId('mockup-pin');
  await expect(pin).toHaveCount(1);
  await expect(pin).toContainText('About Restock soon');
  await expect(frameOf(page).locator('[data-dp-pin]')).toHaveText('1');
});

test("markup can't run script in the frame", async ({ page }) => {
  const p = await importProject('mockups-script', 'Mockups script', { ui: [settings] });
  // Written straight to the item file, past the write checks (which refuse the remote image).
  await writeRawData(p, 'ui-settings', {
    ...SETTINGS_DATA,
    after: `<main class="p-6"><button data-testid="sneaky" onclick="parent.postMessage({source:'dp-mockup',type:'open-pin',id:'x'},'*')">x</button><img src="https://example.com/x.png" alt=""></main>`,
  });
  // Set up before the frame loads. Only requests the frame's CSP lets through reach routing, so a blocked image never
  // shows up here; one that got past the CSP would be caught (and answered locally, never fetched from the network).
  const outside: string[] = [];
  await page.route('**://example.com/**', (route) => {
    outside.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  await page.goto(`${p.url}/t/ui`);
  const sneaky = frameOf(page).getByTestId('sneaky');
  await expect(sneaky).toBeVisible();
  await expect(page.getByTestId('mockup-problems')).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { frameMessages: unknown[] };
    w.frameMessages = [];
    window.addEventListener('message', (e) => w.frameMessages.push(e.data));
  });
  await sneaky.click();
  // Pick something too: messages from one frame arrive in order, so once the pick is in,
  // anything the click could have posted would be in as well.
  await page.getByRole('button', { name: '+ Pin' }).click();
  await sneaky.click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('About x');
  const types = await page.evaluate(() => (window as unknown as { frameMessages: { type?: string }[] }).frameMessages.map((m) => m?.type));
  expect(types).toContain('picked');
  expect(types).not.toContain('open-pin');
  expect(outside).toEqual([]);
  await expect(page).toHaveURL(new RegExp(`${p.url}/t/ui$`));
});

test('a pin survives a redrawn mockup', async ({ page }) => {
  const p = await importProject('mockups-redrawn', 'Mockups redrawn', { ui: [settings] });
  await api(`/api/projects/${p.repo}/${p.project}/items`, 'POST', {
    type: 'ui',
    title: 'About Restock soon',
    text: 'How many days are left?',
    anchor: { itemId: 'ui-settings', kind: 'element', ref: CARD_SELECTOR, label: 'Restock soon', side: 'after' },
  });
  await page.goto(`${p.url}/t/ui?item=ui-settings`);
  const pin = page.getByTestId('mockup-pin');
  await expect(frameOf(page).locator('[data-dp-pin]')).toHaveText('1');
  await expect(pin).toHaveCount(1);
  await expect(pin).not.toContainText('Not in this version');

  await writeRawData(p, 'ui-settings', { ...SETTINGS_DATA, after: '<section class="p-6"><p>Restock moved to settings</p></section>' });
  await page.reload();
  await expect(frameOf(page).getByText('Restock moved to settings')).toBeVisible();
  await expect(pin).toContainText('Not in this version');
  await expect(frameOf(page).locator('[data-dp-pin]')).toHaveCount(0);
  await pin.getByRole('link', { name: 'About Restock soon' }).click();
  await expect(page).toHaveURL(/\/th\/t-ui-about-restock-soon$/);
});

test('a UI item without markup offers Ask Claude for a mockup', async ({ page }) => {
  const p = await importProject('mockups-legacy', 'Mockups legacy', { ui: [orders] });
  await page.goto(`${p.url}/t/ui`);
  await expect(page.getByText('No mockup yet.')).toBeVisible();
  await expect(page.getByText('next reminder')).toBeVisible();
  await expect(page.getByTestId('mockup-frame')).toHaveCount(0);
  const ask = page.getByRole('button', { name: 'Ask Claude for a mockup' });
  await ask.click();
  await expect(page.getByTestId('send-notice')).toHaveText('Saved. No Claude window is listening. Run /dev-plumbing in any clone.');
  await expect(ask).toBeDisabled();
  await expect(page.getByText('Claude is working on it.')).toBeVisible();
  const detail = await api(`/api/projects/${p.repo}/${p.project}/threads/t-ui-orders`);
  expect(detail.thread.messages.at(-1)).toMatchObject({ author: 'you', text: ASK });
});

test('a page sized to the viewport keeps a stable frame height', async ({ page }) => {
  const p = await importProject('mockups-tall', 'Mockups tall', { ui: [settings] });
  await writeRawData(p, 'ui-settings', { ...SETTINGS_DATA, after: '<header class="h-16">h</header><main class="min-h-screen">m</main>' });
  await page.goto(`${p.url}/t/ui`);
  const frame = page.getByTestId('mockup-frame');
  await expect(frameOf(page).getByText('m', { exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  const first = await frame.getAttribute('height');
  await page.waitForTimeout(1000);
  expect(await frame.getAttribute('height')).toBe(first);
  expect(Number(first)).toBeLessThanOrEqual(12000);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('the mockup scales to the width', async ({ page }) => {
    const p = await importProject('mockups-phone', 'Mockups phone', { ui: [settings] });
    await page.goto(`${p.url}/t/ui`);
    const frame = page.getByTestId('mockup-frame');
    await expect(frame).toHaveAttribute('width', '390');
    await expect(frameOf(page).getByTestId('card')).toBeVisible();
    expect((await frame.boundingBox())!.width).toBeLessThanOrEqual(375);
    await page.getByRole('tab', { name: 'Desktop' }).click();
    await expect(frame).toHaveAttribute('width', '1280');
    expect((await frame.boundingBox())!.width).toBeLessThanOrEqual(375);
    expect(await noSideScroll(page)).toEqual([]);
  });
});
