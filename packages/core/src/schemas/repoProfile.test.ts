import { describe, expect, it } from 'vitest';
import { normalizeRemote, repoProfileSchema } from './repoProfile';

describe('repo profiles', () => {
  it('normalizes the three common remote forms to the same key', () => {
    expect(normalizeRemote('git@github.com:Acme/acme.git')).toBe('github.com/acme/acme');
    expect(normalizeRemote('https://github.com/Acme/acme.git')).toBe('github.com/acme/acme');
    expect(normalizeRemote('ssh://git@github.com/acme/acme')).toBe('github.com/acme/acme');
  });

  it('fills defaults for optional fields', () => {
    const p = repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'] });
    expect(p.linkIntoClones).toEqual({ enabled: false, linkName: 'dev-plumbing' });
    expect(p.apps).toEqual([]);
    expect(p.sensitiveData).toEqual([]);
  });

  it("accepts only ~, ~/… or absolute paths for a profile's projects folder", () => {
    const base = { name: 'acme', match: ['github.com/acme/acme'] };
    const bad = repoProfileSchema.safeParse({ ...base, projectsFolder: 'dev-plumbing-projects' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]).toMatchObject({ path: ['projectsFolder'], message: 'Use a full path, like ~/dev-plumbing-projects.' });
    expect(repoProfileSchema.safeParse({ ...base, projectsFolder: '~/x' }).success).toBe(true);
    expect(repoProfileSchema.safeParse({ ...base, projectsFolder: '/abs/x' }).success).toBe(true);
  });

  it('needs at least one remote to match', () => {
    expect(repoProfileSchema.safeParse({ name: 'acme', match: [] }).success).toBe(false);
  });
});
