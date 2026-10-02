import type { ListeningState } from '@dev-plumbing/core';

type Window = { key: string; lastSeen: number; waits: number; busy: boolean };

/**
 * The Claude windows working on each plumbing project (key = "repo/id").
 * - A window is alive while it's inside a wait, or for `aliveMs` after it was last seen. The MCP server pings every 30 s.
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
    const w = this.windows.get(windowId);
    const nextKey = key ?? w?.key;
    if (!nextKey) return;
    this.windows.set(windowId, { key: nextKey, lastSeen: this.now(), waits: w?.waits ?? 0, busy: w?.busy ?? false });
    this.check(nextKey, ...(w && w.key !== nextKey ? [w.key] : []));
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
      else waiting = true;
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
