// Present, drawn for real. After scripts/smoke-claude.sh's run, this opens the Whiteboard Defense's Present mode on the
// run's own project, in Playwright's Chromium, and steps through every step of the presenter Claude wrote. It uses the
// run's temporary dev-plumbing home and its service (port 45461), never 4545 or your real ~/.dev-plumbing: it starts
// that service when it isn't running, and then always stops it again.
// It checks, at every step:
// - every part the steps so far revealed is drawn (data-ref on a board-shape), of those the whiteboard pack lists for the
//   chapter's drawing, so a part the web lays out differently from core is caught;
// - no note with a part to sit by (`near` isn't "") is in the list at the board's foot, which means its part wasn't drawn;
// - the page logs no errors.
// It saves screenshots in <work>/present/: each chapter's last step at 1280 x 800, then full screen at 1280 x 800, full
// screen at 812 x 375 (a phone held sideways) and the page in dark mode (the run's theme setting is put back after). It
// exits non-zero when any check fails.
//   DEV_PLUMBING_HOME=<work>/.dev-plumbing node scripts/smoke-present.mjs <work> [project]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [work, project = 'restock-reminders'] = process.argv.slice(2);
const dir = process.env.DEV_PLUMBING_HOME;
if (!work || !dir || !path.resolve(dir).startsWith(path.resolve(work))) throw new Error("Run this from scripts/smoke-claude.sh, with the run's DEV_PLUMBING_HOME inside its folder.");
const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
if (settings.port === 4545) throw new Error("The run's home uses port 4545, the real service's. This look never does.");
const log = (msg) => console.log(`[present] ${msg}`);
const cli = (command) => execFileSync(process.execPath, [path.join(root, 'packages', 'cli', 'dist', 'index.js'), command], { env: process.env, encoding: 'utf8' }).trim();
// Playwright comes with the web package's dev dependencies, as the e2e tests use it.
const { chromium } = createRequire(path.join(root, 'packages', 'web', 'package.json'))('@playwright/test');

const P = `/api/projects/acme-app/${project}`;
const CHAPTER_COUNT = 7;
/** A drawing as the pack keys it: diagram:<item id>, tables or flow:<item id>. */
const drawingKey = (d) => (d.kind === 'tables' ? 'tables' : `${d.kind}:${d.itemId}`);

const out = path.join(work, 'present');
fs.mkdirSync(out, { recursive: true });
const started = !cli('status').startsWith('Running');
if (started) log(cli('start'));
const run = JSON.parse(fs.readFileSync(path.join(dir, 'run', 'service.json'), 'utf8'));
const base = `http://localhost:${run.port}`;
async function call(route, method = 'GET', body) {
  const res = await fetch(`http://127.0.0.1:${run.port}${route}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-dev-plumbing-token': run.token },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${route} answered ${res.status}: ${(await res.json().catch(() => null))?.error ?? 'no message'}`);
  return res.json();
}

const failures = [];
let browser = null;
let themeChanged = false;
try {
  const presenter = (await call(`${P}/whiteboard`)).defense?.presenter;
  if (!presenter?.chapters.length) throw new Error('The saved defense has no presenter to look at.');
  // The parts each chapter's drawing has, as the whiteboard subagent's pack lists them (the route only reads).
  const pack = await call('/api/claude/context', 'POST', { repo: 'acme-app', project, whiteboard: true });
  const partsOf = new Map((pack.drawings ?? []).map((o) => [drawingKey(o.drawing), new Set(o.parts.map((p) => p.ref))]));

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/p/acme-app/${project}/defense?mode=present`);
  const stepLine = page.getByTestId('present-step');
  const board = page.getByTestId('board');
  /** Once the step on show is chapter c's step s, and its board has laid out. */
  const at = async (c, s) => {
    const n = presenter.chapters[c].steps.length;
    await page.getByRole('heading', { name: `${c + 1}. ${presenter.chapters[c].title}` }).waitFor();
    await page.waitForFunction((text) => document.querySelector('[data-testid=present-step]')?.textContent === text, `Step ${s + 1} of ${n}`);
    await page.waitForFunction(() => !document.querySelector('[data-testid=board]')?.textContent?.includes('Drawing…'));
  };

  const missing = [];
  const listed = [];
  let steps = 0;
  let checked = 0;
  for (const [c, chapter] of presenter.chapters.entries()) {
    const parts = chapter.drawing ? (partsOf.get(drawingKey(chapter.drawing)) ?? new Set()) : new Set();
    for (const s of chapter.steps.keys()) {
      await at(c, s);
      steps++;
      const expected = new Set(chapter.steps.slice(0, s + 1).flatMap((step) => step.reveal).filter((ref) => parts.has(ref)));
      const drawn = new Set(await board.locator('[data-testid=board-shape]').evaluateAll((els) => els.map((el) => el.getAttribute('data-ref'))));
      checked += expected.size;
      for (const ref of expected) if (!drawn.has(ref)) missing.push(`${chapter.id} step ${s + 1}: ${ref}`);
      const foot = await board.locator('li[data-testid=board-note]').evaluateAll((els) => els.map((el) => el.getAttribute('data-near')).filter(Boolean));
      for (const near of foot) listed.push(`${chapter.id} step ${s + 1}: a note near ${near}`);
      if (s === chapter.steps.length - 1) {
        // Let the step's parts finish drawing in.
        await page.waitForTimeout(2500);
        await page.screenshot({ path: path.join(out, `1280-${c + 1}-${chapter.id}.png`) });
      }
      if (c < presenter.chapters.length - 1 || s < chapter.steps.length - 1) await page.keyboard.press('ArrowRight');
    }
  }
  log(`${presenter.chapters.length} chapters, ${steps} steps. Parts the steps revealed, drawn: ${checked - missing.length} of ${checked}${missing.length ? `; not drawn: ${missing.join('; ')}` : ''}`);
  log(`Notes with a part, listed at the board's foot (should be none): ${listed.length ? listed.join('; ') : 'none'}`);
  if (presenter.chapters.length !== CHAPTER_COUNT) failures.push(`The presenter has ${presenter.chapters.length} chapters, not ${CHAPTER_COUNT}.`);
  if (missing.length) failures.push(`Parts a step revealed weren't drawn: ${missing.join('; ')}.`);
  if (listed.length) failures.push(`Notes were listed at the board's foot instead of by their part: ${listed.join('; ')}.`);

  // The chapter with the most parts revealed, at its last step, in full screen, then on a phone held sideways.
  const busiest = presenter.chapters.reduce((best, ch, i) => (ch.steps.flatMap((s) => s.reveal).length > presenter.chapters[best].steps.flatMap((s) => s.reveal).length ? i : best), 0);
  await page.getByRole('button', { name: `${busiest + 1}. ${presenter.chapters[busiest].title}` }).click();
  await page.keyboard.press('End');
  await at(busiest, presenter.chapters[busiest].steps.length - 1);
  await page.getByTestId('present-fullscreen').click();
  await page.getByTestId('present-overlay').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'fullscreen-1280.png') });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 812, height: 375 });
  await page.getByTestId('present-fullscreen').click();
  const overlay = page.getByTestId('present-overlay');
  await overlay.waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'fullscreen-812x375.png') });
  const fits = await overlay.evaluate((el) => {
    const inView = (id) => {
      const r = el.querySelector(`[data-testid=${id}]`)?.getBoundingClientRect();
      return Boolean(r) && r.top >= 0 && r.bottom <= window.innerHeight;
    };
    return el.scrollHeight <= el.clientHeight && inView('present-caption') && inView('present-next');
  });
  log(`Full screen on a phone held sideways: the caption and ▶ ${fits ? 'fit without scrolling' : "don't fit"}`);
  if (!fits) failures.push("On a phone held sideways, full screen's caption and ▶ don't fit without scrolling.");
  await page.keyboard.press('Escape');

  // Dark mode, at 1280 x 800, whatever the run's theme setting is: it's set to dark, and put back below.
  await call('/api/settings', 'PUT', { theme: 'dark' });
  themeChanged = true;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await page.getByRole('button', { name: `${busiest + 1}. ${presenter.chapters[busiest].title}` }).click();
  await page.keyboard.press('End');
  await at(busiest, presenter.chapters[busiest].steps.length - 1);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'dark-1280.png') });

  log(`Errors the page logged (should be none): ${errors.length ? errors.join(' | ') : 'none'}`);
  if (errors.length) failures.push(`The page logged ${errors.length} errors: ${errors.join(' | ')}`);
  log(`Screenshots: ${out}`);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
} finally {
  await browser?.close();
  if (themeChanged) await call('/api/settings', 'PUT', { theme: settings.theme ?? 'system' }).catch((e) => failures.push(`The theme setting couldn't be put back: ${e.message}`));
  if (started) log(cli('stop'));
}
if (failures.length) {
  log(`Present look failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else log('Present look passed.');
