import fs from 'node:fs';
import path from 'node:path';
import { configPath, E2E_PORT, e2eTmp, readJson } from './env';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const BASE = `http://127.0.0.1:${E2E_PORT}`;
const token = (): string => JSON.parse(fs.readFileSync(configPath('run/service.json'), 'utf8')).token;

async function send(url: string, method: string, body?: unknown): Promise<Json> {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-dev-plumbing-token': token() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${url}: ${data.error}`);
  return data;
}

/** Calls the service the way the plugin's MCP server does. */
export const asClaude = (route: string, body: unknown) => send(`/api/claude${route}`, 'POST', body);
/** Calls the browser API directly, to set up a test. */
export const api = (route: string, method = 'GET', body?: unknown) => send(route, method, body);

/** The fixture clone, by its real path (git reports real paths; macOS temp folders sit behind a symlink). */
export const fixtureRepo = () => fs.realpathSync(path.join(e2eTmp(), 'acme-app'));

export type TestItem = {
  key: string;
  title: string;
  summary: string;
  body?: string;
  fields?: Record<string, string>;
  codeRefs?: { path: string; symbol?: string }[];
  links?: string[];
  data?: unknown;
  message?: { text: string; options?: { id: string; label: string; detail?: string; change?: unknown }[]; recommended?: string };
};

type ProjectId = { repo: string; project: string };
/** An item's file in the e2e projects folder. */
const itemFile = (p: ProjectId, itemId: string) => path.join(readJson('settings.json').projectsFolder, p.repo, p.project, 'items', `${itemId}.json`);
/** Reads an item file as it is on disk. */
export const rawItem = (p: ProjectId, itemId: string): Json => JSON.parse(fs.readFileSync(itemFile(p, itemId), 'utf8'));
/**
 * Replaces an item's data straight on disk, skipping the write checks, to stand in for a project made before
 * Plan 3 or data that doesn't fit. Only tests do this: the service is the only writer of the projects folder.
 * `undefined` removes the data.
 */
export function writeRawData(p: ProjectId, itemId: string, data: unknown) {
  fs.writeFileSync(itemFile(p, itemId), JSON.stringify({ ...rawItem(p, itemId), data }, null, 2));
}

export const PLAN_TEXT = (title: string) => `# ${title}\n\nRemind customers before an item runs out.\n\n## Data\n\nLog reminders in a table.\n\n## Channels\n\nSend by SMS.\n`;

/** Imports a fresh plumbing project from a new plan in the fixture repo. Types without items say "no changes". */
export async function importProject(name: string, title: string, items: Record<string, TestItem[]> = {}): Promise<{ repo: string; project: string; url: string }> {
  const rel = `docs/specs/${name}.md`;
  fs.mkdirSync(path.join(fixtureRepo(), 'docs', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(fixtureRepo(), rel), PLAN_TEXT(title));
  const open = await asClaude('/open', { cwd: fixtureRepo(), plan: rel });
  for (const t of open.importTypes as { id: string }[]) {
    const list = items[t.id];
    await asClaude('/items', {
      repo: open.repo,
      project: open.project,
      type: t.id,
      cwd: fixtureRepo(),
      ...(list?.length ? { items: list } : { noChanges: 'Nothing for this type in the test plan.' }),
    });
  }
  return { repo: open.repo, project: open.project, url: `/p/${open.repo}/${open.project}` };
}
