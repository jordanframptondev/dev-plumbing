import { describe, expect, it } from 'vitest';
import { installPlugin, type Runner } from '../src/plugin';

function fakeRunner(fail: Record<string, string | NodeJS.ErrnoException> = {}) {
  const ran: string[] = [];
  const run: Runner = async (cmd, args) => {
    const line = [cmd, ...args].join(' ');
    ran.push(line);
    const key = Object.keys(fail).find((k) => line.startsWith(k));
    if (key) {
      const f = fail[key];
      throw typeof f === 'string' ? Object.assign(new Error('Command failed'), { stderr: f, stdout: '' }) : f;
    }
    return { stdout: '', stderr: '' };
  };
  return { run, ran };
}

const INSTALLED = 'Installed the Claude Code plugin. Restart any open Claude Code sessions, then run /plumb:rough-in path/to/plan.md in a repo.';
const ORDER = [
  'claude --version',
  'claude plugin uninstall dev-plumbing@dev-plumbing --scope user',
  'claude plugin marketplace add /src/dev-plumbing',
  'claude plugin install plumb@dev-plumbing --scope user',
];

describe('installing the plugin', () => {
  it('takes out the old dev-plumbing plugin, adds this repo as a marketplace and installs plumb for your user', async () => {
    const { run, ran } = fakeRunner();
    expect(await installPlugin('/src/dev-plumbing', run)).toBe(INSTALLED);
    // The old plugin goes first, while the marketplace still lists it.
    expect(ran).toEqual(ORDER);
  });

  it("says nothing about the old dev-plumbing plugin when it isn't installed", async () => {
    for (const said of ['Plugin "dev-plumbing@dev-plumbing" not found in installed plugins', 'Plugin "dev-plumbing@dev-plumbing" is not installed at scope user']) {
      const { run, ran } = fakeRunner({ 'claude plugin uninstall': said });
      expect(await installPlugin('/src/dev-plumbing', run)).toBe(INSTALLED);
      expect(ran).toEqual(ORDER);
    }
  });

  it("still installs plumb when the old plugin can't be taken out, and says how to take it out", async () => {
    // Like execFile's errors: the message names the command, which isn't the command's own output.
    const failure = Object.assign(new Error('Command failed: claude plugin uninstall dev-plumbing@dev-plumbing --scope user\nnot found'), { stderr: 'Error: permission denied', stdout: '' });
    const { run, ran } = fakeRunner({ 'claude plugin uninstall': failure });
    expect(await installPlugin('/src/dev-plumbing', run)).toBe(
      `${INSTALLED}\nCouldn't take out the old dev-plumbing@dev-plumbing plugin (Error: permission denied). Run claude plugin uninstall dev-plumbing@dev-plumbing yourself.`,
    );
    expect(ran).toEqual(ORDER);
  });

  it('is happy to run again', async () => {
    const { run, ran } = fakeRunner({
      'claude plugin marketplace add': 'Marketplace "dev-plumbing" is already installed',
      'claude plugin uninstall': 'Plugin "dev-plumbing@dev-plumbing" not found in installed plugins',
      'claude plugin install': 'Plugin plumb@dev-plumbing is already installed',
    });
    expect(await installPlugin('/src/dev-plumbing', run)).toMatch(/Installed/);
    expect(ran).toContain('claude plugin marketplace update dev-plumbing');
  });

  it('reports a real failure even when the repo path says "already"', async () => {
    const root = '/src/already-cloned/dev-plumbing';
    // Like execFile's errors: the message names the command, and so the path, before stderr.
    const failure = Object.assign(new Error(`Command failed: claude plugin marketplace add ${root}\nError: permission denied`), { stderr: 'Error: permission denied', stdout: '' });
    const { run, ran } = fakeRunner({ 'claude plugin marketplace add': failure });
    await expect(installPlugin(root, run)).rejects.toThrow(/claude plugin marketplace add failed: Error: permission denied/);
    expect(ran).not.toContain('claude plugin marketplace update dev-plumbing');
  });

  it("explains when Claude Code isn't installed, and when a command fails", async () => {
    const missing = fakeRunner({ 'claude --version': Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }) });
    expect(await installPlugin('/src/dev-plumbing', missing.run)).toMatch(/isn't on your PATH/);
    const broken = fakeRunner({ 'claude plugin install': 'Error: network unreachable' });
    await expect(installPlugin('/src/dev-plumbing', broken.run)).rejects.toThrow(/claude plugin install failed: Error: network unreachable/);
  });
});
