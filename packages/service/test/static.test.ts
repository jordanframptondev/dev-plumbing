import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { staticHandler } from '../src/static';

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
