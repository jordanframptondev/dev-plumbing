import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';

export const E2E_PORT = 45459;
export const repoRoot = path.resolve(import.meta.dirname, '../../..');
export const cliPath = path.join(repoRoot, 'packages/cli/dist/index.js');
export const marker = path.join(os.tmpdir(), 'dev-plumbing-e2e-current');

export const e2eTmp = () => fs.readFileSync(marker, 'utf8').trim();
export const setE2eTmp = (dir: string) => fs.writeFileSync(marker, dir);
export const e2eEnv = (tmp = e2eTmp()) => ({ ...process.env, HOME: tmp, DEV_PLUMBING_HOME: path.join(tmp, '.dev-plumbing') });
export const configPath = (rel: string) => path.join(e2eTmp(), '.dev-plumbing', rel);
export const readJson = (rel: string) => JSON.parse(fs.readFileSync(configPath(rel), 'utf8'));
export const writeJson = (rel: string, value: unknown) => fs.writeFileSync(configPath(rel), JSON.stringify(value, null, 2));

/** Returns the elements that stick out past the right edge. An empty list means no sideways scrolling. */
export function noSideScroll(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= width) return [];
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className)}`.slice(0, 120));
  });
}
