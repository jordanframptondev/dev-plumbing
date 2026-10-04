import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { repoProfileSchema } from '../src/schemas';
import { detectFilePath, finishDetect, lastDetected, mergeDetected, pendingDetect, requestDetect } from '../src/store/detect';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

const at = (time: string) => new Date(`2026-10-03T${time}Z`);

describe('Detect again requests', () => {
  it('stay pending until detection finishes, which records when it ran', async () => {
    const dir = tempDir('dp-detect-');
    expect(await pendingDetect(dir, 'acme-app')).toBe(false);
    expect(await lastDetected(dir)).toEqual({});
    await requestDetect(dir, 'acme-app', at('09:00:00'));
    await requestDetect(dir, 'acme-admin', at('09:01:00'));
    expect(await pendingDetect(dir, 'acme-app')).toBe(true);
    expect(JSON.parse(await fs.readFile(path.join(dir, 'run', 'detect.json'), 'utf8'))).toEqual({
      'acme-app': { requestedAt: '2026-10-03T09:00:00.000Z' },
      'acme-admin': { requestedAt: '2026-10-03T09:01:00.000Z' },
    });

    await finishDetect(dir, 'acme-app', at('09:05:00'));
    expect(await pendingDetect(dir, 'acme-app')).toBe(false);
    expect(await pendingDetect(dir, 'acme-admin')).toBe(true);
    expect(await lastDetected(dir)).toEqual({ 'acme-app': '2026-10-03T09:05:00.000Z' });

    // Asking again keeps when it last ran.
    await requestDetect(dir, 'acme-app', at('10:00:00'));
    expect(await pendingDetect(dir, 'acme-app')).toBe(true);
    expect(await lastDetected(dir)).toEqual({ 'acme-app': '2026-10-03T09:05:00.000Z' });
  });

  it('record a first detection, which had no request', async () => {
    const dir = tempDir('dp-detect-');
    await finishDetect(dir, 'new-thing', at('11:00:00'));
    expect(await pendingDetect(dir, 'new-thing')).toBe(false);
    expect(await lastDetected(dir)).toEqual({ 'new-thing': '2026-10-03T11:00:00.000Z' });
  });

  it('read a damaged file as no requests, and replace it with the next one', async () => {
    const dir = tempDir('dp-detect-');
    await fs.mkdir(path.join(dir, 'run'));
    await fs.writeFile(detectFilePath(dir), 'nope');
    expect(await pendingDetect(dir, 'acme-app')).toBe(false);
    expect(await lastDetected(dir)).toEqual({});
    await requestDetect(dir, 'acme-app', at('09:00:00'));
    expect(await pendingDetect(dir, 'acme-app')).toBe(true);
    // Names that are also Object's own keys are only ever plain entries.
    expect(await pendingDetect(dir, 'constructor')).toBe(false);
  });
});

describe('merging a detected profile', () => {
  const existing = repoProfileSchema.parse({
    name: 'acme-app',
    match: ['github.com/acme/acme-app', 'gitlab.example.com/acme/acme-app'],
    projectsFolder: '~/Source/acme-plumbing',
    linkIntoClones: { enabled: true, linkName: 'plumbing' },
    planFolders: ['docs/specs'],
    schema: { type: 'prisma', path: 'packages/db/prisma/schema.prisma' },
    conventions: ['Ids use uuid()'],
    apps: [{ name: 'web', path: 'apps/web', kitFiles: ['apps/web/app/globals.css'] }],
    sensitiveData: ['PII'],
  });

  it("replaces only what detection finds, and keeps the name, the remotes and the user's own settings", () => {
    const detected = repoProfileSchema.parse({
      name: 'acme',
      match: ['github.com/acme/acme-app'],
      planFolders: ['docs/plans'],
      schema: { type: 'sql', path: 'db/schema.sql' },
      conventions: ['Foreign keys are named <model>Id'],
      apps: [{ name: 'admin', path: 'apps/admin', kitFiles: [] }],
      sensitiveData: ['payments'],
    });
    expect(mergeDetected(existing, detected)).toEqual({
      name: 'acme-app',
      match: ['github.com/acme/acme-app', 'gitlab.example.com/acme/acme-app'],
      projectsFolder: '~/Source/acme-plumbing',
      linkIntoClones: { enabled: true, linkName: 'plumbing' },
      planFolders: ['docs/plans'],
      schema: { type: 'sql', path: 'db/schema.sql' },
      conventions: ['Foreign keys are named <model>Id'],
      apps: [{ name: 'admin', path: 'apps/admin', kitFiles: [] }],
      sensitiveData: ['payments'],
    });
  });

  it('drops the schema when detection finds none', () => {
    const merged = mergeDetected(existing, repoProfileSchema.parse({ name: 'acme-app', match: ['github.com/acme/acme-app'] }));
    expect('schema' in merged).toBe(false);
    expect(merged).toMatchObject({ planFolders: [], conventions: [], apps: [], sensitiveData: [], projectsFolder: '~/Source/acme-plumbing' });
  });
});
