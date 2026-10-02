import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { readRunFile } from '@dev-plumbing/core';
import { makeRepo } from '../../core/test/fixtures';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

const root = path.resolve(import.meta.dirname, '../../..');
const cli = path.join(root, 'packages/cli/dist/index.js');
let configDir: string;
let env: Record<string, string>;
let mcp: Client;

async function freePort(): Promise<number> {
  const s = net.createServer().listen(0, '127.0.0.1');
  await once(s, 'listening');
  const port = (s.address() as net.AddressInfo).port;
  s.close();
  await once(s, 'close');
  return port;
}

beforeAll(async () => {
  const home = tempDir('dp-bridge-');
  configDir = path.join(home, '.dev-plumbing');
  env = Object.fromEntries(Object.entries({ ...process.env, HOME: home, DEV_PLUMBING_HOME: configDir }).filter((e): e is [string, string] => e[1] !== undefined));
  const port = await freePort();
  execFileSync(process.execPath, [cli, 'setup', '--yes', '--no-login-item', '--no-start', '--no-plugin', '--projects-folder', path.join(home, 'projects'), '--port', String(port)], { env, stdio: 'ignore' });
  const settingsFile = path.join(configDir, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')), openBrowserOnImport: false }));
  fs.mkdirSync(path.join(configDir, 'repos'), { recursive: true });
  fs.writeFileSync(path.join(configDir, 'repos', 'acme-app.json'), JSON.stringify({ name: 'acme-app', match: ['github.com/acme/acme-app'] }));
  const repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
  mcp = new Client({ name: 'bridge-test', version: '1.0.0' });
  await mcp.connect(new StdioClientTransport({ command: 'sh', args: [path.join(root, 'plugin/bin/dp-mcp.sh')], env: { ...env, CLAUDE_PROJECT_DIR: repo } }));
});

afterAll(async () => {
  await mcp?.close();
  try {
    execFileSync(process.execPath, [cli, 'stop'], { env, stdio: 'ignore' });
  } catch {
    // Not running.
  }
  removeTempDirs();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (r: unknown): any => JSON.parse((r as { content: { text: string }[] }).content[0]!.text);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function http(route: string, init: RequestInit = {}): Promise<any> {
  const run = await readRunFile(configDir);
  const res = await fetch(`http://127.0.0.1:${run!.port}${route}`, { ...init, headers: { 'content-type': 'application/json', 'x-dev-plumbing-token': run!.token } });
  return res.json();
}

it('carries a whole round trip from Claude Code to the app and back', async () => {
  // dp_open starts the service by itself, from the install info setup wrote.
  const open = json(await mcp.callTool({ name: 'dp_open', arguments: { plan: 'docs/specs/restock-reminders.md' } }));
  expect(open).toMatchObject({ kind: 'created', repo: 'acme-app', project: 'restock-reminders' });
  for (const t of open.importTypes as { id: string }[]) {
    const batch = t.id === 'questions' ? { items: [{ key: 'channels', title: 'Which channels?', summary: 'SMS or email.', message: { text: 'SMS, email or both?' } }] } : { noChanges: 'None.' };
    const r = await mcp.callTool({ name: 'dp_write_items', arguments: { repo: 'acme-app', project: 'restock-reminders', type: t.id, ...batch } });
    expect(r.isError).toBeFalsy();
  }

  // The user answers in the browser.
  const P = '/api/projects/acme-app/restock-reminders';
  await http(`${P}/threads/t-questions-channels/draft`, { method: 'PUT', body: JSON.stringify({ text: 'Both.' }) });
  await http(`${P}/submit`, { method: 'POST', body: JSON.stringify({ scope: 'all' }) });

  // The main window hears about it.
  const wait = json(await mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme-app', project: 'restock-reminders' } }));
  expect(wait).toMatchObject({ kind: 'submission', groups: [{ threads: ['t-questions-channels'], model: 'sonnet' }] });

  // A thread subagent reads its context and replies.
  const ctx = json(await mcp.callTool({ name: 'dp_context', arguments: { repo: 'acme-app', project: 'restock-reminders', threadId: 't-questions-channels' } }));
  expect(ctx.thread.messages.at(-1)).toMatchObject({ author: 'you', text: 'Both.' });
  const reply = await mcp.callTool({
    name: 'dp_reply',
    arguments: { repo: 'acme-app', project: 'restock-reminders', threadId: 't-questions-channels', text: 'Both it is.', resolve: { decision: 'Reminders go by SMS and email' } },
  });
  expect(reply.isError).toBeFalsy();
  expect((await http(`${P}/threads/t-questions-channels`)).thread.status).toBe('resolved');
}, 60_000);
