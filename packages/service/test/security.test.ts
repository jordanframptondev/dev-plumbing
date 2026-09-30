import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { guard } from '../src/security';

function makeApp(extraOrigins?: string[]) {
  const app = new Hono();
  app.use('*', guard({ port: 4545, token: 'secret', extraOrigins }));
  app.get('/api/health', (c) => c.text('ok'));
  app.get('/api/x', (c) => c.text('x'));
  app.post('/api/x', (c) => c.text('posted'));
  app.get('/index.html', (c) => c.text('page'));
  return app;
}
const url = (p: string, host = 'localhost:4545') => `http://${host}${p}`;

describe('guard', () => {
  it('rejects an unknown Host (DNS rebinding)', async () => {
    expect((await makeApp().request(url('/api/health', 'evil.example:4545'))).status).toBe(403);
  });
  it('lets localhost read health and pages without a token', async () => {
    expect((await makeApp().request(url('/api/health'))).status).toBe(200);
    expect((await makeApp().request(url('/index.html', '127.0.0.1:4545'))).status).toBe(200);
  });
  it('rejects API calls with no token and no same-origin marker', async () => {
    expect((await makeApp().request(url('/api/x'))).status).toBe(401);
  });
  it('accepts the token', async () => {
    expect((await makeApp().request(url('/api/x'), { headers: { 'x-dev-plumbing-token': 'secret' } })).status).toBe(200);
  });
  it('accepts same-origin browser requests', async () => {
    const res = await makeApp().request(url('/api/x'), { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:4545' } });
    expect(res.status).toBe(200);
  });
  it('rejects cross-site browser requests and forged same-origin markers', async () => {
    expect((await makeApp().request(url('/api/x'), { method: 'POST', headers: { 'sec-fetch-site': 'cross-site', origin: 'http://evil.example' } })).status).toBe(401);
    expect((await makeApp().request(url('/api/x'), { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', origin: 'http://evil.example' } })).status).toBe(401);
  });
  it('accepts the Vite dev origin only when configured', async () => {
    const init = { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:5173' } };
    expect((await makeApp().request(url('/api/x'), init)).status).toBe(401);
    expect((await makeApp(['localhost:5173']).request(url('/api/x'), init)).status).toBe(200);
  });
  it('rejects percent-encoded /api paths without token', async () => {
    expect((await makeApp().request(url('/%61pi/x'))).status).toBe(401);
  });
  it('accepts percent-encoded /api paths with token', async () => {
    expect((await makeApp().request(url('/%61pi/x'), { headers: { 'x-dev-plumbing-token': 'secret' } })).status).toBe(200);
  });
  it('treats percent-encoded health like health endpoint', async () => {
    expect((await makeApp().request(url('/%61pi/health'))).status).toBe(200);
  });
});
