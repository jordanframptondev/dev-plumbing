import { LiveEvents } from './events';
import { Listeners } from './listeners';
import { createLocks, type WithLock } from './lock';

/** A Detect again request handed to a window: when (`at`, in ms), and `back` once that window came back from it. */
export type DetectHandout = { windowId: string; at: number; back: boolean };
/**
 * - detects: the Detect again requests handed out, by repo. Kept in memory, like the listeners.
 * - now: the listeners' clock, which the hand-outs use too (tests pass their own).
 */
export type Runtime = { events: LiveEvents; listeners: Listeners; withLock: WithLock; pingMs: number; detects: Map<string, DetectHandout>; now: () => number };

export const projectKey = (repo: string, id: string) => `${repo}/${id}`;

export function createRuntime(o: { now?: () => number; aliveMs?: number; pingMs?: number } = {}): Runtime {
  const now = o.now ?? (() => Date.now());
  const events = new LiveEvents();
  const listeners = new Listeners({
    now,
    aliveMs: o.aliveMs,
    onChange: (key) => {
      const slash = key.indexOf('/');
      events.projectChanged(key.slice(0, slash), key.slice(slash + 1));
    },
  });
  return { events, listeners, withLock: createLocks(), pingMs: o.pingMs ?? 25_000, detects: new Map(), now };
}
