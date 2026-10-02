import { execFile } from 'node:child_process';

export type Runner = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

export const execRunner: Runner = (cmd, args) =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: 120_000 }, (err, stdout, stderr) =>
      err ? reject(Object.assign(err, { stdout: String(stdout), stderr: String(stderr) })) : resolve({ stdout: String(stdout), stderr: String(stderr) }),
    ),
  );

export const MARKETPLACE = 'dev-plumbing';
export const PLUGIN_ID = `dev-plumbing@${MARKETPLACE}`;

type Failure = Error & { stdout?: string; stderr?: string; code?: string };
const output = (e: unknown) => `${(e as Failure).stderr ?? ''} ${(e as Failure).stdout ?? ''}`.trim();
const already = (e: unknown) => /already/i.test(`${output(e)} ${(e as Error).message}`);
const detail = (e: unknown) => (output(e) || (e as Error).message).split('\n')[0];

/**
 * Adds this repo as a local plugin marketplace and installs dev-plumbing for your user. Safe to run again.
 * A local marketplace loads the plugin in place, so a rebuild needs no reinstall.
 */
export async function installPlugin(repoRoot: string, run: Runner = execRunner): Promise<string> {
  try {
    await run('claude', ['--version']);
  } catch (e) {
    if ((e as Failure).code === 'ENOENT') return "Claude Code isn't on your PATH, so the plugin wasn't installed. Install Claude Code, then run dev-plumbing setup again.";
    throw new Error(`claude --version failed: ${detail(e)}`);
  }
  try {
    await run('claude', ['plugin', 'marketplace', 'add', repoRoot]);
  } catch (e) {
    if (!already(e)) throw new Error(`claude plugin marketplace add failed: ${detail(e)}`);
    await run('claude', ['plugin', 'marketplace', 'update', MARKETPLACE]).catch(() => undefined);
  }
  try {
    await run('claude', ['plugin', 'install', PLUGIN_ID, '--scope', 'user']);
  } catch (e) {
    if (!already(e)) throw new Error(`claude plugin install failed: ${detail(e)}`);
  }
  return 'Installed the Claude Code plugin. Restart any open Claude Code sessions, then run /dev-plumbing in a repo.';
}
