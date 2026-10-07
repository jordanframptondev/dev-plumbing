import { Hono } from 'hono';
import type { AppContext } from './context';
import { claudeRoutes } from './routes/claude';
import { configRoutes } from './routes/config';
import { eventRoutes } from './routes/events';
import { finalizeRoutes } from './routes/finalize';
import { kitScript, mockupRoutes } from './routes/mockups';
import { projectRoutes } from './routes/projects';
import { threadRoutes } from './routes/threads';
import { versionRoutes } from './routes/versions';
import { whiteboardRoutes } from './routes/whiteboard';
import { createRuntime, type Runtime } from './runtime';
import { frameHeaders, guard } from './security';
import { staticHandler } from './static';

export function createApp(ctx: AppContext, rt: Runtime = createRuntime()): Hono {
  const app = new Hono();
  app.use('*', frameHeaders());
  app.use('*', guard({ port: ctx.port, token: ctx.token, extraOrigins: ctx.extraOrigins }));
  app.get('/api/health', (c) => c.json({ ok: true, version: ctx.version, pid: process.pid }));
  app.route('/api', eventRoutes(rt));
  app.route('/api', projectRoutes(ctx, rt));
  app.route('/api', threadRoutes(ctx, rt));
  app.route('/api', finalizeRoutes(ctx, rt));
  app.route('/api', whiteboardRoutes(ctx, rt));
  app.route('/api', versionRoutes(ctx));
  app.route('/api', mockupRoutes(ctx));
  app.route('/api', configRoutes(ctx, rt));
  app.route('/api/claude', claudeRoutes(ctx, rt));
  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
  app.get('/kit/tailwind.js', kitScript);
  app.get('*', staticHandler(ctx.webDist));
  return app;
}
