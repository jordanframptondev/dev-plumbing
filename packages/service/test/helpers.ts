import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Hono } from 'hono';
import { installDefaults, updateSettingsFile, writeDemoProjects } from '@dev-plumbing/core';
import type { AppContext } from '../src/context';

export const TOKEN = 'test-token';
export const DEFAULTS_DIR = path.resolve(import.meta.dirname, '../../../defaults');

export async function makeContext(overrides: Partial<AppContext> = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-svc-'));
  const configDir = path.join(tmp, 'config');
  const root = path.join(tmp, 'projects');
  await installDefaults({ configDir, defaultsDir: DEFAULTS_DIR });
  await updateSettingsFile(configDir, { projectsFolder: root });
  await writeDemoProjects(root, new Date('2026-09-30T12:00:00Z'));
  const opened: string[] = [];
  const login: string[] = [];
  const ctx: AppContext = {
    configDir,
    defaultsDir: DEFAULTS_DIR,
    webDist: path.join(tmp, 'web'),
    port: 4545,
    token: TOKEN,
    version: '0.1.0',
    home: tmp,
    open: async (target) => {
      opened.push(target);
    },
    loginItem: {
      enable: async () => {
        login.push('enable');
      },
      disable: async () => {
        login.push('disable');
      },
    },
    ...overrides,
  };
  return { ctx, tmp, root, opened, login };
}

export function call(app: Hono, pathname: string, init: RequestInit = {}) {
  return app.request(`http://localhost:4545${pathname}`, {
    ...init,
    headers: { 'x-dev-plumbing-token': TOKEN, 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  });
}
