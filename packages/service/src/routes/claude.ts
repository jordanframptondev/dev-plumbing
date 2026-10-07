import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  checklistLines,
  claimImport,
  currentVersion,
  expandHome,
  finalizePack,
  finalName,
  findProjects,
  finishDetect,
  finishFinalize,
  finishImport,
  finishSubmission,
  finishWhiteboard,
  finishWindowSubmissions,
  formatZodError,
  gitHead,
  gitInfo,
  groupThreads,
  importableTypes,
  importBatchSchema,
  importPack,
  InputError,
  linkIntoClone,
  loadConfig,
  matchProfile,
  mergeDetected,
  normalizeRemote,
  openPlan,
  pendingDetect,
  pendingSubmissions,
  pickUp,
  pickUpFinalize,
  pickUpWhiteboard,
  planChange,
  postReply,
  readFinalize,
  readItem,
  readProjectFile,
  readSubmission,
  readThread,
  readWhiteboardRequest,
  recordClone,
  relevantDecisions,
  replySchema,
  repoProfileSchema,
  repoProjectsFolder,
  requeueFinalize,
  requeueUnfinished,
  requeueWhiteboard,
  resolvePlan,
  saveDefense,
  saveProposal,
  StoreError,
  suggestRepoName,
  summarizeProject,
  threadPack,
  updatePlan,
  updateRefusal,
  whiteboardPack,
  writeImportBatch,
  writeJsonAtomic,
  type FinalizeRequest,
  type LoadedConfig,
  type PlanChange,
  type PlumbingType,
  type ProjectRef,
  type Submission,
  type UpdateResult,
  type WhiteboardRequest,
} from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { cloneOf } from '../checker';
import { handle } from '../errors';
import { EXPECTED_OBJECT, readJsonObject } from '../json';
import { locateProject } from '../locate';
import { projectKey, type Runtime } from '../runtime';

/** Below Node fetch's 300 s headers timeout, so the MCP server's long-poll never trips it. */
export const MAX_POLL_SECONDS = 240;

const NO_REMOTE = "This repo has no git remote, so dev-plumbing can't recognise its other clones. Add one (git remote add origin <url>), then run /dev-plumbing again.";

/**
 * What the skill asks when the plan in the repo changed since the project's current version. `branch` is set when
 * this clone is on another branch than the current version came from.
 */
function updateQuestion(change: PlanChange, branch: string | null): string {
  const added = `${change.added} ${change.added === 1 ? 'line' : 'lines'}`;
  const changed = branch ? `The plan on branch ${branch} changed since v${change.from}` : `The plan changed in the repo since v${change.from}`;
  const conflicts = `${change.conflicts} ${change.conflicts === 1 ? 'conflict' : 'conflicts'}`;
  const why = change.whitespaceOnly ? ' Only the formatting changed.' : change.suggestFresh ? ` It's mostly rewritten, so merging would leave ${conflicts}.` : '';
  return `${changed} (${added} added, ${change.removed} removed).${why} Update to v${change.to}?`;
}

/** plan-changed's next: the question, its options, and how to call dp_open with the answer. */
function askNext(change: PlanChange, branch: string | null): string {
  const ask = `Ask the user: "${updateQuestion(change, branch)}"`;
  const to = change.to;
  return change.suggestFresh
    ? `${ask} with the options "Update to v${to} (merge into my draft)", "Start the draft from v${to}" and "Not now". Then call dp_open again with the same plan or project and update: true for the first, update: true with fresh: true for the second, or update: false for Not now.`
    : `${ask} with the options "Update to v${to}" and "Not now". Then call dp_open again with the same plan or project and update: true or update: false.`;
}

/** The one line the skill tells the user once an update is in. */
function updatedLine(u: UpdateResult): string {
  if (u.fresh) return `v${u.version}: the draft now starts from the plan's v${u.version}. Your earlier draft is kept under Versions.`;
  const merged = `${u.clean} ${u.clean === 1 ? 'change' : 'changes'} merged`;
  return u.conflicts ? `v${u.version}: ${merged}, ${u.conflicts} to settle in Plan changes.` : `v${u.version}: ${merged}, nothing to settle.`;
}

const projectBody = z.object({ repo: z.string().min(1), project: z.string().min(1) });
const openBody = z.object({
  cwd: z.string().min(1),
  plan: z.string().min(1).optional(),
  project: z.string().min(1).optional(),
  windowId: z.string().optional(),
  // The user's answer to plan-changed: true brings the repo's new version in, false opens the project as it was.
  update: z.boolean().optional(),
  // With update: true, start the draft again from the repo's new version instead of merging into it.
  fresh: z.boolean().optional(),
});
const profileBody = z.object({ cwd: z.string().min(1), profile: z.unknown().optional() });
const itemsBody = importBatchSchema.merge(projectBody).extend({ type: z.string().min(1), cwd: z.string().optional() });
const waitBody = projectBody.extend({
  windowId: z.string().min(1),
  timeoutSeconds: z.number().min(0).max(600).optional(),
  // What the window just finished: a submission (with any conflicts it found), a finalize request (its id), a
  // Detect again (the repo), or a Whiteboard Defense request (its id, and the subagent's Failed: line if it gave up).
  finished: z
    .object({
      submission: z.string().min(1).optional(),
      conflicts: z.array(z.object({ threads: z.array(z.string()).min(1), text: z.string().min(1) })).default([]),
      finalize: z.string().min(1).optional(),
      detect: z.string().min(1).optional(),
      whiteboard: z.string().min(1).optional(),
      // The whiteboard subagent's own "Failed: …" line, when it gave up: the request's reason.
      whiteboardError: z.string().optional(),
    })
    .optional(),
});
const aliveBody = z.object({ windowId: z.string().min(1) });
const contextBody = projectBody.extend({
  threadId: z.string().optional(),
  importType: z.string().optional(),
  finalize: z.boolean().optional(),
  whiteboard: z.boolean().optional(),
});
const replyBody = replySchema.merge(projectBody).extend({ cwd: z.string().optional() });
// The 1–500,000 character limit is saveProposal's, so its message is the one Claude reads.
const finalizeBody = projectBody.extend({ request: z.string().min(1), markdown: z.string() });
// The defense is checked by saveDefense, which lists every problem in its own words, so it's taken as it comes here.
const whiteboardBody = projectBody.extend({ request: z.string().min(1), defense: z.unknown() });

async function parse<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  const body = await readJsonObject(c);
  if (!body) throw new InputError(EXPECTED_OBJECT.error);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new InputError(formatZodError(parsed.error));
  return parsed.data;
}

export function claudeRoutes(ctx: AppContext, rt: Runtime): Hono {
  const r = new Hono();
  const urlFor = (repo: string, id: string) => `http://localhost:${ctx.port}/p/${encodeURIComponent(repo)}/${encodeURIComponent(id)}`;
  const openInBrowser = async (cfg: LoadedConfig, ref: ProjectRef) => {
    if (cfg.settings.openBrowserOnImport) await ctx.open(urlFor(ref.repo, ref.id)).catch(() => undefined);
  };
  /** The clone to check code references in: the caller's, or the one the plan was imported from. */
  const cloneFor = async (cwd: string | undefined, ref: ProjectRef) => {
    const info = cwd ? await gitInfo(cwd).catch(() => null) : null;
    return info?.root ?? expandHome((await readProjectFile(ref.dir)).source.clone, ctx.home);
  };
  const changed = (ref: ProjectRef) => rt.events.projectChanged(ref.repo, ref.id);
  /** outputs/finalize.md from the config folder, or the shipped default when the user's copy is missing. */
  const finalizeRules = () =>
    fs.readFile(path.join(ctx.configDir, 'outputs', 'finalize.md'), 'utf8').catch(() => fs.readFile(path.join(ctx.defaultsDir, 'outputs', 'finalize.md'), 'utf8'));
  /** outputs/whiteboard-defense.md in the config folder, or the shipped default when the user's copy is missing. */
  const whiteboardRulesFile = async () => {
    const mine = path.resolve(ctx.configDir, 'outputs', 'whiteboard-defense.md');
    return (await fs.access(mine).then(() => true, () => false)) ? mine : path.resolve(ctx.defaultsDir, 'outputs', 'whiteboard-defense.md');
  };
  /** A window that comes back (it opens a project, or listens again) is done with any Detect again it was handed. */
  const cameBack = (windowId: string) => {
    for (const h of rt.detects.values()) if (h.windowId === windowId) h.back = true;
  };
  /**
   * How long a window holds a Detect again it was handed, even when it isn't alive as a listener: a window that got
   * the request through /open isn't listening anywhere while its repo-setup subagent runs.
   */
  const DETECT_HOLD_MS = 10 * 60_000;
  /**
   * Hands this repo's Detect again request to the window, if there is one and nobody holds it. A request goes to one
   * window at a time. A window that isn't back holds it while it's alive, or for DETECT_HOLD_MS after it was handed
   * out, whichever lasts longer. Once a window came back from it, it isn't handed out again until Detect again is
   * pressed again, so a repo-setup subagent that can't save never runs in a loop. Without a window id it's handed out
   * every time, and nothing is recorded.
   */
  const handOutDetect = (repo: string, windowId: string | undefined) =>
    rt.withLock('config:repos', async () => {
      if (!(await pendingDetect(ctx.configDir, repo))) return false;
      const held = rt.detects.get(repo);
      if (held && (held.back || rt.listeners.isAlive(held.windowId) || rt.now() - held.at < DETECT_HOLD_MS)) return false;
      if (windowId) rt.detects.set(repo, { windowId, at: rt.now(), back: false });
      return true;
    });

  r.post(
    '/open',
    handle(async (c) => {
      const body = await parse(c, openBody);
      const cfg = await loadConfig(ctx.configDir);
      const git = await gitInfo(body.cwd);
      if (!git.remote) {
        throw new InputError(NO_REMOTE);
      }
      const models = cfg.agents.models;
      const profile = matchProfile(git.remote, cfg.repos);
      if (!profile) {
        return c.json({
          kind: 'needs-profile',
          remote: normalizeRemote(git.remote),
          clone: git.root,
          suggestedName: suggestRepoName(git.remote, git.root),
          model: models.repoSetup,
          next: `Start the dev-plumbing:repo-setup subagent (model ${models.repoSetup}) with the clone path. When it returns, call dp_open again with the same arguments.`,
        });
      }
      // The user pressed Detect again for this repo's profile: that comes before opening.
      if (body.windowId) cameBack(body.windowId);
      if (await handOutDetect(profile.name, body.windowId)) {
        return c.json({
          kind: 'needs-profile',
          redetect: true,
          name: profile.name,
          remote: normalizeRemote(git.remote),
          clone: git.root,
          suggestedName: profile.name,
          model: models.repoSetup,
          next: `The user asked for the ${profile.name} repo profile to be detected again. Start the dev-plumbing:repo-setup subagent (model ${models.repoSetup}) with the clone path. When it returns, call dp_open again with the same arguments.`,
        });
      }
      const folder = repoProjectsFolder(cfg.settings, profile, ctx.home);
      if (profile.linkIntoClones.enabled) {
        await linkIntoClone({ clone: git.root, excludeFile: git.excludeFile, folder, linkName: profile.linkIntoClones.linkName }).catch(() => 'blocked');
      }

      if (!body.plan && !body.project) {
        const refs = (await findProjects(cfg.settings, cfg.repos, ctx.home)).filter((x) => x.repo === profile.name);
        const summaries = await Promise.all(refs.map(summarizeProject));
        return c.json({
          kind: 'pick-project',
          repo: profile.name,
          projects: summaries.map((s) => ({ id: s.id, title: s.title, sourcePath: s.sourcePath, waiting: s.counts.yourTurn + s.counts.drafts, status: s.status })),
          next: summaries.length
            ? 'Ask the user which plumbing project to open, then call dp_open with project set to its id.'
            : `There are no plumbing projects for ${profile.name} yet. Tell the user to run /dev-plumbing path/to/plan.md.`,
        });
      }

      let ref: ProjectRef;
      let created = false;
      // For a project that already existed: the plan as it is in this clone, which may have changed since.
      let repoText: string | null = null;
      if (body.project) {
        try {
          ref = (await locateProject(ctx, profile.name, body.project)).ref;
        } catch (e) {
          if (e instanceof StoreError) throw new InputError(`There's no plumbing project "${body.project}" for ${profile.name}. Call dp_open with no arguments to list them.`);
          throw e;
        }
        // Picked by id, so read the plan at the project's path in this clone. A clone without it just opens the project.
        const { source } = await readProjectFile(ref.dir);
        repoText = await resolvePlan({ root: git.root, cwd: git.root, plan: source.path }).then(
          (plan) => plan.text,
          () => null,
        );
      } else {
        const plan = await resolvePlan({ root: git.root, cwd: body.cwd, plan: body.plan! });
        const enabledTypes = importableTypes(cfg.types).map((t) => t.id);
        const opened = await rt.withLock(`open:${folder}`, () => openPlan({ folder, repo: profile.name, clone: git.root, branch: git.branch, plan, enabledTypes, home: ctx.home }));
        ref = { repo: profile.name, id: opened.id, dir: opened.dir };
        created = opened.created;
        if (!created) repoText = plan.text;
      }

      const key = projectKey(ref.repo, ref.id);
      const isAlive = (w: string) => rt.listeners.isAlive(w);
      // A plan that changed in the repo is never brought in without asking. Without `update`, the answer is
      // plan-changed, before anything is written, and the skill asks the user. update: true brings the new version in;
      // update: false opens the project as it was, and the next open asks again. When the update would have to wait
      // (an import, threads queued for Claude, a finalize), the project opens instead, so this window can finish that
      // work, and the user is told why.
      let update: UpdateResult | null = null;
      let tell: string | null = null;
      if (repoText !== null && body.update !== false) {
        const text = repoText;
        const commit = body.update ? await gitHead(git.root) : null;
        const outcome = await rt.withLock(key, async () => {
          const change = await planChange(ref.dir, text);
          if (!change) return null;
          const project = await readProjectFile(ref.dir);
          const current = currentVersion(project);
          if ('older' in change) {
            return { kind: 'tell' as const, line: `This clone has the plan's v${change.older}, older than the project's v${current.n}. There's nothing to bring in.` };
          }
          // Work that a window which is gone had picked up goes back in the queue first, so this one can take it.
          await requeueUnfinished(ref.dir, isAlive);
          await requeueFinalize(ref.dir, isAlive);
          await requeueWhiteboard(ref.dir, isAlive);
          const refused = await updateRefusal(ref.dir);
          if (refused) return { kind: 'tell' as const, line: `The plan changed in the repo since v${change.from}. ${refused}` };
          if (!body.update) return { kind: 'ask' as const, change, title: project.title, branch: git.branch === current.branch ? null : git.branch };
          const result = await updatePlan(ref.dir, { repoText: text, clone: git.root, branch: git.branch, commit, types: cfg.types, fresh: body.fresh === true, home: ctx.home });
          // Claimed under the same lock, by a window that counts as alive: another window's dp_wait queued behind this
          // lock would otherwise end the re-import before this window starts its importers.
          if (body.windowId) {
            rt.listeners.seen(body.windowId, key);
            await claimImport(ref.dir, body.windowId);
          }
          return { kind: 'updated' as const, result };
        });
        if (outcome?.kind === 'ask') {
          const { change } = outcome;
          return c.json({
            kind: 'plan-changed',
            repo: ref.repo,
            project: ref.id,
            title: outcome.title,
            url: urlFor(ref.repo, ref.id),
            version: change.from,
            nextVersion: change.to,
            added: change.added,
            removed: change.removed,
            conflicts: change.conflicts,
            suggestFresh: change.suggestFresh,
            whitespaceOnly: change.whitespaceOnly,
            branch: git.branch,
            next: askNext(change, outcome.branch),
          });
        }
        if (outcome?.kind === 'tell') tell = outcome.line;
        if (outcome?.kind === 'updated') update = outcome.result;
      }
      if (body.windowId) rt.listeners.seen(body.windowId, key);
      await rt.withLock(key, async () => {
        // Every clone a project is opened from is remembered, so Accept can offer it.
        await recordClone(ref.dir, git.root, ctx.home);
        await requeueUnfinished(ref.dir, isAlive);
        await requeueFinalize(ref.dir, isAlive);
        await requeueWhiteboard(ref.dir, isAlive);
        // This window runs the importers, so it's the one whose dp_wait may end the import.
        const { importPending } = await readProjectFile(ref.dir);
        if (body.windowId && importableTypes(cfg.types).some((t) => importPending.includes(t.id))) await claimImport(ref.dir, body.windowId);
      });
      const project = await readProjectFile(ref.dir);
      // Flows and phases point at items the other importers write (a step's mockupId, a phase's itemIds), so they go last.
      const later = (t: PlumbingType) => t.screen === 'flows' || t.timeline;
      const pending = importableTypes(cfg.types).filter((t) => project.importPending.includes(t.id));
      const importTypes = [
        ...pending.filter((t) => !later(t)).map((t) => ({ id: t.id, title: t.title })),
        ...pending.filter(later).map((t) => ({ id: t.id, title: t.title, afterOthers: true as const })),
      ];
      rt.events.emit({ type: 'projects' });
      const waitingSubmissions = (await pendingSubmissions(ref.dir)).length;
      const next = importTypes.length
        ? `Start one dev-plumbing:importer subagent per import type (model ${models.importer}, at most ${cfg.agents.maxParallel} at a time). Start the ones marked afterOthers only after all the others have returned. When they have all returned, call dp_wait.`
        : "Call dp_wait to listen for the user's answers.";
      if (update) {
        changed(ref);
        // The conflicts wait for Claude as a submission, and this window picks them up when it calls dp_wait after its
        // importers. No other window is woken: its dp_wait would end the re-import before the importers are back.
        return c.json({
          kind: 'updated',
          repo: ref.repo,
          project: ref.id,
          title: project.title,
          url: urlFor(ref.repo, ref.id),
          version: update.version,
          merged: { clean: update.clean, conflicts: update.conflicts },
          importTypes,
          models,
          maxParallel: cfg.agents.maxParallel,
          waitingSubmissions,
          next: `Tell the user: "${updatedLine(update)}" ${next}`,
        });
      }
      return c.json({
        kind: created ? 'created' : 'reopened',
        repo: ref.repo,
        project: ref.id,
        title: project.title,
        url: urlFor(ref.repo, ref.id),
        importTypes,
        models,
        maxParallel: cfg.agents.maxParallel,
        waitingSubmissions,
        next: tell ? `Tell the user: "${tell}" ${next}` : next,
      });
    }),
  );

  r.post(
    '/repo-profile',
    handle(async (c) => {
      const body = await parse(c, profileBody);
      const git = await gitInfo(body.cwd);
      const remote = git.remote ? normalizeRemote(git.remote) : null;
      if (body.profile === undefined) {
        const cfg = await loadConfig(ctx.configDir);
        const existing = matchProfile(git.remote, cfg.repos);
        if (existing && (await pendingDetect(ctx.configDir, existing.name))) return c.json({ kind: 'redetect', profile: existing, remote, clone: git.root });
        return c.json(existing ? { kind: 'existing', profile: existing } : { kind: 'missing', remote, clone: git.root, suggestedName: suggestRepoName(git.remote, git.root) });
      }
      // The repo-setup agent reads untrusted repo files, so it may not choose where the service writes.
      const raw = body.profile as Record<string, unknown> | null;
      const link = raw && typeof raw === 'object' ? (raw.linkIntoClones as Record<string, unknown> | undefined) : undefined;
      if (raw && typeof raw === 'object' && (raw.projectsFolder !== undefined || (link && typeof link === 'object' && link.enabled === true))) {
        throw new InputError('Leave out projectsFolder and linkIntoClones. The user sets those in Settings → Repos.');
      }
      if (!remote) throw new InputError(NO_REMOTE);
      const parsed = repoProfileSchema.safeParse(body.profile);
      if (!parsed.success) throw new InputError(`The profile isn't valid: ${formatZodError(parsed.error)}`);
      const profile = parsed.data;
      if (!profile.match.some((m) => normalizeRemote(m) === remote)) throw new InputError(`match must include ${remote}, this clone's remote.`);
      const saved = await rt.withLock('config:repos', async () => {
        const cfg = await loadConfig(ctx.configDir);
        const existing = matchProfile(git.remote, cfg.repos);
        if (existing) {
          // Only Detect again replaces a profile, and only the parts detection finds. The rest stays the user's.
          if (!(await pendingDetect(ctx.configDir, existing.name))) throw new InputError(`This repo already has a repo profile (${existing.name}). Change it in Settings → Repos.`);
          const merged = mergeDetected(existing, profile);
          await writeJsonAtomic(path.join(ctx.configDir, 'repos', `${existing.name}.json`), merged);
          await finishDetect(ctx.configDir, existing.name);
          rt.detects.delete(existing.name);
          return merged;
        }
        const file = path.join(ctx.configDir, 'repos', `${profile.name}.json`);
        if (await fs.access(file).then(() => true, () => false)) throw new InputError(`A repo profile named ${profile.name} already exists. Pick another name.`);
        await writeJsonAtomic(file, profile);
        // Settings shows when a profile was last detected, the first time included.
        await finishDetect(ctx.configDir, profile.name);
        return profile;
      });
      rt.events.emit({ type: 'config' });
      return c.json({ saved: `repos/${saved.name}.json`, profile: saved });
    }),
  );

  r.post(
    '/items',
    handle(async (c) => {
      const body = await parse(c, itemsBody);
      const { cfg, ref } = await locateProject(ctx, body.repo, body.project);
      // Built-in types (Plan changes) are never imported.
      const type = importableTypes(cfg.types).find((t) => t.id === body.type);
      if (!type) throw new InputError(`"${body.type}" isn't an enabled plumbing type.`);
      const clone = await cloneFor(body.cwd, ref);
      const result = await rt.withLock(projectKey(ref.repo, ref.id), () =>
        writeImportBatch({ dir: ref.dir, type, types: cfg.types, batch: { items: body.items, noChanges: body.noChanges, removed: body.removed }, clone }),
      );
      changed(ref);
      if (result.importFinished) await openInBrowser(cfg, ref);
      return c.json({ saved: result.itemIds.length, itemIds: result.itemIds, importFinished: result.importFinished });
    }),
  );

  async function describeSubmission(ref: ProjectRef, s: Submission, cfg: LoadedConfig) {
    const titleOf = async (threadId: string) => {
      const thread = await readThread(ref.dir, threadId).catch(() => null);
      const item = thread ? await readItem(ref.dir, thread.itemId).catch(() => null) : null;
      return item?.title ?? threadId;
    };
    const groups = await groupThreads(ref.dir, s.sent, cfg.agents.groupLinkedThreads);
    const { decisions, total } = await relevantDecisions(ref.dir, s.sent);
    return {
      kind: 'submission' as const,
      submission: s.id,
      groups: await Promise.all(groups.map(async (threads) => ({ threads, titles: await Promise.all(threads.map(titleOf)), model: cfg.agents.models.thread }))),
      maxParallel: cfg.agents.maxParallel,
      decisions,
      decisionCount: total,
    };
  }

  /** What dp_wait returns for a finalize request: one finalizer subagent, with the finalizer model. */
  function describeFinalize(ref: ProjectRef, request: FinalizeRequest, cfg: LoadedConfig) {
    const model = cfg.agents.models.finalizer;
    return {
      kind: 'finalize' as const,
      request: request.id,
      model,
      next: `Start one dev-plumbing:finalizer subagent (model ${model}) with the prompt "Write the final spec for repo ${ref.repo}, plumbing project ${ref.id}, request ${request.id}." When it returns, call dp_wait with finished: { finalize: "${request.id}" }.`,
    };
  }

  /** What dp_wait returns for a Whiteboard Defense request: one whiteboard subagent, with the whiteboard model. */
  function describeWhiteboard(ref: ProjectRef, request: WhiteboardRequest, cfg: LoadedConfig) {
    const model = cfg.agents.models.whiteboard;
    return {
      kind: 'whiteboard' as const,
      request: request.id,
      model,
      next: `Start one dev-plumbing:whiteboard subagent (model ${model}) with the prompt "Write the Whiteboard Defense for repo ${ref.repo}, plumbing project ${ref.id}, request ${request.id}." When it returns, call dp_wait with finished: { whiteboard: "${request.id}" }.`,
    };
  }

  /** What dp_wait returns for a Detect again request: one repo-setup subagent, looking at the project's clone. */
  function describeDetect(repo: string, clone: string, cfg: LoadedConfig) {
    const model = cfg.agents.models.repoSetup;
    return {
      kind: 'detect-profile' as const,
      repo,
      clone,
      model,
      next: `Start one dev-plumbing:repo-setup subagent (model ${model}) with the prompt "Detect the repo profile for ${repo} again. The clone is at ${clone}." When it returns, call dp_wait with finished: { detect: "${repo}" }.`,
    };
  }

  r.post(
    '/wait',
    handle(async (c) => {
      const body = await parse(c, waitBody);
      const { cfg, ref } = await locateProject(ctx, body.repo, body.project);
      const key = projectKey(ref.repo, ref.id);
      // Another wait from this window is still open here (an older dp_wait call), so this call isn't the window
      // coming back from its last submission: leave what it picked up, and its busy mark, alone.
      const alreadyWaiting = rt.listeners.inWait(body.windowId, key);
      rt.listeners.polled(body.windowId, key);
      if (!alreadyWaiting) rt.listeners.setBusy(body.windowId, false);
      const isAlive = (w: string) => (w === body.windowId ? alreadyWaiting : rt.listeners.isAlive(w));
      const finished = body.finished;
      // Back for more, or reporting a detect: any Detect again this window held is done.
      if (!alreadyWaiting || finished?.detect) cameBack(body.windowId);
      const importDone = await rt.withLock(key, async () => {
        if (finished?.submission) {
          const owned = await readSubmission(ref.dir, finished.submission).then(
            (s) => s.pickedUpBy === body.windowId,
            (e) => {
              if (e instanceof StoreError && /doesn't exist/.test(e.message)) return false;
              throw e;
            },
          );
          if (owned) await finishSubmission(ref.dir, finished.submission, finished.conflicts);
        }
        if (!alreadyWaiting) await finishWindowSubmissions(ref.dir, body.windowId);
        // A window back from a finalize it picked up, with or without finished.finalize, sent all it was going to.
        // If no final came, the request fails with Try again, so the page never stays on "Claude is writing the final."
        const held = await readFinalize(ref.dir);
        if (held?.state === 'writing' && held.pickedUpBy === body.windowId && (!alreadyWaiting || finished?.finalize === held.id)) {
          await finishFinalize(ref.dir, { requestId: held.id, windowId: body.windowId });
        }
        // The same for a Whiteboard Defense: a window back without one fails its request, so the page offers Try again,
        // with the subagent's own Failed: line when the window passes it on.
        const writing = await readWhiteboardRequest(ref.dir);
        if (writing?.state === 'writing' && writing.pickedUpBy === body.windowId && (!alreadyWaiting || finished?.whiteboard === writing.id)) {
          const error = finished?.whiteboard === writing.id ? finished.whiteboardError : undefined;
          await finishWhiteboard(ref.dir, { requestId: writing.id, windowId: body.windowId, error });
        }
        await requeueUnfinished(ref.dir, isAlive);
        await requeueFinalize(ref.dir, isAlive);
        await requeueWhiteboard(ref.dir, isAlive);
        // Only the window that runs the importers ends the import, or this one once that window is gone.
        return finishImport(ref.dir, { windowId: body.windowId, isAlive: (w) => rt.listeners.isAlive(w) });
      });
      changed(ref);
      if (importDone) await openInBrowser(cfg, ref);

      const timeoutMs = Math.min(body.timeoutSeconds ?? cfg.agents.waitHeartbeatSeconds, MAX_POLL_SECONDS) * 1000;
      for (let round = 0; round < 2; round++) {
        // Submissions first, oldest first. Then a requested finalize, then a requested Whiteboard Defense.
        const picked = await rt.withLock(key, async () => {
          if (c.req.raw.signal.aborted) return null;
          const next = (await pendingSubmissions(ref.dir))[0];
          if (next) return { kind: 'submission' as const, submission: await pickUp(ref.dir, next.id, body.windowId) };
          const request = await pickUpFinalize(ref.dir, body.windowId);
          if (request) return { kind: 'finalize' as const, request };
          const whiteboard = await pickUpWhiteboard(ref.dir, body.windowId);
          // One whose plan can't be read failed instead: nothing to hand out, but the page offers Try again.
          if (whiteboard?.state === 'failed') {
            changed(ref);
            return null;
          }
          return whiteboard ? { kind: 'whiteboard' as const, request: whiteboard } : null;
        });
        if (picked) {
          rt.listeners.setBusy(body.windowId, true);
          changed(ref);
          if (picked.kind === 'submission') return c.json(await describeSubmission(ref, picked.submission, cfg));
          return c.json(picked.kind === 'finalize' ? describeFinalize(ref, picked.request, cfg) : describeWhiteboard(ref, picked.request, cfg));
        }
        // Then a Detect again request for this repo. The subagent looks at the project's clone.
        const clone = c.req.raw.signal.aborted ? null : await cloneOf(ctx, ref);
        if (clone && (await handOutDetect(ref.repo, body.windowId))) {
          rt.listeners.setBusy(body.windowId, true);
          return c.json(describeDetect(ref.repo, clone, cfg));
        }
        if (round === 1 || timeoutMs === 0) break;
        if ((await rt.listeners.wait(body.windowId, key, timeoutMs, c.req.raw.signal)) !== 'notified') break;
      }
      return c.json({ kind: 'timeout' });
    }),
  );

  r.post(
    '/alive',
    handle(async (c) => {
      const body = await parse(c, aliveBody);
      rt.listeners.seen(body.windowId);
      return c.json({ ok: true });
    }),
  );

  r.post(
    '/context',
    handle(async (c) => {
      const body = await parse(c, contextBody);
      const { cfg, ref } = await locateProject(ctx, body.repo, body.project);
      const profile = cfg.repos.find((p) => p.name === ref.repo);
      if (body.threadId) return c.json(await threadPack({ dir: ref.dir, threadId: body.threadId, types: cfg.types, profile }));
      if (body.importType) return c.json(await importPack({ dir: ref.dir, typeId: body.importType, types: cfg.types, profile }));
      if (body.finalize) return c.json(await finalizePack({ dir: ref.dir, types: cfg.types, profile, rules: await finalizeRules() }));
      if (body.whiteboard) return c.json(await whiteboardPack({ dir: ref.dir, types: cfg.types, profile, rulesFile: await whiteboardRulesFile() }));
      throw new InputError('Give threadId (for a thread), importType (for an importer), finalize: true (for the finalizer) or whiteboard: true (for the whiteboard subagent).');
    }),
  );

  r.post(
    '/reply',
    handle(async (c) => {
      const { repo, project, cwd, ...reply } = await parse(c, replyBody);
      const { cfg, ref } = await locateProject(ctx, repo, project);
      const clone = await cloneFor(cwd, ref);
      const result = await rt.withLock(projectKey(ref.repo, ref.id), () =>
        postReply(ref.dir, { reply, types: cfg.types, autoApply: cfg.settings.autoApplySmallEdits, clone }),
      );
      changed(ref);
      return c.json({
        ok: true,
        messageId: result.messageId,
        appliedEdits: result.edits.filter((e) => e.appliedAt).length,
        pendingEdits: result.edits.filter((e) => !e.appliedAt).length,
        newThreads: result.newThreadIds,
      });
    }),
  );

  // The finalizer's document. saveProposal checks it and expands every token, or refuses it whole with every problem.
  r.post(
    '/finalize',
    handle(async (c) => {
      const body = await parse(c, finalizeBody);
      const { cfg, ref } = await locateProject(ctx, body.repo, body.project);
      const saved = await rt.withLock(projectKey(ref.repo, ref.id), async () => {
        const project = await readProjectFile(ref.dir);
        return saveProposal(ref.dir, { requestId: body.request, markdown: body.markdown, types: cfg.types, name: finalName(project.source.path) });
      });
      changed(ref);
      return c.json({
        ok: true,
        request: saved.id,
        length: saved.proposal?.length ?? body.markdown.length,
        next: 'Saved. The user previews the final in the app and accepts it there. Reply with your one line.',
      });
    }),
  );

  // The whiteboard subagent's defense. saveDefense checks it whole, or refuses it with every problem and keeps the
  // request writing, so the subagent can send it again. The checklist is the rules file's, copied here, so the user's
  // ticks always match it; only rules with no checklist need the subagent's.
  r.post(
    '/whiteboard',
    handle(async (c) => {
      const body = await parse(c, whiteboardBody);
      const { cfg, ref } = await locateProject(ctx, body.repo, body.project);
      const checklist = checklistLines(await fs.readFile(await whiteboardRulesFile(), 'utf8').catch(() => ''));
      const saved = await rt.withLock(projectKey(ref.repo, ref.id), () =>
        saveDefense(ref.dir, { requestId: body.request, defense: body.defense, types: cfg.types, checklist }),
      );
      changed(ref);
      return c.json({
        ok: true,
        request: body.request,
        level: saved.level,
        questions: saved.questions.length,
        concerns: saved.concerns.length,
        next: 'Saved. The user reads it in the app. Reply with your one line.',
      });
    }),
  );

  return r;
}
