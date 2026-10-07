# dev-plumbing

Plumb a feature plan before you build it. dev-plumbing turns a plan (for example a Superpowers spec) into a local web app where every question, concern, diagram and schema change has its own thread with Claude.

**Status:** the Claude loop, the visual screens, Finalize spec, bringing in a changed plan and the Whiteboard Defense work. Present, which draws the Whiteboard Defense as an animated whiteboard, comes next. The design is in [SPEC.md](SPEC.md), and the plans are in [docs/superpowers/plans](docs/superpowers/plans).

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

- **First time in a repo:** Claude detects a repo profile. You can check it in **Settings → Repos**. **Detect again** there looks at the repo afresh, and keeps the profile's name, its remotes and your own settings.
- **Import:** one subagent per plumbing type reads the plan, and the app opens on the plumbing project.
- **Answer:** in the app, answer threads, then press **Send this thread** or **Submit all**. Claude answers each thread with a subagent and listens for more.
- **Finalize:** once nothing blocks it, **Finalize spec** asks Claude to write the final spec from the draft and your decisions. Preview it, and see what changed since the last final, then **Accept**. The final is saved in the plumbing project and copied into the repo as `<name>.final.md`, next to the plan, with its mockups in `<name>.assets/`. The app then suggests the next command, such as `writing-plans docs/specs/my-feature.final.md`.
- **The plan changed in the repo?** Run `/dev-plumbing docs/specs/my-feature.md` again. Claude says what changed and asks **Update to v2?** On yes:
  - the version you had is kept, under **Documents → Versions**;
  - the repo's changes are merged into your draft;
  - the importers run again, keeping your items, threads and answers.

  Where you and the repo both changed the same passage, your draft keeps your text, and a **Plan changes** thread offers Claude's merged version, the repo's version and your own, each one click to accept. When the repo's version is mostly a rewrite, Claude also offers **Start the draft from v2**. **Not now** opens the project as it was, and Claude asks again next time.
- **Whiteboard Defense:** "If you ship it, you should be able to explain it." The header's **Whiteboard Defense** button opens its page, where **Generate** asks Claude to write a defense of the plan, from the final while it's current, else the draft. It follows `outputs/whiteboard-defense.md`: a review level, 13 sections, the questions you should be able to answer, the release concerns and its 20-line checklist, with every statement marked **Known**, **Inferred**, **Unknown** or **Verify before release**.
  - **Study** reads it as a page. **Ask Claude about this**, on any section, question or concern, starts a thread about it. **Send to Questions** turns an unknown into a question, and **Send to Concerns** turns a release concern into a concern, each with Claude's suggested answers.
  - **Practice** shows the questions as flashcards: show the answer, rate yourself, and the next card comes up. Space, 1 to 3 and the arrow keys work too, and **Only shaky and couldn't** keeps the cards you're not sure of. A readiness meter, half flashcards and half checklist, sits with the checklist.
  - When the plan changes, it's marked **Out of date**, and **Regenerate** writes it again. **Export .md** writes it into the repo as `<name>.whiteboard-defense.md`, next to the plan, with its diagram drawn in Mermaid.
- **Keep chatting:** after two minutes the listening call moves to the background, so you can keep using the Claude window.
- **No arguments:** `/dev-plumbing` lists this repo's plumbing projects to reopen.
- **Keep this checkout:** the plugin and the app both run from its build here. After you pull, run `pnpm build`, restart the app (`dev-plumbing stop`, then `dev-plumbing start`), and start a new Claude Code session.

How the app, the plugin, its agents and its tools fit together is explained in [docs/how-it-works.md](docs/how-it-works.md).

## Screens

Each plumbing type has its own screen in the app:
- **Questions, Concerns, Ideas, Testing and Security:** lists you answer in place.
- **Architecture:** each diagram as boxes and lines, grouped by app or package. Marks show what's new, changed, unchanged or external, and ✓ marks file references that exist in your repo. Click a box to ask about it.
- **Database:** a relationship strip, a migration panel, and one diff card per table, shown as a visual diff or as Prisma. Tables are checked against your repo's Prisma schema.
- **UI changes:** each screen as a mockup built with your app's own design kit, on Desktop or Mobile, Before or After. **+ Pin** starts a thread on any part of it.
- **Flows:** user flows as storyboards and system flows as sequence diagrams, or both, with matching step numbers.
- **Phases & milestones:** a timeline of phases, each with its goal, its "done when" and its items.
- **Plan changes:** after you bring in a new version of the plan, each passage that you and the repo both changed, with Claude's merged version, the repo's and yours to pick from. It's only there once an update finds one.
- **Defense questions:** your questions to Claude about the Whiteboard Defense, one thread each. It's only there once you've asked one, and it never blocks Finalize or goes into the final.

Every thread also draws its item, and shows what a proposed change does to the drawing before you accept it.

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
