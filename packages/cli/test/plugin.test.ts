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

describe('installing the plugin', () => {
  it('adds this repo as a marketplace and installs the plugin for your user', async () => {
    const { run, ran } = fakeRunner();
    expect(await installPlugin('/src/dev-plumbing', run)).toMatch(/Installed the Claude Code plugin/);
    expect(ran).toEqual([
      'claude --version',
      'claude plugin marketplace add /src/dev-plumbing',
      'claude plugin install dev-plumbing@dev-plumbing --scope user',
    ]);
  });

  it('is happy to run again', async () => {
    const { run, ran } = fakeRunner({
      'claude plugin marketplace add': 'Marketplace "dev-plumbing" is already installed',
      'claude plugin install': 'Plugin dev-plumbing@dev-plumbing is already installed',
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
