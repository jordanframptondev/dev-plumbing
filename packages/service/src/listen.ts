import { serve, type ServerType } from '@hono/node-server';

export class PortInUseError extends Error {}

export function listen(fetch: (request: Request) => Response | Promise<Response>, port: number): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch, port, hostname: '127.0.0.1' }, () => resolve(server));
    server.once('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'EADDRINUSE'
          ? new PortInUseError(`Port ${port} is already in use by another program. Change "port" in ~/.dev-plumbing/settings.json, then run dev-plumbing start again.`)
          : err,
      );
    });
  });
}
