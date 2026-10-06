import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { api, asClaude, fixtureRepo, importProject, rawItem, type TestItem } from './claude';
import { noSideScroll } from './env';

const both = { id: 'both', label: 'SMS and email', change: { md: [{ find: 'Send by SMS.', replace: 'Send by SMS and email.' }] } };
const channels: TestItem = { key: 'channels', title: 'Which channels?', summary: 'SMS, email or both.', message: { text: 'SMS, email or both?', options: [both] } };
const log: TestItem = { key: 'log', title: 'How long to keep reminder rows?', summary: 'Retention for the reminder log.', message: { text: 'Keep them for 180 days?' } };
/** The repo's new Channels paragraph: one long line, as plan paragraphs often are. */
const PUSH =
  "Send by SMS and push. Push goes to the mobile app first, and a customer who has turned push off, or who hasn't opened the app in the last thirty days, gets the SMS instead, so every customer hears about a restock once and only once, whatever their settings and whichever device they use.";
/** The plan's v2 in the repo: Data is gone, and Channels says something else than your draft does. */
const V2 = `# Plan update\n\nRemind customers before an item runs out.\n\n## Channels\n\n${PUSH}\n`;

test("a passage both sides changed becomes a Plan changes thread, and a removed section's question is parked", async ({ page }) => {
  const p = await importProject('plan-update', 'Plan update', { questions: [channels, log] });
  const P = `/api/projects/${p.repo}/${p.project}`;
  // Your draft moves on first: accepting the option changes Channels.
  await api(`${P}/threads/t-questions-channels/draft`, 'PUT', { optionId: 'both' });
  await api(`${P}/submit`, 'POST', { scope: 'thread', threadId: 't-questions-channels' });

  // Then the repo's plan changes Channels too, and drops Data. Claude brings it in, and the importers run again.
  fs.writeFileSync(path.join(fixtureRepo(), 'docs/specs/plan-update.md'), V2);
  const open = await asClaude('/open', { cwd: fixtureRepo(), plan: 'docs/specs/plan-update.md', update: true });
  expect(open).toMatchObject({ kind: 'updated', version: 2, merged: { clean: 1, conflicts: 1 } });
  for (const t of open.importTypes as { id: string }[]) {
    await asClaude('/items', {
      repo: p.repo,
      project: p.project,
      type: t.id,
      cwd: fixtureRepo(),
      // Questions says v2 took out the part How long to keep reminder rows? came from. Which channels? is untouched.
      ...(t.id === 'questions' ? { removed: ['log'] } : { noChanges: 'Nothing changed for this type.' }),
    });
  }
  const [conflict] = (await api(`${P}/types/plan-changes`)).items;

  // Plan changes shows up once there's a conflict, first in the navigation.
  await page.goto(p.url);
  const nav = page.getByRole('complementary', { name: 'Project navigation' });
  await expect(nav.getByTestId(/^nav-type-/).first()).toHaveAttribute('data-testid', 'nav-type-plan-changes');
  await nav.getByTestId('nav-type-plan-changes').click();
  await expect(page.getByRole('heading', { name: 'Plan changes', exact: true })).toBeVisible();
  const row = page.getByTestId('list-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Channels');
  await expect(row).toContainText("Your draft and the repo's v2 both changed this passage.");
  await expect(row).toContainText('with Claude');

  // Its body shows the three versions of the passage.
  await page.goto(`${p.url}/th/${conflict.threadId}`);
  await expect(page.getByText("Your draft and the repo's v2 both changed this passage. Claude is proposing a merged version.")).toBeVisible();
  const item = page.getByRole('region', { name: 'Item' });
  for (const label of ['Your draft', 'The repo (v2)', 'Before (v1)']) await expect(item.getByText(label, { exact: true })).toBeVisible();
  const blocks = item.locator('pre');
  await expect(blocks).toHaveCount(3);
  await expect(blocks.nth(0)).toContainText('Send by SMS and email.');
  await expect(blocks.nth(1)).toContainText('Send by SMS and push.');
  await expect(blocks.nth(2)).toContainText('Send by SMS.');
  // The repo's long line wraps inside its block, on a phone too.
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await noSideScroll(page)).toEqual([]);
  expect(await blocks.nth(1).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  // As Claude: the listening window gets the conflict, and offers three choices, each ready to accept.
  const wait = await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-plan-update', timeoutSeconds: 0 });
  expect(wait.kind).toBe('submission');
  expect(wait.groups.flatMap((g: { threads: string[] }) => g.threads)).toEqual([conflict.threadId]);
  await asClaude('/reply', {
    repo: p.repo,
    project: p.project,
    threadId: conflict.threadId,
    text: 'You added email and the repo added push. This keeps both.',
    options: [
      { id: 'merged', label: 'SMS, email and push', change: { md: [{ find: 'Send by SMS and email.', replace: 'Send by SMS, email and push.' }] } },
      { id: 'theirs', label: "Take the repo's version", change: { md: [{ find: 'Send by SMS and email.', replace: PUSH }] } },
      { id: 'keep', label: 'Keep my draft', change: { md: [] } },
    ],
    recommended: 'merged',
  });

  // You accept it, and the draft has the merged text.
  await page.getByRole('radio', { name: /SMS, email and push/ }).check();
  await page.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByText('Applied and resolved.')).toBeVisible();
  await nav.getByRole('link', { name: 'Draft (v2)', exact: true }).click();
  await expect(page.getByTestId('document')).toContainText('Send by SMS, email and push.');
  await expect(page.getByTestId('document')).not.toContainText('Log reminders in a table.');

  // The question about the removed Data section is parked, kept, and says why.
  expect(rawItem(p, 'questions-log')).toMatchObject({ removedIn: 2 });
  await nav.getByTestId('nav-type-questions').click();
  const parked = page.getByTestId('list-row').filter({ hasText: 'How long to keep reminder rows?' });
  await expect(parked.getByRole('img', { name: 'Parked' })).toBeVisible();
  await expect(parked.getByTestId('removed-from-plan')).toHaveText('· removed from the plan in v2');
  await expect(page.getByTestId('removed-from-plan')).toHaveCount(1);

  // Finalize leaves it out, and says why. The settled conflict no longer blocks.
  await page.goto(`${p.url}/finalize`);
  const list = page.getByTestId('checklist-parked');
  await expect(list.getByRole('heading')).toHaveText('Parked: left out of the final');
  await expect(list).toContainText('How long to keep reminder rows?');
  await expect(list).toContainText('Removed from the plan in v2.');
  await expect(page.getByText('Nothing blocks Finalize.')).toBeVisible();
});
