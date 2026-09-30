import { expect, test } from '@playwright/test';
import { readJson, writeJson } from './env';

const bodyBackground = () => getComputedStyle(document.body).backgroundColor;

test('light mode uses a white canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(bodyBackground)).toBe('rgb(255, 255, 255)');
});

test('dark mode uses ink night', async ({ page }) => {
  const saved = readJson('settings.json');
  writeJson('settings.json', { ...saved, theme: 'dark' });
  try {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(bodyBackground)).toBe('rgb(30, 30, 29)');
  } finally {
    writeJson('settings.json', saved);
  }
});

test.describe('with the system set to dark', () => {
  test.use({ colorScheme: 'dark' });
  test('the "system" appearance follows it', async ({ page }) => {
    const saved = readJson('settings.json');
    writeJson('settings.json', { ...saved, theme: 'system' });
    try {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    } finally {
      writeJson('settings.json', saved);
    }
  });
});

test.describe('saved choice beats the system setting', () => {
  test.use({ colorScheme: 'dark' });
  test('saved "light" stays light on a dark system', async ({ page }) => {
    const saved = readJson('settings.json');
    writeJson('settings.json', { ...saved, theme: 'light' });
    try {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(await page.evaluate(bodyBackground)).toBe('rgb(255, 255, 255)');
    } finally {
      writeJson('settings.json', saved);
    }
  });
});

test.describe('with the system set to light', () => {
  test.use({ colorScheme: 'light' });
  test('"system" follows a live change of the system setting', async ({ page }) => {
    const saved = readJson('settings.json');
    writeJson('settings.json', { ...saved, theme: 'system' });
    try {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    } finally {
      writeJson('settings.json', saved);
    }
  });
});
