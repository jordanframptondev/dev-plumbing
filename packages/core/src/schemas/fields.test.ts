import { describe, expect, it } from 'vitest';
import { flatten, unflatten } from './fields';

describe('flatten and unflatten', () => {
  it('round-trips nested objects', () => {
    const value = { _comment: 'mine', port: 1, models: { thread: 'x', finalizer: 'y' } };
    expect(unflatten(flatten(value))).toEqual(value);
  });

  it('keeps a "__proto__" key from a file as plain data, without touching Object.prototype', () => {
    const fromFile = JSON.parse('{ "__proto__": { "polluted": true }, "port": 1 }');
    const out = unflatten(flatten(fromFile));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(out))).toEqual(fromFile);
  });

  it('replaces a non-object with an object when a nested key needs it', () => {
    expect(unflatten({ models: 'oops', 'models.thread': 'x' })).toEqual({ models: { thread: 'x' } });
  });
});
