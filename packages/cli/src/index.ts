import { execFile } from 'node:child_process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { configDir, disableLoginItem, enableLoginItem, expandHome, loadConfig, VERSION, writeDemoProjects, writeReadme } from '@dev-plumbing/core';
import { serviceStatus, startService, stopService } from './control';
import { runSetup } from './setup';

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const SERVICE_ENTRY = here('../../service/dist/index.js');
const DEFAULTS_DIR = process.env.DEV_PLUMBING_DEFAULTS ?? here('../../../defaults');
const CLI_PATH = fileURLToPath(import.meta.url);

function openUrl(url: string) {
  if (process.platform === 'darwin') execFile('open', [url]);
  else console.log(`Open ${url} in your browser.`);
}

async function ask(question: string, fallback: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(`${question} [${fallback}] `)).trim() || fallback;
  } finally {
    rl.close();
  }
}

async function run(task: () => Promise<void>) {
  try {
    await task();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}

const program = new Command().name('dev-plumbing').description('Plumb a plan: views, threads and answers in a local app.').version(VERSION);

program
  .command('setup')
  .description('Create ~/.dev-plumbing, choose where plumbing projects live, and start the app.')
  .option('--projects-folder <path>', 'where plumbing projects are stored')
  .option('--port <number>', 'port for the app', (v) => Number(v))
  .option('--no-login-item', "don't start at login, and don't touch the login item")
  .option('--no-start', "don't start the service or open the browser afterwards")
  .option('-y, --yes', 'keep the current or default answers without asking')
  .action((opts: { projectsFolder?: string; port?: number; loginItem: boolean; start: boolean; yes?: boolean }) =>
    run(async () => {
      const dir = configDir();
      await runSetup({
        configDir: dir,
        defaultsDir: DEFAULTS_DIR,
        projectsFolder: opts.projectsFolder,
        port: opts.port,
        loginItem: opts.loginItem,
        yes: Boolean(opts.yes),
        ask,
        enableLogin: async () => {
          await enableLoginItem({ nodePath: process.execPath, cliPath: CLI_PATH, configDir: dir });
        },
        disableLogin: async () => {
          await disableLoginItem();
        },
        log: (line) => console.log(line),
      });
      if (opts.start) {
        const r = await startService({ configDir: dir, serviceEntry: SERVICE_ENTRY });
        console.log(`dev-plumbing is running at ${r.url}`);
        openUrl(r.url);
      }
    }),
  );

program.command('start').description('Start the service if it is not running.').action(() =>
  run(async () => {
    const r = await startService({ configDir: configDir(), serviceEntry: SERVICE_ENTRY });
    console.log(r.status === 'started' ? `Started at ${r.url}` : `Already running at ${r.url}`);
  }),
);

program.command('stop').description('Stop the service.').action(() =>
  run(async () => {
    console.log((await stopService(configDir())) === 'stopped' ? 'Stopped.' : 'It was not running.');
  }),
);

program.command('status').description('Show whether the service is running.').action(() =>
  run(async () => {
    const dir = configDir();
    const s = await serviceStatus(dir);
    console.log(s.running ? `Running at ${s.url} (pid ${s.pid}, version ${s.version})` : 'Not running.');
    console.log(`Config folder: ${dir}`);
  }),
);

program.command('open').description('Start the service if needed and open the app.').action(() =>
  run(async () => {
    const r = await startService({ configDir: configDir(), serviceEntry: SERVICE_ENTRY });
    openUrl(r.url);
  }),
);

program.command('docs').description('Rewrite ~/.dev-plumbing/README.md.').action(() =>
  run(async () => {
    console.log(`Wrote ${await writeReadme(configDir())}`);
  }),
);

program.command('demo').description('Add three example plumbing projects so you can look around.').action(() =>
  run(async () => {
    const { settings } = await loadConfig(configDir());
    const created = await writeDemoProjects(expandHome(settings.projectsFolder));
    console.log(created.length ? `Added ${created.length} example projects.` : 'The example projects are already there.');
  }),
);

await program.parseAsync(process.argv);
