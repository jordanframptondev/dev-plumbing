import net from 'node:net';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { listen, PortInUseError } from '../src/listen';

async function freePort(): Promise<number> {
  const s = net.createServer().listen(0, '127.0.0.1');
  await once(s, 'listening');
  const port = (s.address() as net.AddressInfo).port;
  s.close();
  await once(s, 'close');
  return port;
}
const closers: (() => void)[] = [];
afterEach(() => closers.splice(0).forEach((f) => f()));

describe('listen', () => {
  it('serves on 127.0.0.1', async () => {
    const port = await freePort();
    const server = await listen(() => new Response('ok'), port);
    closers.push(() => server.close());
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('ok');
  });

  it('explains when another program has the port', async () => {
    const port = await freePort();
    const blocker = net.createServer().listen(port, '127.0.0.1');
    await once(blocker, 'listening');
    closers.push(() => blocker.close());
    const attempt = listen(() => new Response('ok'), port);
    await expect(attempt).rejects.toBeInstanceOf(PortInUseError);
    await expect(attempt).rejects.toThrow(/already in use by another program.*settings\.json/);
  });
});
