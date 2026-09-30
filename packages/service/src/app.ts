import { Hono } from 'hono';
import type { AppContext } from './context';
import { guard } from './security';
import { staticHandler } from './static';
import { projectRoutes } from './routes/projects';

export function createApp(ctx: AppContext): Hono {
  const app = new Hono();
  app.use('*', guard({ port: ctx.port, token: ctx.token, extraOrigins: ctx.extraOrigins }));
  app.get('/api/health', (c) => c.json({ ok: true, version: ctx.version, pid: process.pid }));
  app.route('/api', projectRoutes(ctx));
  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
  app.get('*', staticHandler(ctx.webDist));
  return app;
}
