import { describe, expect, it } from 'vitest';
import { defaultSettings, parseSettings, settingsFields } from './settings';

describe('settings', () => {
  it('has the defaults from the spec', () => {
    expect(defaultSettings).toEqual({
      port: 4545,
      projectsFolder: '~/dev-plumbing-projects',
      startAtLogin: true,
      openBrowserOnImport: true,
      autoApplySmallEdits: true,
      homePageSize: 10,
      theme: 'system',
    });
  });

  it('fills missing keys with defaults and reports nothing', () => {
    const r = parseSettings({ port: 5000 });
    expect(r.value.port).toBe(5000);
    expect(r.value.theme).toBe('system');
    expect(r.errors).toEqual([]);
  });

  it('falls back to the default for a bad value and reports it', () => {
    const r = parseSettings({ port: 'abc', theme: 'purple' });
    expect(r.value.port).toBe(4545);
    expect(r.value.theme).toBe('system');
    expect(r.errors.map((e) => e.key)).toEqual(['port', 'theme']);
    expect(r.errors[0].unknown).toBeUndefined();
  });

  it('refuses a port below 1024', () => {
    expect(parseSettings({ port: 80 }).errors[0].message).toMatch(/greater than or equal to 1024/);
  });

  it('accepts only ~, ~/… or absolute paths for the projects folder', () => {
    const relative = parseSettings({ projectsFolder: 'dev-plumbing-projects' });
    expect(relative.value.projectsFolder).toBe('~/dev-plumbing-projects');
    expect(relative.errors).toEqual([{ key: 'projectsFolder', message: 'Use a full path, like ~/dev-plumbing-projects.' }]);
    expect(parseSettings({ projectsFolder: './x' }).errors.map((e) => e.key)).toEqual(['projectsFolder']);
    for (const ok of ['~', '~/x', '/abs/x']) {
      const r = parseSettings({ projectsFolder: ok });
      expect(r.errors).toEqual([]);
      expect(r.value.projectsFolder).toBe(ok);
    }
  });

  it('reports unknown keys', () => {
    expect(parseSettings({ colour: 'red' }).errors).toEqual([{ key: 'colour', message: 'Unknown setting', unknown: true }]);
  });

  it('treats a non-object as all defaults', () => {
    expect(parseSettings(null).value).toEqual(defaultSettings);
    expect(parseSettings([1, 2]).value).toEqual(defaultSettings);
  });

  it('gives every field a label and a description', () => {
    for (const f of settingsFields) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(10);
    }
  });
});
