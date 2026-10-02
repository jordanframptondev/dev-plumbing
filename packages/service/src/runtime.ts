import { LiveEvents } from './events';
import { Listeners } from './listeners';
import { createLocks, type WithLock } from './lock';

export type Runtime = { events: LiveEvents; listeners: Listeners; withLock: WithLock; pingMs: number };

export const projectKey = (repo: string, id: string) => `${repo}/${id}`;

export function createRuntime(o: { now?: () => number; aliveMs?: number; pingMs?: number } = {}): Runtime {
  const events = new LiveEvents();
  const listeners = new Listeners({
    now: o.now,
    aliveMs: o.aliveMs,
    onChange: (key) => {
      const slash = key.indexOf('/');
      events.projectChanged(key.slice(0, slash), key.slice(slash + 1));
    },
  });
  return { events, listeners, withLock: createLocks(), pingMs: o.pingMs ?? 25_000 };
}
