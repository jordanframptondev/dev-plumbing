import fs from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from 'hono';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function staticHandler(root: string): Handler {
  const base = path.resolve(root);
  return async (c) => {
    let rel = '/';
    try {
      rel = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      rel = '/';
    }
    const target = path.resolve(base, `.${rel}`);
    if (target.startsWith(base + path.sep)) {
      try {
        const stat = await fs.stat(target);
        if (stat.isFile()) {
          return new Response(await fs.readFile(target), { headers: { 'content-type': TYPES[path.extname(target)] ?? 'application/octet-stream' } });
        }
      } catch {
        // not a file: fall through to the app shell
      }
    }
    try {
      return new Response(await fs.readFile(path.join(base, 'index.html')), { headers: { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' } });
    } catch {
      return c.text("The web app isn't built yet. Run pnpm build.", 503);
    }
  };
}
