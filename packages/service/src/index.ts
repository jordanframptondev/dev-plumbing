import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { configDir, disableLoginItem, enableLoginItem, isLoginItemEnabled, loadConfig, removeRunFile, VERSION, writeRunFile } from '@dev-plumbing/core';
import { createApp } from './app';
import { listen, PortInUseError } from './listen';
import { createRuntime } from './runtime';

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

async function main() {
  const dir = configDir();
  const { settings } = await loadConfig(dir);
  const token = randomBytes(24).toString('hex');
  const cliPath = here('../../cli/dist/index.js');
  const rt = createRuntime();
  const app = createApp({
    configDir: dir,
    defaultsDir: process.env.DEV_PLUMBING_DEFAULTS ?? here('../../../defaults'),
    webDist: here('../../web/dist'),
    port: settings.port,
    token,
    version: VERSION,
    extraOrigins: process.env.DEV_PLUMBING_DEV ? ['localhost:5173', '127.0.0.1:5173'] : [],
    open: (target) => new Promise<void>((resolve, reject) => execFile('open', [target], (err) => (err ? reject(err) : resolve()))),
    loginItem: {
      enable: async () => {
        await enableLoginItem({ nodePath: process.execPath, cliPath, configDir: dir });
      },
      disable: async () => {
        await disableLoginItem();
      },
      isEnabled: () => isLoginItemEnabled(),
    },
  }, rt);

  let server: Awaited<ReturnType<typeof listen>>;
  try {
    server = await listen(app.fetch, settings.port);
  } catch (e) {
    console.error(e instanceof PortInUseError ? e.message : e);
    process.exit(1);
  }
  await writeRunFile(dir, { pid: process.pid, port: settings.port, token, startedAt: new Date().toISOString(), version: VERSION });
  // Quiet windows stop showing as "Claude listening" even when nothing else happens. Often enough for the 10 s gap between polls.
  setInterval(() => rt.listeners.sweep(), 5_000).unref();
  console.log(`dev-plumbing is running at http://localhost:${settings.port}`);

  const stop = async () => {
    server.close();
    await removeRunFile(dir, process.pid);
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

void main();
