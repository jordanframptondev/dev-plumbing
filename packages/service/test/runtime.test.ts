import { describe, expect, it } from 'vitest';
import { Listeners } from '../src/listeners';
import { createLocks } from '../src/lock';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('locks', () => {
  it('runs work for one key in order, and other keys alongside', async () => {
    const withLock = createLocks();
    const log: string[] = [];
    const job = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await sleep(ms);
      log.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([withLock('a', job('a1', 30)), withLock('a', job('a2', 1)), withLock('b', job('b1', 1))]);
    expect(results).toEqual(['a1', 'a2', 'b1']);
    expect(log.indexOf('end a1')).toBeLessThan(log.indexOf('start a2'));
    expect(log.indexOf('start b1')).toBeLessThan(log.indexOf('end a1'));
  });

  it('keeps going after a failure', async () => {
    const withLock = createLocks();
    await expect(withLock('a', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await withLock('a', async () => 'ok')).toBe('ok');
  });
});

describe('listening windows', () => {
  it('a window is listening, then busy, then gone when it goes quiet', () => {
    let t = 0;
    const changes: string[] = [];
    const l = new Listeners({ now: () => t, aliveMs: 90_000, onChange: (k) => changes.push(k) });
    expect(l.state('acme/x')).toBeNull();
    l.seen('w1', 'acme/x');
    expect(l.state('acme/x')).toBe('waiting');
    l.setBusy('w1', true);
    expect(l.state('acme/x')).toBe('busy');
    t = 100_000;
    l.sweep();
    expect(l.state('acme/x')).toBeNull();
    expect(l.isAlive('w1')).toBe(false);
    expect(changes).toEqual(['acme/x', 'acme/x', 'acme/x']);
  });

  it('wakes a waiting window when work arrives, and times out otherwise', async () => {
    const l = new Listeners();
    const woken = l.wait('w1', 'acme/x', 5_000);
    l.notify('acme/x');
    expect(await woken).toBe('notified');
    expect(await l.wait('w1', 'acme/x', 10)).toBe('timeout');
    const ac = new AbortController();
    const stopped = l.wait('w1', 'acme/x', 5_000, ac.signal);
    ac.abort();
    expect(await stopped).toBe('aborted');
  });

  it('a window inside a wait never counts as gone', async () => {
    let t = 0;
    const l = new Listeners({ now: () => t, aliveMs: 90_000 });
    const waiting = l.wait('w1', 'acme/x', 50);
    t = 10_000_000;
    expect(l.isAlive('w1')).toBe(true);
    expect(l.state('acme/x')).toBe('waiting');
    await waiting;
  });

  it('a ping during a wait does not keep the window alive forever', async () => {
    let t = 0;
    const l = new Listeners({ now: () => t, aliveMs: 90_000 });
    const waiting = l.wait('w1', 'acme/x', 20);
    l.seen('w1');
    await waiting;
    t = 200_000;
    expect(l.isAlive('w1')).toBe(false);
    expect(l.state('acme/x')).toBeNull();
  });
});
