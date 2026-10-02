import type { Context, Handler } from 'hono';
import { ConflictError, InputError, ProjectUnreadableError, StoreError } from '@dev-plumbing/core';

export function errorResponse(c: Context, e: unknown): Response {
  if (e instanceof InputError) return c.json({ error: e.message }, 400);
  if (e instanceof ConflictError) return c.json({ error: e.message }, 409);
  if (e instanceof StoreError) return c.json({ error: e.message }, 404);
  if (e instanceof ProjectUnreadableError) return c.json({ error: e.message }, 422);
  throw e;
}

/** Wraps a route handler so the core's errors become readable JSON responses. */
export const handle =
  <P extends string>(fn: (c: Context<any, P>) => Promise<Response>): Handler<any, P> =>
  async (c) => {
    try {
      return await fn(c);
    } catch (e) {
      return errorResponse(c, e);
    }
  };
