# dev-plumbing

Plumb a feature plan before you build it. dev-plumbing turns a plan (for example a Superpowers spec) into a local web app where every question, concern, diagram and schema change has its own thread with Claude.

**Status:** the Claude loop works. Import a plan, answer threads in the app, and Claude replies through subagents. Visual screens, Finalize spec and Whiteboard Defense come next. The design is in [SPEC.md](SPEC.md), and the plans are in [docs/superpowers/plans](docs/superpowers/plans).

## Requirements

- macOS
- Node 22.12 or newer
- pnpm 10

## Install

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js setup
```

Setup creates `~/.dev-plumbing/`, asks where plumbing projects should live, turns on start-at-login, starts the app and opens http://localhost:4545.

To get a `dev-plumbing` command on your PATH:

```bash
cd packages/cli && pnpm link --global
```

## Use it

Setup installs the Claude Code plugin for your user (skip it with `--no-plugin`). `/dev-plumbing` is a Claude Code command, not a terminal command. Plugins load when a Claude Code session starts, so after setup, start a new session (or run `/reload-plugins` in an open one). Then, in any clone of a repo:

```
/dev-plumbing docs/specs/my-feature.md
```

- **First time in a repo:** Claude detects a repo profile. You can check it in **Settings → Repos**.
- **Import:** one subagent per plumbing type reads the plan, and the app opens on the plumbing project.
- **Answer:** in the app, answer threads, then press **Send this thread** or **Submit all**. Claude answers each thread with a subagent and listens for more.
- **Keep chatting:** after two minutes the listening call moves to the background, so you can keep using the Claude window.
- **No arguments:** `/dev-plumbing` lists this repo's plumbing projects to reopen.
- **Keep this checkout:** the plugin and the app both run from its build here. After you pull, run `pnpm build`, restart the app (`dev-plumbing stop`, then `dev-plumbing start`), and start a new Claude Code session.

How the app, the plugin, its agents and its tools fit together is explained in [docs/how-it-works.md](docs/how-it-works.md).

## Commands

```
dev-plumbing setup    create the config folder and start the app (safe to run again)
dev-plumbing start    start the service if it isn't running
dev-plumbing stop     stop the service
dev-plumbing status   is it running, and where is the config
dev-plumbing open     start if needed and open the app
dev-plumbing docs     rewrite ~/.dev-plumbing/README.md
dev-plumbing demo     add three example plumbing projects
```

## Configuration

Everything you can tune is a plain file in `~/.dev-plumbing/`. The README in that folder explains every setting, and the app's Settings and Plumbing rules pages edit the same files.

## Develop

```bash
pnpm dev              # service with reload on :4545, plus Vite on :5173 (open http://localhost:5173)
pnpm test             # unit tests
pnpm test:integration # builds, then starts and stops the real service
pnpm test:e2e         # builds, then runs Playwright against a temporary setup
pnpm check            # all of the above plus typecheck
pnpm smoke            # real Claude Code end to end, with a scratch repo (makes model calls)
claude --plugin-dir plugin   # try the plugin from this checkout without installing it
```
