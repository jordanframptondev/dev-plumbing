import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { staticHandler } from '../src/static';
import { call, makeContext } from './helpers';

let root: string;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-web-'));
  await fs.mkdir(path.join(root, 'assets'));
  await fs.writeFile(path.join(root, 'index.html'), '<html>app</html>');
  await fs.writeFile(path.join(root, 'assets', 'app.js'), 'console.log(1)');
});
const app = () => new Hono().get('*', staticHandler(root));

describe('static files', () => {
  it('serves a file with its content type', async () => {
    const res = await app().request('http://localhost/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/javascript/);
  });
  it('falls back to index.html for app routes', async () => {
    expect(await (await app().request('http://localhost/p/acme/restock-reminders')).text()).toBe('<html>app</html>');
  });
  it('never serves files outside the web folder', async () => {
    const res = await app().request('http://localhost/..%2f..%2f..%2fetc%2fpasswd');
    expect(await res.text()).toBe('<html>app</html>');
  });
  it('explains when the web app is not built', async () => {
    const res = await new Hono().get('*', staticHandler(path.join(root, 'missing'))).request('http://localhost/');
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/pnpm build/);
  });
});

describe('anti-framing headers', () => {
  const expectFrameHeaders = (res: Response) => {
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
  };

  it('are set on the app shell, on API responses and on refusals', async () => {
    const { ctx } = await makeContext({ webDist: root });
    const app = createApp(ctx);
    const page = await app.request('http://localhost:4545/');
    expect(await page.text()).toBe('<html>app</html>');
    expectFrameHeaders(page);
    const asset = await app.request('http://localhost:4545/assets/app.js');
    expectFrameHeaders(asset);
    const api = await call(app, '/api/config');
    expect(api.status).toBe(200);
    expectFrameHeaders(api);
    const health = await app.request('http://localhost:4545/api/health');
    expectFrameHeaders(health);
    expectFrameHeaders(await app.request('http://localhost:4545/api/config'));
    expectFrameHeaders(await app.request('http://evil.example:4545/'));
  });
});
