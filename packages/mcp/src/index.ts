import { randomBytes } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { configDir } from '@dev-plumbing/core';
import { serviceClient } from './client';
import { createDpServer } from './tools';

const client = serviceClient({ configDir: configDir() });
const windowId = `w-${randomBytes(4).toString('hex')}`;

const server = createDpServer({
  client,
  cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  windowId,
  // Once this window opens a project, ping every 30 s so the app knows it's alive, even while subagents work.
  onActive: () => {
    setInterval(() => void client.call('/alive', { windowId }, undefined, { start: false }).catch(() => undefined), 30_000).unref();
  },
});

await server.connect(new StdioServerTransport());
