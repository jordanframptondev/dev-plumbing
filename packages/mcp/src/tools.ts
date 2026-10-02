import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { importItemSchema, replySchema, repoProfileSchema, VERSION } from '@dev-plumbing/core';
import { ServiceError, type ServiceClient } from './client';

/** Under the plugin's 12-hour per-call limit, so a long wait ends on our terms. */
export const MAX_WAIT_MS = 11.5 * 60 * 60 * 1000;
export const TOOL_NAMES = ['dp_open', 'dp_repo_profile', 'dp_write_items', 'dp_wait', 'dp_context', 'dp_reply'] as const;

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };
const ok = (value: unknown): Result => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const failed = (e: unknown): Result => ({ isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const project = { repo: z.string().min(1).describe('The repo, from dp_open'), project: z.string().min(1).describe('The plumbing project id, from dp_open') };

export function createDpServer(o: { client: ServiceClient; cwd: string; windowId: string; maxWaitMs?: number; retryMs?: number; onActive?: () => void }): McpServer {
  const server = new McpServer({ name: 'dp', version: VERSION });
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
        "Read this repo's profile, or save one you detected. Without profile: returns existing, or missing with the remote and a suggested name. With profile: saves it as repos/<name>.json. match must include this clone's remote. It never overwrites an existing profile.",
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
      description: 'Get the context pack for one thread (threadId), or for importing one plumbing type (importType).',
      inputSchema: { ...project, threadId: z.string().optional(), importType: z.string().optional() },
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
    'dp_wait',
    {
      description:
        "Listen for the user's answers. Waits until they press Send this thread or Submit all, sending progress while it waits, then returns the threads to answer in groups (one thread subagent per group) with the model to use. When you call it again, pass finished with the previous submission id and any conflicts you found. If it returns still-waiting, call it again.",
      inputSchema: {
        ...project,
        finished: z
          .object({
            submission: z.string().min(1),
            conflicts: z.array(z.object({ threads: z.array(z.string()).min(1), text: z.string().min(1) })).optional(),
          })
          .optional(),
      },
    },
    async (args, extra) => {
      markActive();
      const started = Date.now();
      const token = extra._meta?.progressToken;
      let finished = args.finished;
      let beat = 0;
      let failures = 0;
      while (true) {
        const t0 = Date.now();
        try {
          const r = await o.client.call<{ kind: string }>('/wait', { repo: args.repo, project: args.project, windowId: o.windowId, ...(finished ? { finished } : {}) }, extra.signal);
          finished = undefined;
          failures = 0;
          if (r.kind === 'submission') return ok(r);
        } catch (e) {
          if (extra.signal.aborted) return failed(new Error('Stopped listening.'));
          // Only a service that is restarting or briefly unreachable is worth waiting out. A broken install or a real error is not.
          if (!(e instanceof ServiceError) || !e.retryable || ++failures >= 5) return failed(e);
        }
        if (extra.signal.aborted) return failed(new Error('Stopped listening.'));
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
        if (Date.now() - t0 < 1000) await sleep(o.retryMs ?? 2000);
      }
    },
  );

  return server;
}
