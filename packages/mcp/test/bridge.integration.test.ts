import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { readRunFile } from '@dev-plumbing/core';
import { makeRepo, validDefenseInput } from '../../core/test/fixtures';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

const root = path.resolve(import.meta.dirname, '../../..');
const cli = path.join(root, 'packages/cli/dist/index.js');
let configDir: string;
let env: Record<string, string>;
let mcp: Client;
let repo: string;

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
  repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
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

it('hands a finalize to the window and takes the final back', async () => {
  // Continues from the round trip above: its one question is resolved, so nothing blocks Finalize.
  const P = '/api/projects/acme-app/restock-reminders';
  const start = await http(`${P}/finalize`, { method: 'POST' });
  expect(start.request).toMatchObject({ state: 'requested' });
  const wait = json(await mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme-app', project: 'restock-reminders' } }));
  expect(wait).toMatchObject({ kind: 'finalize', request: start.request.id, model: 'opus' });
  const pack = json(await mcp.callTool({ name: 'dp_context', arguments: { repo: 'acme-app', project: 'restock-reminders', finalize: true } }));
  expect(pack.rules).toMatch(/^# Finalize spec rules/);
  const sent = await mcp.callTool({
    name: 'dp_finalize',
    arguments: { repo: 'acme-app', project: 'restock-reminders', request: start.request.id, markdown: '# Restock reminders\n\nReminders go by SMS and email.\n' },
  });
  expect(sent.isError).toBeFalsy();
  const view = await http(`${P}/finalize`);
  expect(view.request.state).toBe('proposed');
  expect(view.proposal.markdown).toContain('Reminders go by SMS and email.');
}, 60_000);

it('asks before bringing a changed plan in, and brings it in on yes', async () => {
  // Continues from the tests above: the plan is v1, and its one question is resolved.
  const PLAN = 'docs/specs/restock-reminders.md';
  const file = path.join(repo, PLAN);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('A daily job finds', 'An hourly job finds'));
  const open = async (args: Record<string, unknown>) => json(await mcp.callTool({ name: 'dp_open', arguments: args }));
  expect(await open({ plan: PLAN })).toMatchObject({ kind: 'plan-changed', version: 1, nextVersion: 2, added: 1, removed: 1 });
  expect(await open({ plan: PLAN, update: false })).toMatchObject({ kind: 'reopened', importTypes: [] });
  const updated = await open({ plan: PLAN, update: true });
  expect(updated).toMatchObject({ kind: 'updated', version: 2, merged: { clean: 1, conflicts: 0 } });
  for (const t of updated.importTypes as { id: string }[]) {
    const batch = t.id === 'questions' ? { items: [{ key: 'channels', title: 'Which channels?', summary: 'SMS or email.' }] } : { noChanges: 'None.' };
    const r = await mcp.callTool({ name: 'dp_write_items', arguments: { repo: 'acme-app', project: 'restock-reminders', type: t.id, ...batch } });
    expect(r.isError).toBeFalsy();
  }
  const P = '/api/projects/acme-app/restock-reminders';
  expect((await http(P)).project.status).toBe('active');
  expect((await http(`${P}/versions`)).versions.map((v: { n: number; current: boolean }) => [v.n, v.current])).toEqual([
    [2, true],
    [1, false],
  ]);
  // The question kept its id and its thread, which is still resolved.
  expect((await http(`${P}/threads/t-questions-channels`)).thread.status).toBe('resolved');
}, 60_000);

it('hands a Whiteboard Defense request to the window and takes the defense back', async () => {
  // Continues from the tests above: the project is at v2, with a final proposed but not accepted, so it defends the draft.
  const P = '/api/projects/acme-app/restock-reminders';
  const generated = await http(`${P}/whiteboard`, { method: 'POST', body: '{}' });
  expect(generated.request).toMatchObject({ state: 'requested' });
  const wait = json(await mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme-app', project: 'restock-reminders' } }));
  expect(wait).toMatchObject({ kind: 'whiteboard', request: generated.request.id, model: 'opus' });
  const pack = json(await mcp.callTool({ name: 'dp_context', arguments: { repo: 'acme-app', project: 'restock-reminders', whiteboard: true } }));
  // The subagent Reads the rules file and the document the pack names.
  expect(fs.readFileSync(pack.rulesFile, 'utf8')).toMatch(/^# /);
  expect(pack.basedOn).toEqual({ doc: 'draft', version: 2 });
  expect(fs.readFileSync(pack.documentFile, 'utf8').length).toBeGreaterThan(0);
  // A bad basis and a missing section come back from the service together, in one refusal.
  const input = validDefenseInput();
  const bad = { ...input, sections: input.sections.filter((s) => s.id !== 'summary').map((s) => (s.id === 'data' ? { ...s, claims: [{ text: 'Perhaps.', basis: 'maybe' }] } : s)) };
  const refused = await mcp.callTool({ name: 'dp_whiteboard', arguments: { repo: 'acme-app', project: 'restock-reminders', request: generated.request.id, defense: bad } });
  expect(refused.isError).toBe(true);
  const problems = (refused as { content: { text: string }[] }).content[0]!.text;
  expect(problems).toContain('Nothing was saved. Fix these and call dp_whiteboard again with the whole defense:');
  expect(problems).toContain('- sections.2.claims.0.basis:');
  expect(problems).toContain('- sections: summary is missing.');
  const sent = await mcp.callTool({
    name: 'dp_whiteboard',
    arguments: { repo: 'acme-app', project: 'restock-reminders', request: generated.request.id, defense: input },
  });
  expect(sent.isError).toBeFalsy();
  expect(json(sent)).toMatchObject({ ok: true, request: generated.request.id, questions: 3, concerns: 2 });
  const view = await http(`${P}/whiteboard`);
  expect(view).toMatchObject({ request: null, defense: { basedOn: { kind: 'plan', doc: 'draft', version: 2 } }, stale: null });
}, 60_000);
