import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configDir, expandHome } from '../src/paths';

describe('paths', () => {
  it('expands ~ and keeps spaces', () => {
    expect(expandHome('~/my projects', '/Users/a')).toBe('/Users/a/my projects');
    expect(expandHome('~', '/Users/a')).toBe('/Users/a');
  });

  it('makes relative paths absolute and leaves absolute paths alone', () => {
    expect(expandHome('/tmp/x', '/Users/a')).toBe('/tmp/x');
    expect(path.isAbsolute(expandHome('rel/x', '/Users/a'))).toBe(true);
  });

  it('uses DEV_PLUMBING_HOME when set', () => {
    expect(configDir({ DEV_PLUMBING_HOME: '/tmp/dp' })).toBe('/tmp/dp');
    expect(configDir({})).toMatch(/\.dev-plumbing$/);
  });
});
