import type { ListeningState } from '@dev-plumbing/core';

type Window = { key: string; lastSeen: number; lastWait?: number; waits: number; busy: boolean };

/** How long after its last wait a window still counts as listening: the gap before its next poll. */
export const LISTEN_GAP_MS = 10_000;

/**
 * The Claude windows working on each plumbing project (key = "repo/id").
 * - A window is alive while it's inside a wait, or for `aliveMs` after it was last seen. The MCP server pings every 30 s.
 * - A live window is listening while it's inside a wait, or within LISTEN_GAP_MS of its last one. Pings alone don't count.
 * - A project is "waiting" if a live window is listening, "busy" if a live window is answering a submission, otherwise null.
 */
export class Listeners {
  private readonly windows = new Map<string, Window>();
  private readonly waiters = new Map<string, Set<() => void>>();
  private readonly lastStates = new Map<string, ListeningState>();

  constructor(private readonly o: { now?: () => number; aliveMs?: number; onChange?: (key: string) => void } = {}) {}

  private now(): number {
    return this.o.now?.() ?? Date.now();
  }

  /** Reports state changes for these keys (and only real changes). */
  private check(...keys: string[]): void {
    for (const key of new Set(keys)) {
      const state = this.state(key);
      if ((this.lastStates.get(key) ?? null) !== state) {
        this.lastStates.set(key, state);
        this.o.onChange?.(key);
      }
    }
  }

  /** The window is alive. With a key, it is now working on that project. */
  seen(windowId: string, key?: string): void {
    this.update(windowId, key, false);
  }

  /** The window asked for work on this project (a /wait), so it's listening there, even if it doesn't wait. */
  polled(windowId: string, key: string): void {
    this.update(windowId, key, true);
  }

  private update(windowId: string, key: string | undefined, polled: boolean): void {
    const w = this.windows.get(windowId);
    const nextKey = key ?? w?.key;
    if (!nextKey) return;
    // Update in place: wait() holds this object and decrements `waits` on it when it ends.
    const previousKey = w?.key;
    const now = this.now();
    if (w) {
      w.key = nextKey;
      w.lastSeen = now;
      if (polled) w.lastWait = now;
    } else {
      this.windows.set(windowId, { key: nextKey, lastSeen: now, waits: 0, busy: false, ...(polled ? { lastWait: now } : {}) });
    }
    this.check(nextKey, ...(previousKey && previousKey !== nextKey ? [previousKey] : []));
  }

  /** Inside a wait, or between polls. */
  private listening(w: Window): boolean {
    return w.waits > 0 || (w.lastWait !== undefined && this.now() - w.lastWait < LISTEN_GAP_MS);
  }

  /** Whether the window is inside a wait on this project right now. */
  inWait(windowId: string, key: string): boolean {
    const w = this.windows.get(windowId);
    return Boolean(w && w.key === key && w.waits > 0);
  }

  isAlive(windowId: string): boolean {
    const w = this.windows.get(windowId);
    return Boolean(w && (w.waits > 0 || this.now() - w.lastSeen < (this.o.aliveMs ?? 90_000)));
  }

  state(key: string): ListeningState {
    let waiting = false;
    let busy = false;
    for (const [id, w] of this.windows) {
      if (w.key !== key || !this.isAlive(id)) continue;
      if (w.busy) busy = true;
      else if (this.listening(w)) waiting = true;
    }
    return waiting ? 'waiting' : busy ? 'busy' : null;
  }

  setBusy(windowId: string, busy: boolean): void {
    const w = this.windows.get(windowId);
    if (!w) return;
    w.busy = busy;
    w.lastSeen = this.now();
    this.check(w.key);
  }

  /** Waits until notify(key), the timeout, or the request goes away. */
  async wait(windowId: string, key: string, ms: number, signal?: AbortSignal): Promise<'notified' | 'timeout' | 'aborted'> {
    this.seen(windowId, key);
    const w = this.windows.get(windowId)!;
    w.waits++;
    try {
      return await new Promise((resolve) => {
        const set = this.waiters.get(key) ?? new Set<() => void>();
        this.waiters.set(key, set);
        const finish = (outcome: 'notified' | 'timeout' | 'aborted') => {
          clearTimeout(timer);
          set.delete(wake);
          signal?.removeEventListener('abort', abort);
          resolve(outcome);
        };
        const wake = () => finish('notified');
        const abort = () => finish('aborted');
        const timer = setTimeout(() => finish('timeout'), ms);
        set.add(wake);
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort);
      });
    } finally {
      w.waits--;
      w.lastSeen = this.now();
      w.lastWait = w.lastSeen;
      this.check(w.key);
    }
  }

  notify(key: string): void {
    for (const wake of [...(this.waiters.get(key) ?? [])]) wake();
  }

  /** Re-checks every project, so a window that went quiet stops showing as listening. */
  sweep(): void {
    this.check(...new Set([...this.windows.values()].map((w) => w.key)));
  }
}
