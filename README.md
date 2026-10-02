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

Setup installs the Claude Code plugin for your user (skip it with `--no-plugin`). In any clone of a repo, in Claude Code:

```
/dev-plumbing docs/specs/my-feature.md
```

- **First time in a repo:** Claude detects a repo profile. You can check it in **Settings → Repos**.
- **Import:** one subagent per plumbing type reads the plan, and the app opens on the plumbing project.
- **Answer:** in the app, answer threads, then press **Send this thread** or **Submit all**. Claude answers each thread with a subagent and listens for more.
- **Keep chatting:** after two minutes the listening call moves to the background, so you can keep using the Claude window.
- **No arguments:** `/dev-plumbing` lists this repo's plumbing projects to reopen.
- **Keep this checkout:** the plugin runs from its build here, so after you pull, run `pnpm build` again.

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
