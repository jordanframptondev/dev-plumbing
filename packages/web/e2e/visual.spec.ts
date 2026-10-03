import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { asClaude, fixtureRepo, PLAN_TEXT } from './claude';

test("a plumbing type whose importer didn't finish says so, in the nav and on its screen", async ({ page }) => {
  const rel = 'docs/specs/visual-unfinished.md';
  fs.mkdirSync(path.join(fixtureRepo(), 'docs', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(fixtureRepo(), rel), PLAN_TEXT('Visual unfinished'));
  const open = await asClaude('/open', { cwd: fixtureRepo(), plan: rel });
  // Every importer returns except Database's.
  for (const t of open.importTypes as { id: string }[]) {
    if (t.id === 'database') continue;
    await asClaude('/items', { repo: open.repo, project: open.project, type: t.id, cwd: fixtureRepo(), noChanges: 'Nothing for this type in the test plan.' });
  }
  // The window's next dp_wait ends the import (finishImport), marking the types that never wrote.
  await asClaude('/wait', { repo: open.repo, project: open.project, windowId: 'w-e2e-unfinished', timeoutSeconds: 0 });

  await page.goto(`/p/${open.repo}/${open.project}`);
  const nav = page.getByRole('complementary', { name: 'Project navigation' });
  await expect(nav.getByTestId('nav-type-database')).toContainText("Didn't finish");
  await expect(nav.getByTestId('nav-type-questions')).toContainText('No changes');
  await nav.getByTestId('nav-type-database').click();
  const failed = page.getByTestId('import-failed');
  await expect(failed.getByRole('heading')).toHaveText("Database: Didn't finish");
  await expect(failed).toContainText("The importer didn't finish for this plumbing type.");
  await expect(failed).not.toContainText("This plan doesn't change the database.");
  await expect(page.getByTestId('no-changes')).toHaveCount(0);
});
