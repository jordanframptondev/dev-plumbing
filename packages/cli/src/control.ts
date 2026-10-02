import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, readRunFile, removeRunFile } from '@dev-plumbing/core';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function health(port: number, timeoutMs = 1000): Promise<{ pid: number; version: string } | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = (await res.json()) as { pid?: unknown; version?: unknown };
    return typeof body.pid === 'number' ? { pid: body.pid, version: String(body.version) } : null;
  } catch {
    return null;
  }
}

/** Whether a process with this pid still exists. Only ESRCH means it's gone (EPERM means it's someone else's). */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/** A failed health check may just be a slow service: only remove its run file once its process is gone. */
async function removeStaleRunFile(configDir: string, pid: number): Promise<void> {
  if (!pidAlive(pid)) await removeRunFile(configDir, pid);
}

async function tail(file: string, lines = 15): Promise<string> {
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  return text.trim().split('\n').slice(-lines).join('\n');
}

export async function startService(o: { configDir: string; serviceEntry: string; env?: NodeJS.ProcessEnv; waitMs?: number }) {
  const { settings } = await loadConfig(o.configDir);
  const run = await readRunFile(o.configDir);
  if (run) {
    const h = await health(run.port);
    if (h && h.pid === run.pid) return { status: 'already-running' as const, url: `http://localhost:${run.port}`, pid: run.pid };
    await removeStaleRunFile(o.configDir, run.pid);
  }
  const running = await health(settings.port);
  if (running) return { status: 'already-running' as const, url: `http://localhost:${settings.port}`, pid: running.pid };

  await fs.access(o.serviceEntry).catch(() => {
    throw new Error(`The service isn't built (${o.serviceEntry}). Run pnpm build first.`);
  });
  const logFile = path.join(o.configDir, 'run', 'service.log');
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  const out = openSync(logFile, 'a');
  const child = spawn(process.execPath, [o.serviceEntry], {
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, ...o.env, DEV_PLUMBING_HOME: o.configDir },
  });
  child.unref();
  const state = { exited: false };
  child.once('exit', () => {
    state.exited = true;
  });

  const waitMs = o.waitMs ?? 10_000;
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (state.exited) throw new Error(`The service stopped straight away:\n${await tail(logFile)}`);
    const h = await health(settings.port, 500);
    if (h) return { status: 'started' as const, url: `http://localhost:${settings.port}`, pid: h.pid };
    await sleep(200);
  }
  throw new Error(`The service didn't answer within ${waitMs / 1000}s. See ${logFile}.`);
}

export async function stopService(configDir: string, waitMs = 5000): Promise<'stopped' | 'not-running'> {
  const run = await readRunFile(configDir);
  if (!run) return 'not-running';
  const h = await health(run.port);
  if (!h || h.pid !== run.pid) {
    await removeStaleRunFile(configDir, run.pid);
    return 'not-running';
  }
  process.kill(run.pid, 'SIGTERM');
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!(await health(run.port, 300))) {
      await removeRunFile(configDir, run.pid);
      return 'stopped';
    }
    await sleep(150);
  }
  throw new Error(`The service (pid ${run.pid}) didn't stop within ${waitMs / 1000}s.`);
}

export async function serviceStatus(configDir: string): Promise<{ running: boolean; url?: string; pid?: number; version?: string }> {
  const run = await readRunFile(configDir);
  const port = run?.port ?? (await loadConfig(configDir)).settings.port;
  const h = await health(port);
  return h ? { running: true, url: `http://localhost:${port}`, pid: h.pid, version: h.version } : { running: false };
}
