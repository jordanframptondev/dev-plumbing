import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import { ServiceError, type ServiceClient } from '../src/client';
import { createDpServer, TOOL_NAMES } from '../src/tools';

type Handler = (body: Record<string, unknown>) => unknown;

function fakeService(handlers: Record<string, Handler>) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const client: ServiceClient = {
    call: async <T>(path: string, body: Record<string, unknown>) => {
      calls.push({ path, body });
      const handler = handlers[path];
      if (!handler) throw new ServiceError(404, `No route ${path}`);
      return (await handler(body)) as T;
    },
  };
  return { client, calls };
}

async function connect(server: McpServer): Promise<Client> {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

const textOf = (r: unknown) => ((r as { content: { text: string }[] }).content[0]?.text ?? '');

describe('the dp tools', () => {
  it('offers exactly the seven dp tools', async () => {
    const { client } = fakeService({});
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1' }));
    const names = ['dp_context', 'dp_finalize', 'dp_open', 'dp_reply', 'dp_repo_profile', 'dp_wait', 'dp_write_items'];
    expect([...TOOL_NAMES].sort()).toEqual(names);
    expect((await mcp.listTools()).tools.map((t) => t.name).sort()).toEqual(names);
  });

  it('adds the window and the project folder to what Claude sends', async () => {
    const { client, calls } = fakeService({ '/open': () => ({ kind: 'created', project: 'restock-reminders' }), '/reply': () => ({ ok: true }), '/context': () => ({ item: {} }), '/items': () => ({ saved: 1 }) });
    let active = 0;
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1', onActive: () => active++ }));
    const opened = await mcp.callTool({ name: 'dp_open', arguments: { plan: 'docs/specs/restock.md' } });
    expect(JSON.parse(textOf(opened))).toMatchObject({ kind: 'created' });
    await mcp.callTool({ name: 'dp_write_items', arguments: { repo: 'acme', project: 'restock-reminders', type: 'questions', noChanges: 'None.' } });
    await mcp.callTool({ name: 'dp_context', arguments: { repo: 'acme', project: 'restock-reminders', threadId: 't-1' } });
    await mcp.callTool({ name: 'dp_reply', arguments: { repo: 'acme', project: 'restock-reminders', threadId: 't-1', text: 'Done.' } });
    expect(calls.map((c) => [c.path, c.body.cwd ?? null, c.body.windowId ?? null])).toEqual([
      ['/open', '/repo', 'w-1'],
      ['/items', '/repo', null],
      ['/context', null, null],
      ['/reply', '/repo', null],
    ]);
    expect(active).toBe(1);
  });

  it('returns service errors as tool errors Claude can read and fix', async () => {
    const { client } = fakeService({ '/items': () => { throw new ServiceError(400, 'Nothing was saved. Fix these and call dp_write_items again:\n- Item 1 (a): the key is used twice.'); } });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1' }));
    const r = await mcp.callTool({ name: 'dp_write_items', arguments: { repo: 'acme', project: 'p', type: 'questions', items: [{ key: 'a', title: 'A', summary: 's' }] } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/key is used twice/);
  });

  it('keeps listening, with progress, until a submission arrives', async () => {
    let polls = 0;
    const { client, calls } = fakeService({
      '/wait': () => (++polls < 3 ? { kind: 'timeout' } : { kind: 'submission', submission: 's-1', groups: [{ threads: ['t-1'], titles: ['Who?'], model: 'sonnet' }] }),
    });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1', retryMs: 1 }));
    const progress: string[] = [];
    const r = await mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme', project: 'p', finished: { submission: 's-0' } } }, undefined, { onprogress: (p) => progress.push(p.message ?? '') });
    expect(JSON.parse(textOf(r))).toMatchObject({ kind: 'submission', submission: 's-1' });
    expect(progress.length).toBeGreaterThanOrEqual(2);
    expect(progress[0]).toMatch(/Listening for your answers/);
    expect(calls.map((c) => c.body.finished ?? null)).toEqual([{ submission: 's-0' }, null, null]);
    expect(calls.every((c) => c.body.windowId === 'w-1')).toBe(true);
  });

  it('a second dp_wait for the same project takes over from the first, which stops', async () => {
    const polls: { project: unknown; signal?: AbortSignal }[] = [];
    let deliver = false;
    // Long-polls for 20 ms, unless the call is aborted. Once `deliver` is set, every poll gets a submission.
    const client: ServiceClient = {
      call: <T>(_path: string, body: Record<string, unknown>, signal?: AbortSignal) =>
        new Promise<T>((resolve, reject) => {
          polls.push({ project: body.project, signal });
          if (deliver) return resolve({ kind: 'submission', submission: `s-${String(body.project)}` } as T);
          const timer = setTimeout(() => resolve({ kind: 'timeout' } as T), 20);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('aborted'));
          });
        }),
    };
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1', retryMs: 1 }));
    const wait = (project: string) => mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme', project } });
    const first = wait('p');
    const other = wait('q');
    await vi.waitFor(() => expect(polls.filter((x) => x.project === 'p').length).toBeGreaterThan(1));
    const firstSignal = polls.find((x) => x.project === 'p')?.signal;
    const second = wait('p');

    const replaced = await Promise.race([first, new Promise((r) => setTimeout(() => r('still listening'), 1000))]);
    expect(replaced).not.toBe('still listening');
    expect(JSON.parse(textOf(replaced))).toEqual({ kind: 'replaced', next: 'Another dp_wait for this project took over. Stop here.' });
    // Its poll in flight was cancelled, and it doesn't poll again.
    expect(firstSignal?.aborted).toBe(true);
    const pollsAfter = polls.length;
    await new Promise((r) => setTimeout(r, 60));
    expect(polls.slice(pollsAfter).filter((x) => x.signal === firstSignal)).toEqual([]);

    deliver = true;
    expect(JSON.parse(textOf(await second))).toMatchObject({ kind: 'submission', submission: 's-p' });
    expect(JSON.parse(textOf(await other))).toMatchObject({ kind: 'submission', submission: 's-q' });
  });

  it('rides out the service restarting, and gives up only after its limit', async () => {
    let polls = 0;
    const { client } = fakeService({
      '/wait': () => {
        polls++;
        if (polls === 1) throw new ServiceError(503, 'restarting', true);
        return { kind: 'timeout' };
      },
    });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1', maxWaitMs: 50, retryMs: 1 }));
    const r = await mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme', project: 'p' } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(textOf(r))).toMatchObject({ kind: 'still-waiting' });
    expect(polls).toBeGreaterThan(1);
  });

  it('a broken install surfaces at once', async () => {
    let polls = 0;
    const msg = "dev-plumbing isn't set up on this Mac. Run dev-plumbing setup in a terminal.";
    const { client } = fakeService({ '/wait': () => { polls++; throw new ServiceError(503, msg); } });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1', retryMs: 1 }));
    const r = await mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme', project: 'p' } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toBe(msg);
    expect(polls).toBe(1);
  });

  it('gives up after five failed restarts in a row', async () => {
    let polls = 0;
    const { client } = fakeService({ '/wait': () => { polls++; throw new ServiceError(503, 'restarting', true); } });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1', retryMs: 1 }));
    const r = await mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme', project: 'p' } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toBe('restarting');
    expect(polls).toBe(5);
  });

  it("serves the finalizer's pack and sends its final", async () => {
    const { client, calls } = fakeService({ '/context': () => ({ rules: '# Finalize spec rules' }), '/finalize': () => ({ ok: true, request: 'f-1' }) });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1' }));
    const pack = await mcp.callTool({ name: 'dp_context', arguments: { repo: 'acme', project: 'restock-reminders', finalize: true } });
    expect(JSON.parse(textOf(pack))).toEqual({ rules: '# Finalize spec rules' });
    const sent = await mcp.callTool({ name: 'dp_finalize', arguments: { repo: 'acme', project: 'restock-reminders', request: 'f-1', markdown: '# Restock reminders\n' } });
    expect(sent.isError).toBeFalsy();
    expect(calls).toEqual([
      { path: '/context', body: { repo: 'acme', project: 'restock-reminders', finalize: true } },
      { path: '/finalize', body: { repo: 'acme', project: 'restock-reminders', request: 'f-1', markdown: '# Restock reminders\n' } },
    ]);
  });

  it('returns finalize and detect-profile work, and passes back what was finished', async () => {
    const results: unknown[] = [
      { kind: 'timeout' },
      { kind: 'finalize', request: 'f-1', model: 'opus' },
      { kind: 'detect-profile', repo: 'acme', clone: '/repo', model: 'sonnet' },
      { kind: 'submission', submission: 's-1' },
    ];
    const { client, calls } = fakeService({ '/wait': () => results.shift() });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1', retryMs: 1 }));
    const wait = async (finished?: Record<string, string>) =>
      JSON.parse(textOf(await mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme', project: 'p', ...(finished ? { finished } : {}) } })));
    expect(await wait()).toEqual({ kind: 'finalize', request: 'f-1', model: 'opus' });
    expect(await wait({ finalize: 'f-1' })).toEqual({ kind: 'detect-profile', repo: 'acme', clone: '/repo', model: 'sonnet' });
    expect(await wait({ detect: 'acme' })).toMatchObject({ kind: 'submission' });
    expect(calls.map((c) => c.body.finished ?? null)).toEqual([null, null, { finalize: 'f-1' }, { detect: 'acme' }]);
  });
  it("passes the user's answer to plan-changed through as update, and fresh", async () => {
    const results: unknown[] = [
      { kind: 'plan-changed', version: 1, nextVersion: 2, added: 3, removed: 1 },
      { kind: 'updated', version: 2, merged: { clean: 2, conflicts: 1 } },
      { kind: 'reopened', importTypes: [] },
      { kind: 'updated', version: 2, merged: { clean: 0, conflicts: 0 } },
    ];
    const { client, calls } = fakeService({ '/open': () => results.shift() });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1' }));
    const open = async (args: Record<string, unknown>) => JSON.parse(textOf(await mcp.callTool({ name: 'dp_open', arguments: args })));
    expect(await open({ plan: 'docs/specs/restock.md' })).toMatchObject({ kind: 'plan-changed', nextVersion: 2 });
    expect(await open({ plan: 'docs/specs/restock.md', update: true })).toMatchObject({ kind: 'updated', version: 2 });
    expect(await open({ project: 'restock-reminders', update: false })).toMatchObject({ kind: 'reopened' });
    expect(await open({ plan: 'docs/specs/restock.md', update: true, fresh: true })).toMatchObject({ kind: 'updated', version: 2 });
    expect(calls.map((c) => c.body)).toEqual([
      { plan: 'docs/specs/restock.md', cwd: '/repo', windowId: 'w-1' },
      { plan: 'docs/specs/restock.md', update: true, cwd: '/repo', windowId: 'w-1' },
      { project: 'restock-reminders', update: false, cwd: '/repo', windowId: 'w-1' },
      { plan: 'docs/specs/restock.md', update: true, fresh: true, cwd: '/repo', windowId: 'w-1' },
    ]);
    const tool = (await mcp.listTools()).tools.find((t) => t.name === 'dp_open')!;
    expect(Object.keys(tool.inputSchema.properties ?? {}).sort()).toEqual(['fresh', 'plan', 'project', 'update']);
    for (const s of ['plan-changed', 'update: true', 'updated', 'update: false', 'fresh: true']) expect(tool.description).toContain(s);
    // An answer that isn't true or false never reaches the service.
    const bad = await mcp.callTool({ name: 'dp_open', arguments: { plan: 'docs/specs/restock.md', update: 'yes' } });
    expect(bad.isError).toBe(true);
    expect(calls).toHaveLength(4);
  });

  it("passes a re-import's removed keys through dp_write_items", async () => {
    const { client, calls } = fakeService({ '/items': () => ({ saved: 0, itemIds: [], importFinished: false }) });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1' }));
    await mcp.callTool({ name: 'dp_write_items', arguments: { repo: 'acme', project: 'restock-reminders', type: 'questions', items: [{ key: 'who' }], removed: ['sms-later'] } });
    expect(calls.map((c) => c.body)).toEqual([{ repo: 'acme', project: 'restock-reminders', type: 'questions', items: [{ key: 'who' }], removed: ['sms-later'], cwd: '/repo' }]);
    const tool = (await mcp.listTools()).tools.find((t) => t.name === 'dp_write_items')!;
    expect(Object.keys(tool.inputSchema.properties ?? {}).sort()).toEqual(['items', 'noChanges', 'project', 'removed', 'repo', 'type']);
    expect(tool.description).toContain('removed lists the keys of existing items');
  });

});
