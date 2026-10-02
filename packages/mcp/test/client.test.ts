import { afterAll, describe, expect, it } from 'vitest';
import { writeRunFile } from '@dev-plumbing/core';
import { serviceClient, ServiceError } from '../src/client';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

const run = { pid: 1, port: 45999, token: 'tok', startedAt: 'now', version: '0.1.0' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('the service client', () => {
  it('calls the service with the token from the run file', async () => {
    const dir = tempDir('dp-mcp-');
    await writeRunFile(dir, run);
    const seen: { url: string; token: string | null; body: string }[] = [];
    const client = serviceClient({
      configDir: dir,
      fetch: async (url, init) => {
        seen.push({ url: String(url), token: new Headers(init?.headers).get('x-dev-plumbing-token'), body: String(init?.body) });
        return json(200, { ok: true });
      },
    });
    expect(await client.call('/alive', { windowId: 'w' })).toEqual({ ok: true });
    expect(seen).toEqual([{ url: 'http://127.0.0.1:45999/api/claude/alive', token: 'tok', body: '{"windowId":"w"}' }]);
  });

  it("starts the service when it isn't running, then tries again", async () => {
    const dir = tempDir('dp-mcp-');
    let started = false;
    const client = serviceClient({
      configDir: dir,
      ensureRunning: async () => {
        started = true;
        await writeRunFile(dir, run);
      },
      fetch: async () => json(200, { ok: true }),
    });
    expect(await client.call('/alive', { windowId: 'w' })).toEqual({ ok: true });
    expect(started).toBe(true);
  });

  it("gives readable errors, and says so when the service can't be reached", async () => {
    const dir = tempDir('dp-mcp-');
    await writeRunFile(dir, run);
    const refusing = serviceClient({ configDir: dir, ensureRunning: async () => {}, fetch: async () => { throw new TypeError('fetch failed'); } });
    await expect(refusing.call('/alive', {})).rejects.toThrow(/isn't running and couldn't be started/);
    const picky = serviceClient({ configDir: dir, fetch: async () => json(400, { error: 'Nothing was saved. Fix these.' }) });
    const err = await picky.call('/items', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err).toMatchObject({ status: 400, message: 'Nothing was saved. Fix these.' });
  });
});
