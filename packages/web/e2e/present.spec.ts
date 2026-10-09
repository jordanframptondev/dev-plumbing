import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { defenseInput, importProject, writeDefense, type TestItem } from './claude';
import { e2eTmp, noSideScroll, readJson, repoRoot } from './env';

const system: TestItem = {
  key: 'system',
  title: 'System view',
  summary: 'The daily job and what it talks to.',
  data: {
    kind: 'system',
    groups: [{ id: 'jobs', label: 'Jobs' }],
    nodes: [
      { id: 'job', label: 'Reminder job', group: 'jobs', status: 'new' },
      { id: 'db', label: 'Orders database', status: 'unchanged' },
      { id: 'sms', label: 'SMS provider', status: 'external' },
    ],
    edges: [
      { id: 'reads', from: 'job', to: 'db', label: 'reads' },
      { id: 'sends', from: 'job', to: 'sms', style: 'dashed' },
    ],
  },
};
const reminder: TestItem = {
  key: 'restock-reminder',
  title: 'Add a RestockReminder table',
  summary: 'One row per reminder sent.',
  data: {
    model: 'RestockReminder',
    change: 'new',
    fields: [
      { name: 'id', type: 'String', change: 'added', default: 'cuid()' },
      { name: 'subscriptionId', type: 'String', change: 'added' },
      { name: 'subscription', type: 'Subscription', change: 'added' },
    ],
    schemaDiff: '+model RestockReminder {\n+  id             String       @id @default(cuid())\n+  subscriptionId String\n+  subscription   Subscription @relation(fields: [subscriptionId], references: [id])\n+}',
  },
};
const subscription: TestItem = {
  key: 'subscription',
  title: 'Remember how early to remind',
  summary: 'A lead time per subscription.',
  data: {
    model: 'Subscription',
    change: 'changed',
    fields: [
      { name: 'id', type: 'String', change: 'unchanged' },
      { name: 'remindDaysBefore', type: 'Int', change: 'added', default: '5' },
    ],
    schemaDiff: ' model Subscription {\n+  remindDaysBefore Int @default(5)\n }',
  },
};

type Note = { near: string; text: string; ink: 'ink' | 'slate' | 'seal' | 'moss' };
const say = (caption: string, reveal: string[] = [], notes: Note[] = []) => ({ caption, reveal, notes });

/** System flow draws the architecture diagram in three steps; Data and source of truth draws the tables in two. */
function presenter() {
  return {
    chapters: [
      { id: 'purpose', drawing: null, steps: [say('A daily job reminds customers before an item runs out.', [], [{ near: '', text: 'One job, one table.', ink: 'ink' }])] },
      {
        id: 'flow',
        drawing: { kind: 'diagram', itemId: 'architecture-system' },
        steps: [
          say('The job runs every morning.', ['node:job']),
          say('It reads the orders.', ['edge:reads']),
          say('Then it sends each reminder by SMS.', ['edge:sends'], [{ near: 'node:sms', text: 'Runs twice? One a day per subscription.', ink: 'seal' }]),
        ],
      },
      { id: 'data', drawing: { kind: 'tables' }, steps: [say('Each reminder sent is a row.', ['table:RestockReminder']), say('It points at its subscription.', ['link:RestockReminder.subscription'])] },
      { id: 'states', drawing: null, steps: [say("A reminder is due, then sent. This plan doesn't add other states.")] },
      { id: 'security', drawing: null, steps: [say('Only the job sends reminders.')] },
      { id: 'failure', drawing: null, steps: [say('A failed send is retried once, the next morning.')] },
      { id: 'rollback', drawing: null, steps: [say('Turn the job off; nothing else depends on it.')] },
    ],
  };
}

/** A project with a diagram and two tables, and a defense whose presenter draws them. */
async function presented(name: string) {
  const p = await importProject(name, 'Present', { architecture: [system], database: [reminder, subscription] });
  await writeDefense(p, { ...defenseInput(), presenter: presenter() });
  return p;
}

/** The refs on the board, once each, in the order they're drawn. */
const refs = (page: Page) =>
  page.getByTestId('board-shape').evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute('data-ref')))]);
/** Where an element is on the page (not in the window, which scrolls): x, y, width and height. */
const placeOf = (locator: Locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [r.x + window.scrollX, r.y + window.scrollY, r.width, r.height];
  });

test('Present draws the plan a step at a time, chapter by chapter, and Full screen covers the window', async ({ page }) => {
  const p = await presented('present-draws');
  await page.goto(`${p.url}/defense`);
  await page.getByRole('tab', { name: 'Present' }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/defense\\?mode=present$`));
  const board = page.getByTestId('board');
  const caption = page.getByTestId('present-caption');
  const step = page.getByTestId('present-step');
  await expect(step).toHaveText('Step 1 of 1');
  await expect(caption).toHaveText('A daily job reminds customers before an item runs out.');
  await expect(board.getByTestId('board-note')).toHaveText('One job, one table.');

  // → moves on to System flow, whose first step draws the job (and so its group), drawing it along its lines.
  await page.keyboard.press('ArrowRight');
  await expect(caption).toHaveText('The job runs every morning.');
  await expect(step).toHaveText('Step 1 of 3');
  await expect.poll(() => refs(page)).toEqual(['group:jobs', 'node:job']);
  await expect(board).toHaveAttribute('data-animate', 'true');
  await expect(board.locator('[data-ref="node:job"] path[pathLength]')).toHaveCount(1);
  // The board keeps its size and the drawing its frame, so ▶ stays under the pointer from step to step (a chapter's own
  // shape may move it between chapters).
  const nextButton = page.getByTestId('present-next');
  const nextAt = await placeOf(nextButton);
  const frame = await board.locator('svg[viewBox]').getAttribute('viewBox');
  await nextButton.click();
  await expect(caption).toHaveText('It reads the orders.');
  await expect.poll(() => refs(page)).toEqual(['group:jobs', 'edge:reads', 'node:job', 'node:db']);
  expect(await placeOf(nextButton)).toEqual(nextAt);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => refs(page)).toEqual(['group:jobs', 'edge:reads', 'edge:sends', 'node:job', 'node:db', 'node:sms']);
  expect(await placeOf(nextButton)).toEqual(nextAt);
  await expect(board.locator('svg[viewBox]')).toHaveAttribute('viewBox', frame!);
  const note = board.getByTestId('board-note');
  await expect(note).toHaveText('Runs twice? One a day per subscription.');
  await expect(note).toHaveAttribute('data-near', 'node:sms');
  // Going back shows the step at once.
  await page.keyboard.press('ArrowLeft');
  await expect(board).toHaveAttribute('data-animate', 'false');
  await expect(board.locator('path[pathLength]')).toHaveCount(0);

  // The chapters sit beside the board on a wide screen.
  const chapters = page.getByRole('navigation', { name: 'Chapters' });
  await expect(page.getByRole('combobox', { name: 'Chapters' })).toBeHidden();
  await chapters.getByRole('button', { name: '3. Data and source of truth' }).click();
  await expect(chapters.getByRole('button', { name: '3. Data and source of truth' })).toHaveAttribute('aria-current', 'step');
  await expect(caption).toHaveText('Each reminder sent is a row.');
  await expect.poll(() => refs(page)).toEqual(['table:RestockReminder']);
  // The tables are drawn in slate.
  await expect(board.locator('[data-ref="table:RestockReminder"] path').first()).toHaveCSS('stroke', 'rgb(109, 129, 150)');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => refs(page)).toEqual(['link:RestockReminder.subscription', 'table:RestockReminder', 'table:Subscription']);
  await page.getByRole('button', { name: 'Replay' }).click();
  await expect(step).toHaveText('Step 1 of 2');
  await expect.poll(() => refs(page)).toEqual(['table:RestockReminder']);

  // Full screen covers the whole window with the same board and controls; Esc leaves, and the focus comes back.
  await page.getByRole('button', { name: 'Full screen' }).click();
  const overlay = page.getByTestId('present-overlay');
  await expect(overlay).toBeVisible();
  const [width, height] = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
  expect(await overlay.boundingBox()).toEqual({ x: 0, y: 0, width, height });
  await expect(overlay.getByTestId('board')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(overlay.getByTestId('present-step')).toHaveText('Step 2 of 2');
  // The rest of the page is inert, so Tab from full screen's last control comes back to ✕.
  await expect(page.locator('aside[aria-label="Project navigation"]')).toHaveAttribute('inert', '');
  await overlay.getByRole('button', { name: 'Replay' }).focus();
  await page.keyboard.press('Tab');
  await expect(overlay.getByRole('button', { name: 'Leave full screen' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(step).toHaveText('Step 2 of 2');

  // Leaving the page in full screen leaves the browser's full screen too.
  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect(overlay).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${p.url}/defense(\\?mode=study)?$`));
  await expect(overlay).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe('');
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('everything a step adds shows at once', async ({ page }) => {
    const p = await presented('present-still');
    await page.goto(`${p.url}/defense?mode=present`);
    await expect(page.getByTestId('present-step')).toHaveText('Step 1 of 1');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => refs(page)).toEqual(['group:jobs', 'edge:reads', 'node:job', 'node:db']);
    const board = page.getByTestId('board');
    await expect(board).toHaveAttribute('data-animate', 'false');
    await expect(board.locator('path[pathLength]')).toHaveCount(0);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('held upright it asks to be turned sideways, and the board fits the width either way', async ({ page }) => {
    const p = await presented('present-phone');
    await page.goto(`${p.url}/defense?mode=present`);
    const hint = page.getByTestId('present-landscape-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText('Turn your phone sideways, then press Full screen.');
    // The chapters are a menu above the board.
    await expect(page.getByRole('navigation', { name: 'Chapters' })).toBeHidden();
    await page.getByRole('combobox', { name: 'Chapters' }).selectOption({ label: '2. System flow' });
    await page.getByRole('button', { name: 'Next step' }).click();
    await page.getByRole('button', { name: 'Next step' }).click();
    await expect.poll(() => refs(page)).toEqual(['group:jobs', 'edge:reads', 'edge:sends', 'node:job', 'node:db', 'node:sms']);
    expect(await noSideScroll(page)).toEqual([]);
    await page.setViewportSize({ width: 812, height: 375 });
    await expect(hint).toBeHidden();
    await expect(page.getByTestId('board')).toBeVisible();
    expect(await noSideScroll(page)).toEqual([]);
    // Sideways in full screen, everything fits: the caption and ▶ are on screen, and nothing needs scrolling.
    await page.getByRole('button', { name: 'Full screen' }).click();
    const overlay = page.getByTestId('present-overlay');
    await expect(overlay).toBeVisible();
    for (const id of ['present-caption', 'present-next']) {
      const box = (await overlay.getByTestId(id).boundingBox())!;
      expect(box.y, id).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, id).toBeLessThanOrEqual(375);
    }
    expect(await overlay.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
  });
});

/** A wide drawing: six services in a row. */
const chain: TestItem = {
  key: 'chain',
  title: 'Request path',
  summary: 'Six services in a row.',
  data: {
    kind: 'system',
    groups: [],
    nodes: ['Web app', 'API', 'Queue', 'Worker', 'Mailer', 'Archive'].map((label, i) => ({ id: `s${i}`, label, status: 'new' })),
    edges: [0, 1, 2, 3, 4].map((i) => ({ id: `c${i}`, from: `s${i}`, to: `s${i + 1}` })),
  },
};
/** A tall drawing: two lanes and twelve steps. */
const exchange: TestItem = {
  key: 'exchange',
  title: 'The long exchange',
  summary: 'Twelve messages between the app and the API.',
  data: {
    kind: 'system',
    lanes: [
      { id: 'app', label: 'App', status: 'new' },
      { id: 'api', label: 'API', status: 'changed' },
    ],
    steps: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, from: i % 2 ? 'api' : 'app', to: i % 2 ? 'app' : 'api', label: `Message ${i + 1}` })),
  },
};
/** 80 boxes in 8 areas of 10, each a small tree, each area's first box calling the next area's. */
const TREE = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 4],
  [1, 5],
  [2, 6],
  [2, 7],
  [3, 8],
  [3, 9],
];
const areas = Array.from({ length: 8 }, (_, g) => ({ id: `g${g}`, label: `Service area ${g + 1}` }));
const eighty: TestItem = {
  key: 'eighty',
  title: 'Every service',
  summary: 'Eighty boxes.',
  data: {
    kind: 'system',
    groups: areas,
    nodes: areas.flatMap((_, g) => Array.from({ length: 10 }, (_, k) => ({ id: `g${g}n${k}`, label: `Component ${g + 1}.${k + 1}`, group: `g${g}`, status: 'new' }))),
    edges: [
      ...areas.flatMap((_, g) => TREE.map(([a, b]) => ({ id: `g${g}e${a}-${b}`, from: `g${g}n${a}`, to: `g${g}n${b}` }))),
      ...areas.slice(1).map((_, i) => ({ id: `next${i}`, from: `g${i}n0`, to: `g${i + 1}n0` })),
    ],
  },
};
/** System flow draws the wide chain, States the tall exchange, and Security one area of the eighty boxes. */
function shapes() {
  const plain = (id: string, caption: string) => ({ id, drawing: null, steps: [say(caption)] });
  return {
    chapters: [
      plain('purpose', 'A request path, a long exchange and eighty boxes.'),
      { id: 'flow', drawing: { kind: 'diagram', itemId: 'architecture-chain' }, steps: [say('A request goes all the way down.', [0, 1, 2, 3, 4].map((i) => `edge:c${i}`))] },
      plain('data', 'Nothing new is stored.'),
      { id: 'states', drawing: { kind: 'flow', itemId: 'flows-exchange' }, steps: [say('They talk twelve times.', Array.from({ length: 12 }, (_, i) => `step:${i + 1}`))] },
      { id: 'security', drawing: { kind: 'diagram', itemId: 'architecture-eighty' }, steps: [say('Area 4 is the one that matters.', TREE.map(([a, b]) => `edge:g3e${a}-${b}`))] },
      plain('failure', 'A failed call is retried once.'),
      plain('rollback', 'Turn it off; nothing else depends on it.'),
    ],
  };
}

test.describe('at 1280 x 800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("the board takes its chapter's shape, and opening Present brings the caption and ▶ into view", async ({ page }) => {
    const p = await importProject('present-shapes', 'Present shapes', { architecture: [chain, eighty], flows: [exchange] });
    await writeDefense(p, { ...defenseInput(), presenter: shapes() });
    await page.goto(`${p.url}/defense`);
    await page.getByRole('tab', { name: 'Present' }).click();
    await expect(page.getByTestId('present-step')).toHaveText('Step 1 of 1');
    const board = page.getByTestId('board');
    /** Goes to a chapter from the list beside the board, waits for its last part, and gives the board's height. */
    const chapter = async (name: string, last: string) => {
      await page.getByRole('navigation', { name: 'Chapters' }).getByRole('button', { name }).click();
      await expect(board.locator(`[data-ref="${last}"]`).first()).toBeVisible();
      return (await board.boundingBox())!.height;
    };
    /** The caption and ▶ are in the window, with nothing scrolled since Present opened. */
    const inView = async (where: string) => {
      for (const id of ['present-caption', 'present-next']) {
        const box = (await page.getByTestId(id).boundingBox())!;
        expect(box.y, `${where}: ${id}`).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, `${where}: ${id}`).toBeLessThanOrEqual(800);
      }
    };
    const wide = await chapter('2. System flow', 'edge:c4');
    await inView('the wide chain');
    const tall = await chapter('4. States', 'step:12');
    await chapter('5. Security', 'edge:g3e3-9');
    await inView('one area of eighty boxes');
    // A wide drawing gets a short board, not a thin band in a tall one; a tall drawing a taller board.
    expect(wide).toBeLessThan(tall);
  });
});

test('a defense written before Present says so, and Regenerate is the main action', async ({ page }) => {
  const p = await importProject('present-old', 'Present old');
  await writeDefense(p);
  // A defense saved before Plan 7: the same file, without its presenter.
  const file = path.join(readJson('settings.json').projectsFolder, p.repo, p.project, 'whiteboard', 'defense.json');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete saved.presenter;
  fs.writeFileSync(file, JSON.stringify(saved, null, 2));
  await page.goto(`${p.url}/defense?mode=present`);
  await expect(page.getByTestId('present-old')).toHaveText('This defense was written before Present. Regenerate it to present it.');
  await expect(page.getByTestId('present')).toHaveCount(0);
  const regenerate = page.getByTestId('defense-generate');
  await expect(regenerate).toHaveText('Regenerate');
  await expect(regenerate).toHaveClass(/bg-button/);
});

test("the smoke run's look at Present passes on a real board", async () => {
  test.setTimeout(120_000);
  const p = await presented('present-smoke');
  const tmp = e2eTmp();
  // As smoke-claude.sh runs it: this run's dev-plumbing home, and your own HOME, where Playwright keeps its browsers.
  // The service is up, so it leaves it running.
  const env = { ...process.env, DEV_PLUMBING_HOME: path.join(tmp, '.dev-plumbing') };
  const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'smoke-present.mjs'), tmp, p.project], { env, encoding: 'utf8' });
  expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
  expect(run.stdout).toContain('Parts the steps revealed, drawn: 9 of 9');
  expect(run.stdout).toContain("Notes with a part, listed at the board's foot (should be none): none");
  expect(run.stdout).toContain('Full screen on a phone held sideways: the caption and ▶ fit without scrolling');
  expect(run.stdout).toContain('Present look passed.');
  expect(fs.readdirSync(path.join(tmp, 'present')).sort()).toEqual([
    '1280-1-purpose.png',
    '1280-2-flow.png',
    '1280-3-data.png',
    '1280-4-states.png',
    '1280-5-security.png',
    '1280-6-failure.png',
    '1280-7-rollback.png',
    'dark-1280.png',
    'fullscreen-1280.png',
    'fullscreen-812x375.png',
  ]);
});
