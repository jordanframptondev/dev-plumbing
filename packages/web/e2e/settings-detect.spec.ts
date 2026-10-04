import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { api, asClaude, fixtureRepo } from './claude';
import { configPath, readJson, writeJson } from './env';

const DETECT_NOTE = 'Detection runs the next time a Claude window for this repo listens, or you run /dev-plumbing in a clone.';

test('Detect again re-detects a repo profile and keeps your own settings', async ({ page }) => {
  const saved = readJson('repos/acme-app.json');
  const detectFile = configPath('run/detect.json');
  const savedDetect = fs.existsSync(detectFile) ? fs.readFileSync(detectFile, 'utf8') : null;
  // Your own settings, which detection must keep: a projects folder (the one acme-app uses anyway, so nothing
  // moves) and a link name.
  const projectsFolder = path.join(readJson('settings.json').projectsFolder, 'acme-app');
  const linkIntoClones = { enabled: false, linkName: 'acme-plumbing' };
  writeJson('repos/acme-app.json', { ...saved, projectsFolder, linkIntoClones });
  try {
    await page.goto('/settings');
    const repo = page.getByTestId('repo-profile').filter({ hasText: 'acme-app' });
    await repo.getByTestId('detect-repo').click();
    await expect(repo.getByRole('status')).toHaveText(DETECT_NOTE);
    await expect(repo).toContainText('Detection requested');
    await expect(repo.getByTestId('detect-repo')).toBeEnabled();
    expect((await api('/api/config')).detect.pending).toContain('acme-app');

    // The repo-setup agent still may not choose where files go.
    await expect(
      asClaude('/repo-profile', { cwd: fixtureRepo(), profile: { name: 'acme-app', match: ['github.com/acme/acme-app'], projectsFolder: '/tmp/elsewhere' } }),
    ).rejects.toThrow(/projectsFolder/);
    // What it found this time: the same schema and app, and a new convention.
    await asClaude('/repo-profile', {
      cwd: fixtureRepo(),
      profile: { name: 'acme-app', match: ['github.com/acme/acme-app'], schema: saved.schema, apps: saved.apps, conventions: ['Ids use cuid()'] },
    });
    expect(readJson('repos/acme-app.json')).toMatchObject({
      name: 'acme-app',
      match: ['github.com/acme/acme-app'],
      projectsFolder,
      linkIntoClones,
      schema: saved.schema,
      apps: saved.apps,
      conventions: ['Ids use cuid()'],
    });
    const config = await api('/api/config');
    expect(config.detect.pending).not.toContain('acme-app');
    expect(config.detect.last).toHaveProperty('acme-app');

    await page.reload();
    await expect(repo).toContainText('Last detected just now');
    await expect(repo.getByRole('status')).toHaveCount(0);
    await expect(repo.getByTestId('detect-repo')).toBeEnabled();
    // Edit opens on the detected profile.
    await repo.getByRole('button', { name: 'Edit' }).click();
    await expect(repo.getByRole('textbox', { name: 'acme-app profile' })).toHaveValue(/Ids use cuid\(\)/);
  } finally {
    // A detect left pending would turn every later /open for acme-app into needs-profile.
    writeJson('repos/acme-app.json', saved);
    if (savedDetect === null) fs.rmSync(detectFile, { force: true });
    else fs.writeFileSync(detectFile, savedDetect);
  }
});
