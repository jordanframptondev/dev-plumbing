import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { configPath, noSideScroll, readJson, writeJson } from './env';

test('shows every setting with its help text', async ({ page }) => {
  await page.goto('/settings');
  const general = page.getByRole('region', { name: 'General' });
  await expect(general.getByText('Recent projects per page')).toBeVisible();
  await expect(general.getByText('How many recent plumbing projects the app home shows before Load more.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Agents' }).getByText('Subagents at once')).toBeVisible();
});

test('saves a change to settings.json', async ({ page }) => {
  const saved = readJson('settings.json');
  try {
    await page.goto('/settings');
    const general = page.getByRole('region', { name: 'General' });
    await general.getByRole('switch', { name: 'Auto-apply small edits' }).click();
    await general.getByRole('button', { name: 'Save' }).click();
    await expect(general.getByRole('status')).toHaveText('Saved.');
    expect(readJson('settings.json').autoApplySmallEdits).toBe(false);
  } finally {
    writeJson('settings.json', saved);
  }
});

test('refuses an invalid value and explains why', async ({ page }) => {
  await page.goto('/settings');
  const general = page.getByRole('region', { name: 'General' });
  await general.getByLabel('Port', { exact: true }).fill('80');
  await general.getByRole('button', { name: 'Save' }).click();
  await expect(general.getByText(/greater than or equal to 1024/)).toBeVisible();
  expect(readJson('settings.json').port).toBe(45459);
});

test('saves an agents setting', async ({ page }) => {
  const saved = readJson('agents.json');
  try {
    await page.goto('/settings');
    const agents = page.getByRole('region', { name: 'Agents' });
    await agents.getByLabel('Thread model').selectOption('haiku');
    await agents.getByRole('button', { name: 'Save' }).click();
    await expect(agents.getByRole('status')).toHaveText('Saved.');
    expect(readJson('agents.json').models.thread).toBe('haiku');
  } finally {
    writeJson('agents.json', saved);
  }
});

test('a broken settings file is listed as a problem and the page still works', async ({ page }) => {
  const raw = fs.readFileSync(configPath('settings.json'), 'utf8');
  try {
    fs.writeFileSync(configPath('settings.json'), '{ "port": ');
    await page.goto('/settings');
    await expect(page.getByTestId('config-problems')).toContainText("isn't valid JSON");
    await expect(page.getByRole('region', { name: 'General' })).toBeVisible();
  } finally {
    fs.writeFileSync(configPath('settings.json'), raw);
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('labels sit above their controls, one column', async ({ page }) => {
    await page.goto('/settings');
    const general = page.getByRole('region', { name: 'General' });
    const label = await general.getByText('Recent projects per page', { exact: true }).boundingBox();
    const input = await general.getByLabel('Recent projects per page').boundingBox();
    expect(label!.y).toBeLessThan(input!.y);
    expect(await noSideScroll(page)).toEqual([]);
  });
});
