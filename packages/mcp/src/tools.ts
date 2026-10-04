import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { importItemSchema, replySchema, repoProfileSchema, VERSION } from '@dev-plumbing/core';
import { ServiceError, type ServiceClient } from './client';

/** Under the plugin's 12-hour per-call limit, so a long wait ends on our terms. */
export const MAX_WAIT_MS = 11.5 * 60 * 60 * 1000;
export const TOOL_NAMES = ['dp_open', 'dp_repo_profile', 'dp_write_items', 'dp_wait', 'dp_context', 'dp_reply', 'dp_finalize'] as const;
/** dp_wait results that hand the window work. Anything else (a timeout) means keep listening. */
export const WORK_KINDS: ReadonlySet<string> = new Set(['submission', 'finalize', 'detect-profile']);

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };
const ok = (value: unknown): Result => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const failed = (e: unknown): Result => ({ isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] });
/** Resolves after `ms`, or as soon as `signal` aborts. */
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });

export const REPLACED = { kind: 'replaced', next: 'Another dp_wait for this project took over. Stop here.' } as const;

const project = { repo: z.string().min(1).describe('The repo, from dp_open'), project: z.string().min(1).describe('The plumbing project id, from dp_open') };

export function createDpServer(o: { client: ServiceClient; cwd: string; windowId: string; maxWaitMs?: number; retryMs?: number; onActive?: () => void }): McpServer {
  const server = new McpServer({ name: 'dp', version: VERSION });
  // One dp_wait per project in this window: a new call takes over, and the older one stops with `replaced`.
  const listening = new Map<string, AbortController>();
  let active = false;
  const markActive = () => {
    if (active) return;
    active = true;
    o.onActive?.();
  };
  const call = async (path: string, body: Record<string, unknown>): Promise<Result> => {
    try {
      return ok(await o.client.call(path, body));
    } catch (e) {
      return failed(e);
    }
  };

  server.registerTool(
    'dp_open',
    {
      description:
        "Open a plumbing project for the repo this session is in. Pass plan (a Markdown plan's path, relative to the repo or absolute) to import it, or to reopen it if it was imported before. Pass project (an id from a listing) to reopen one. Pass neither to list this repo's plumbing projects. The result's kind and next say what to do.",
      inputSchema: { plan: z.string().min(1).optional(), project: z.string().min(1).optional() },
    },
    async (args) => {
      const result = await call('/open', { ...args, cwd: o.cwd, windowId: o.windowId });
      if (!result.isError) markActive();
      return result;
    },
  );

  server.registerTool(
    'dp_repo_profile',
    {
      description:
        "Read this repo's profile, or save one you detected. Without profile: returns existing, missing (with the remote and a suggested name), or redetect when the user pressed Detect again (with the current profile). With profile: saves it as repos/<name>.json. match must include this clone's remote. It never overwrites an existing profile, except after Detect again, when it replaces only planFolders, schema, conventions, apps and sensitiveData.",
      inputSchema: { profile: repoProfileSchema.optional() },
    },
    async (args) => call('/repo-profile', { cwd: o.cwd, ...(args.profile ? { profile: args.profile } : {}) }),
  );

  server.registerTool(
    'dp_write_items',
    {
      description:
        'Write everything one plumbing type found in the plan, in one call: items, or noChanges with a reason. The batch is checked as a whole. If anything is wrong, nothing is saved and the error lists every problem: fix them all and send the whole batch again.',
      inputSchema: { ...project, type: z.string().min(1).describe('The plumbing type id'), items: z.array(importItemSchema).max(60).optional(), noChanges: z.string().min(1).max(500).optional() },
    },
    async (args) => call('/items', { ...args, cwd: o.cwd }),
  );

  server.registerTool(
    'dp_context',
    {
      description: 'Get the context pack for one thread (threadId), for importing one plumbing type (importType), or for writing the final spec (finalize: true).',
      inputSchema: { ...project, threadId: z.string().optional(), importType: z.string().optional(), finalize: z.boolean().optional() },
    },
    async (args) => call('/context', args),
  );

  server.registerTool(
    'dp_reply',
    {
      description:
        'Post your reply to one thread you were given. The reply is checked as a whole. If anything is wrong, nothing is saved and the error lists every problem: fix them all and call dp_reply again.',
      inputSchema: { ...project, ...replySchema.shape },
    },
    async (args) => call('/reply', { ...args, cwd: o.cwd }),
  );

  server.registerTool(
    'dp_finalize',
    {
      description:
        "Send the whole final spec you wrote for a finalize request. Put the context pack's tokens where diagrams, flows, schema diffs, migrations and mockup links go: the service replaces each one with a block generated from the item's data. The document is checked as a whole. If anything is wrong, nothing is saved and the error lists every problem: fix them all and call dp_finalize again with the whole document.",
      inputSchema: {
        ...project,
        request: z.string().min(1).describe('The finalize request id, from your prompt'),
        // No length limits here: saveProposal checks them, and its messages are the ones the finalizer should read.
        markdown: z.string().describe('The whole final document, in Markdown'),
      },
    },
    async (args) => call('/finalize', args),
  );

  server.registerTool(
    'dp_wait',
    {
      description:
        "Listen for the user. Waits until they press Send this thread, Submit all or Start finalize in the app, or Detect again in Settings, sending progress while it waits. Then returns one piece of work: kind submission (the threads to answer in groups, one thread subagent per group, with the model to use), kind finalize (a finalize request for one finalizer subagent) or kind detect-profile (a repo whose profile the repo-setup subagent detects again). When you call it again, pass finished with what you just did: { submission, conflicts } after a submission, { finalize: <request id> } after a finalize (finished.finalize), or { detect: <repo> } after a detect-profile (finished.detect). If it returns still-waiting, call it again. If it returns replaced, a newer dp_wait for this project took over: stop.",
      inputSchema: {
        ...project,
        finished: z
          .object({
            submission: z.string().min(1).optional(),
            conflicts: z.array(z.object({ threads: z.array(z.string()).min(1), text: z.string().min(1) })).optional(),
            finalize: z.string().min(1).optional().describe('The finalize request you just handled'),
            detect: z.string().min(1).optional().describe('The repo whose profile you just detected again'),
          })
          .optional(),
      },
    },
    async (args, extra) => {
      markActive();
      const key = `${args.repo}/${args.project}`;
      listening.get(key)?.abort();
      const mine = new AbortController();
      listening.set(key, mine);
      const signal = AbortSignal.any([extra.signal, mine.signal]);
      const stopped = () => (mine.signal.aborted ? ok(REPLACED) : extra.signal.aborted ? failed(new Error('Stopped listening.')) : null);
      const started = Date.now();
      const token = extra._meta?.progressToken;
      let finished = args.finished;
      let beat = 0;
      let failures = 0;
      try {
        while (true) {
          const stop = stopped();
          if (stop) return stop;
          const t0 = Date.now();
          try {
            const r = await o.client.call<{ kind: string }>('/wait', { repo: args.repo, project: args.project, windowId: o.windowId, ...(finished ? { finished } : {}) }, signal);
            finished = undefined;
            failures = 0;
            if (WORK_KINDS.has(r.kind)) return ok(r);
          } catch (e) {
            const stop = stopped();
            if (stop) return stop;
            // Only a service that is restarting or briefly unreachable is worth waiting out. A broken install or a real error is not.
            if (!(e instanceof ServiceError) || !e.retryable || ++failures >= 5) return failed(e);
          }
          const minutes = Math.floor((Date.now() - started) / 60_000);
          if (token !== undefined) {
            await extra.sendNotification({
              method: 'notifications/progress',
              params: { progressToken: token, progress: ++beat, message: `Listening for your answers (${minutes} min)` },
            });
          }
          if (Date.now() - started >= (o.maxWaitMs ?? MAX_WAIT_MS)) {
            return ok({ kind: 'still-waiting', next: 'Nothing was submitted yet. Call dp_wait again to keep listening.' });
          }
          // The service long-polls, so a quick return means it's restarting or a test is running: don't spin.
          if (Date.now() - t0 < 1000) await sleep(o.retryMs ?? 2000, signal);
        }
      } finally {
        if (listening.get(key) === mine) listening.delete(key);
      }
    },
  );

  return server;
}
