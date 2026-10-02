/** Runs work for the same key one at a time, in arrival order. Different keys run in parallel. */
export function createLocks() {
  const tails = new Map<string, Promise<unknown>>();
  return function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve();
    const run = previous.then(() => fn());
    const tail = run.catch(() => undefined);
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return run;
  };
}
export type WithLock = ReturnType<typeof createLocks>;
