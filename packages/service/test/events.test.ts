import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import { call, makeContext, removeTempDirs } from './helpers';

afterAll(removeTempDirs);

describe('live events', () => {
  it('streams changes to the browser', async () => {
    const { ctx } = await makeContext();
    const rt = createRuntime({ pingMs: 20 });
    const res = await call(createApp(ctx, rt), '/api/events');
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let seen = '';
    const until = async (pattern: RegExp) => {
      while (!pattern.test(seen)) {
        const { value, done } = await reader.read();
        if (done) break;
        seen += decoder.decode(value);
      }
      return pattern.test(seen);
    };
    expect(await until(/"type":"hello"/)).toBe(true);
    rt.events.projectChanged('acme', 'restock-reminders');
    expect(await until(/"type":"project","repo":"acme","id":"restock-reminders"/)).toBe(true);
    expect(await until(/event: ping/)).toBe(true);
    await reader.cancel();
  });
});
