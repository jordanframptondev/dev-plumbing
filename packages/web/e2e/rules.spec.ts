import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { configPath, noSideScroll } from './env';

const restore = (rel: string) => {
  const raw = fs.readFileSync(configPath(rel), 'utf8');
  return () => fs.writeFileSync(configPath(rel), raw);
};

test('lists every plumbing type from its rules file, and the output rules', async ({ page }) => {
  await page.goto('/rules');
  await expect(page.getByTestId('rule-row')).toHaveCount(10);
  await expect(page.getByTestId('rule-row').first()).toContainText('Architecture');
  await expect(page.getByTestId('rule-row').first()).toContainText('diagram');
  await expect(page.getByRole('link', { name: 'finalize.md' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'whiteboard-defense.md' })).toBeVisible();
});

test('editing a rules file changes the project sidebar', async ({ page }) => {
  const undo = restore('plumbing/ideas.md');
  try {
    await page.goto('/rules');
    await page.getByTestId('rule-row').filter({ hasText: 'Ideas' }).click();
    const editor = page.getByRole('textbox', { name: 'ideas.md' });
    const text = await editor.inputValue();
    await editor.fill(text.replace('title: Ideas', 'title: Ideas and wishes'));
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await page.goto('/p/acme/restock-reminders');
    await expect(page.getByRole('complementary', { name: 'Project navigation' }).getByTestId('nav-type-ideas')).toContainText('Ideas and wishes');
  } finally {
    undo();
  }
});

test('a broken header is refused with the reason', async ({ page }) => {
  const undo = restore('plumbing/ideas.md');
  try {
    await page.goto('/rules/ideas.md');
    await page.getByRole('textbox', { name: 'ideas.md' }).fill('no header here');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('Header field');
    expect(fs.readFileSync(configPath('plumbing/ideas.md'), 'utf8')).toMatch(/^---\nid: ideas/);
  } finally {
    undo();
  }
});

test('a file broken on disk is listed with its problem and left out of projects', async ({ page }) => {
  const undo = restore('plumbing/ideas.md');
  try {
    fs.writeFileSync(configPath('plumbing/ideas.md'), 'broken');
    await page.goto('/rules');
    await expect(page.getByTestId('broken-rule')).toContainText('ideas.md');
    await expect(page.getByTestId('rule-row')).toHaveCount(9);
    await page.goto('/p/acme/restock-reminders');
    await expect(page.getByTestId('nav-type-ideas')).toHaveCount(0);
  } finally {
    undo();
  }
});

test('adds a new plumbing type that shows up in every project', async ({ page }) => {
  try {
    await page.goto('/rules');
    await page.getByRole('button', { name: '+ Plumbing type' }).click();
    await page.getByLabel('Id').fill('rollout');
    await page.getByLabel('Title').fill('Rollout');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/rules\/rollout\.md$/);
    await page.goto('/p/acme/restock-reminders');
    await expect(page.getByRole('complementary', { name: 'Project navigation' }).getByTestId('nav-type-rollout')).toContainText('Rollout');
  } finally {
    fs.rmSync(configPath('plumbing/rollout.md'), { force: true });
  }
});

test('preview shows the rules as formatted text', async ({ page }) => {
  await page.goto('/rules/database.md');
  await page.getByRole('tab', { name: 'Preview' }).click();
  await expect(page.getByRole('heading', { name: 'Rules' })).toBeVisible();
});

test('output rules can be edited and reset', async ({ page }) => {
  const undo = restore('outputs/finalize.md');
  page.on('dialog', (d) => d.accept());
  try {
    await page.goto('/rules/outputs/finalize.md');
    await page.getByRole('textbox', { name: 'finalize.md' }).fill('# Mine');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await page.getByRole('button', { name: 'Reset to default' }).click();
    await expect(page.getByRole('textbox', { name: 'finalize.md' })).toHaveValue(/Finalize spec rules/);
  } finally {
    undo();
  }
});

test('Reset to default drops unsaved edits even when the file is already the default', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const undo = restore('outputs/whiteboard-defense.md');
  try {
    await page.goto('/rules/outputs/whiteboard-defense.md');
    const editor = page.getByRole('textbox', { name: 'whiteboard-defense.md' });
    const original = await editor.inputValue();
    await editor.fill('# unsaved edits');
    await page.getByRole('button', { name: 'Reset to default' }).click();
    await expect(page.getByRole('status')).toHaveText('Reset to default.');
    await expect(editor).toHaveValue(original);
  } finally {
    undo();
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('no sideways scrolling on the list or the editor', async ({ page }) => {
    await page.goto('/rules');
    expect(await noSideScroll(page)).toEqual([]);
    await page.goto('/rules/database.md');
    expect(await noSideScroll(page)).toEqual([]);
  });
});
