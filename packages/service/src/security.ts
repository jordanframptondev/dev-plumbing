import type { MiddlewareHandler } from 'hono';

/** Spec §15.6: localhost only, a token for tools, same-origin for the browser, Host checks against DNS rebinding. */
export function guard(opts: { port: number; token: string; extraOrigins?: string[] }): MiddlewareHandler {
  const hosts = new Set([`localhost:${opts.port}`, `127.0.0.1:${opts.port}`]);
  const origins = new Set([...hosts, ...(opts.extraOrigins ?? [])]);
  const hostOf = (value: string) => {
    try {
      return new URL(value).host;
    } catch {
      return null;
    }
  };
  return async (c, next) => {
    const url = new URL(c.req.url);
    const host = c.req.header('host') ?? url.host;
    if (!hosts.has(host)) return c.json({ error: 'Unknown host.' }, 403);
    const rawPath = url.pathname;
    const decodedPath = c.req.path;
    const isApiRequest = (p: string) => p === '/api' || p.startsWith('/api/');
    const isProtected = isApiRequest(rawPath) || isApiRequest(decodedPath);
    if (!isProtected || decodedPath === '/api/health') return next();
    if (c.req.header('x-dev-plumbing-token') === opts.token) return next();
    const origin = c.req.header('origin');
    const sameOrigin = c.req.header('sec-fetch-site') === 'same-origin';
    const originOk = origin === undefined || origins.has(hostOf(origin) ?? '');
    if (sameOrigin && originOk) return next();
    return c.json({ error: 'Not allowed.' }, 401);
  };
}

/**
 * Anti-framing on every response, so another site can't frame the app and clickjack it.
 * 'self' rather than 'none', because mockup iframes are served from the same origin.
 * A route that sets its own policy keeps it: the mockup document's CSP includes frame-ancestors 'self' itself.
 */
export function frameHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header('X-Frame-Options', 'SAMEORIGIN');
    if (!c.res.headers.has('Content-Security-Policy')) c.header('Content-Security-Policy', "frame-ancestors 'self'");
  };
}
