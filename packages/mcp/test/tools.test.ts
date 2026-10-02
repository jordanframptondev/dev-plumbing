import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
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
  it('offers exactly the six dp tools', async () => {
    const { client } = fakeService({});
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1' }));
    expect((await mcp.listTools()).tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
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

  it('rides out the service restarting, and gives up only after its limit', async () => {
    let polls = 0;
    const { client } = fakeService({
      '/wait': () => {
        polls++;
        if (polls === 1) throw new ServiceError(503, 'restarting');
        return { kind: 'timeout' };
      },
    });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1', maxWaitMs: 50, retryMs: 1 }));
    const r = await mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme', project: 'p' } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(textOf(r))).toMatchObject({ kind: 'still-waiting' });
    expect(polls).toBeGreaterThan(1);
  });
});
