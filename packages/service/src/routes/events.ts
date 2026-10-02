import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Runtime } from '../runtime';

/** GET /api/events: live updates for the browser, as server-sent events. */
export function eventRoutes(rt: Runtime): Hono {
  const r = new Hono();
  r.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const off = rt.events.on((event) => {
        void stream.writeSSE({ data: JSON.stringify(event) });
      });
      stream.onAbort(off);
      await stream.writeSSE({ data: JSON.stringify({ type: 'hello' }) });
      while (!stream.aborted) {
        await stream.sleep(rt.pingMs);
        if (!stream.aborted) await stream.writeSSE({ event: 'ping', data: '' });
      }
      off();
    }),
  );
  return r;
}
