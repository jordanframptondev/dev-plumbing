import { appendFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const logFile = process.env.SPIKE_LOG ?? new URL('../spike.log', import.meta.url).pathname;
const log = (entry) => appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');

const server = new McpServer({ name: 'spike', version: '0.0.1' });

server.registerTool(
  'ping',
  { description: 'Echo a message back. Used to prove who can call this tool.', inputSchema: { message: z.string() } },
  async ({ message }, extra) => {
    log({ tool: 'ping', message, progressToken: extra._meta?.progressToken ?? null });
    return { content: [{ type: 'text', text: `pong: ${message}` }] };
  },
);

server.registerTool(
  'slow_ping',
  {
    description: 'Wait for the given number of seconds, sending a progress notification every 3 seconds, then echo the message.',
    inputSchema: { message: z.string(), seconds: z.number().int().min(1).max(120) },
  },
  async ({ message, seconds }, extra) => {
    const token = extra._meta?.progressToken;
    const steps = Math.ceil(seconds / 3);
    log({ tool: 'slow_ping', phase: 'start', message, seconds, progressToken: token ?? null });
    for (let i = 1; i <= steps; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (extra.signal.aborted) {
        log({ tool: 'slow_ping', phase: 'cancelled' });
        throw new Error('cancelled');
      }
      if (token !== undefined) {
        await extra.sendNotification({
          method: 'notifications/progress',
          params: { progressToken: token, progress: i, total: steps, message: `waiting ${i * 3}s` },
        });
      }
    }
    log({ tool: 'slow_ping', phase: 'done', message });
    return { content: [{ type: 'text', text: `slow pong: ${message}` }] };
  },
);

await server.connect(new StdioServerTransport());
log({ event: 'server-started', pid: process.pid });
