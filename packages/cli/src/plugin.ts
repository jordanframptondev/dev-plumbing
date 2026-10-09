import { execFile } from 'node:child_process';

export type Runner = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

export const execRunner: Runner = (cmd, args) =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: 120_000 }, (err, stdout, stderr) =>
      err ? reject(Object.assign(err, { stdout: String(stdout), stderr: String(stderr) })) : resolve({ stdout: String(stdout), stderr: String(stderr) }),
    ),
  );

export const MARKETPLACE = 'dev-plumbing';
export const PLUGIN_ID = `plumb@${MARKETPLACE}`;
/** What the plugin was called before it was plumb. Setup takes it out if it can, so an existing install moves over. */
export const OLD_PLUGIN_ID = `dev-plumbing@${MARKETPLACE}`;

type Failure = Error & { stdout?: string; stderr?: string; code?: string };
const output = (e: unknown) => `${(e as Failure).stderr ?? ''} ${(e as Failure).stdout ?? ''}`.trim();
// Only the command's own output: execFile's message names the command, and so the repo path, which may say "already".
const already = (e: unknown) => /already/i.test(output(e));
const notInstalled = (e: unknown) => /not (installed|found)/i.test(output(e));
const detail = (e: unknown) => (output(e) || (e as Error).message).split('\n')[0];

/**
 * Adds this repo as a local plugin marketplace and installs plumb for your user, in place of the old dev-plumbing
 * plugin. Safe to run again.
 * A local marketplace loads the plugin in place, so a rebuild needs no reinstall. Taking the old plugin out is
 * best-effort: it runs first, while the marketplace still lists it, and when it fails for any reason but "not
 * installed", plumb is installed all the same and the message ends with a line saying so.
 */
export async function installPlugin(repoRoot: string, run: Runner = execRunner): Promise<string> {
  try {
    await run('claude', ['--version']);
  } catch (e) {
    if ((e as Failure).code === 'ENOENT') return "Claude Code isn't on your PATH, so the plugin wasn't installed. Install Claude Code, then run dev-plumbing setup again.";
    throw new Error(`claude --version failed: ${detail(e)}`);
  }
  let oldPlugin: string | null = null;
  try {
    await run('claude', ['plugin', 'uninstall', OLD_PLUGIN_ID, '--scope', 'user']);
  } catch (e) {
    if (!notInstalled(e)) oldPlugin = `Couldn't take out the old ${OLD_PLUGIN_ID} plugin (${detail(e)}). Run claude plugin uninstall ${OLD_PLUGIN_ID} yourself.`;
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
  const installed = 'Installed the Claude Code plugin. Restart any open Claude Code sessions, then run /plumb:rough-in path/to/plan.md in a repo.';
  return oldPlugin ? `${installed}\n${oldPlugin}` : installed;
}
