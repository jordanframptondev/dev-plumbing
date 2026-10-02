import { readRunFile } from '@dev-plumbing/core';
import { ServiceError } from './errors';
import { startService } from './start';

export { ServiceError };

export type ServiceClient = { call<T = unknown>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> };

/** Talks to the local service as Claude: POST /api/claude/<path> with the run-file token. */
export function serviceClient(o: { configDir: string; fetch?: typeof fetch; ensureRunning?: () => Promise<void> }): ServiceClient {
  const doFetch = o.fetch ?? fetch;
  const ensureRunning = o.ensureRunning ?? (() => startService(o.configDir));

  /** null means "couldn't reach it": no run file, or the connection failed. */
  async function attempt(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<{ data: unknown } | null> {
    const run = await readRunFile(o.configDir);
    if (!run) return null;
    let res: Response;
    try {
      res = await doFetch(`http://127.0.0.1:${run.port}/api/claude${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dev-plumbing-token': run.token },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      return null;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ServiceError(res.status, data.error ?? `The dev-plumbing service answered ${res.status}.`);
    return { data };
  }

  return {
    async call<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
      const first = await attempt(path, body, signal);
      if (first) return first.data as T;
      await ensureRunning();
      const second = await attempt(path, body, signal);
      if (second) return second.data as T;
      throw new ServiceError(503, "dev-plumbing isn't running and couldn't be started. Run dev-plumbing start in a terminal.");
    },
  };
}
