import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  activeDecisions,
  expandHome,
  findProjects,
  finishImport,
  finishSubmission,
  finishWindowSubmissions,
  formatZodError,
  gitInfo,
  groupThreads,
  importBatchSchema,
  importPack,
  InputError,
  linkIntoClone,
  loadConfig,
  matchProfile,
  normalizeRemote,
  openPlan,
  pendingSubmissions,
  pickUp,
  postReply,
  readDecisions,
  readItem,
  readProjectFile,
  readThread,
  replySchema,
  repoProfileSchema,
  repoProjectsFolder,
  requeueUnfinished,
  resolvePlan,
  StoreError,
  suggestRepoName,
  summarizeProject,
  threadPack,
  writeImportBatch,
  writeJsonAtomic,
  type LoadedConfig,
  type ProjectRef,
  type Submission,
} from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { handle } from '../errors';
import { EXPECTED_OBJECT, readJsonObject } from '../json';
import { locateProject } from '../locate';
import { projectKey, type Runtime } from '../runtime';

/** Below Node fetch's 300 s headers timeout, so the MCP server's long-poll never trips it. */
export const MAX_POLL_SECONDS = 240;

const projectBody = z.object({ repo: z.string().min(1), project: z.string().min(1) });
const openBody = z.object({ cwd: z.string().min(1), plan: z.string().min(1).optional(), project: z.string().min(1).optional(), windowId: z.string().optional() });
const profileBody = z.object({ cwd: z.string().min(1), profile: z.unknown().optional() });
const itemsBody = importBatchSchema.merge(projectBody).extend({ type: z.string().min(1), cwd: z.string().optional() });
const waitBody = projectBody.extend({
  windowId: z.string().min(1),
  timeoutSeconds: z.number().min(0).max(600).optional(),
  finished: z
    .object({ submission: z.string().min(1), conflicts: z.array(z.object({ threads: z.array(z.string()).min(1), text: z.string().min(1) })).default([]) })
    .optional(),
});
const aliveBody = z.object({ windowId: z.string().min(1) });
const contextBody = projectBody.extend({ threadId: z.string().optional(), importType: z.string().optional() });
const replyBody = replySchema.merge(projectBody).extend({ cwd: z.string().optional() });

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

  r.post(
    '/open',
    handle(async (c) => {
      const body = await parse(c, openBody);
      const cfg = await loadConfig(ctx.configDir);
      const git = await gitInfo(body.cwd);
      if (!git.remote) {
        throw new InputError("This repo has no git remote, so dev-plumbing can't recognise its other clones. Add one (git remote add origin <url>), then run /dev-plumbing again.");
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
      if (body.project) {
        try {
          ref = (await locateProject(ctx, profile.name, body.project)).ref;
        } catch (e) {
          if (e instanceof StoreError) throw new InputError(`There's no plumbing project "${body.project}" for ${profile.name}. Call dp_open with no arguments to list them.`);
          throw e;
        }
      } else {
        const plan = await resolvePlan({ root: git.root, cwd: body.cwd, plan: body.plan! });
        const enabledTypes = cfg.types.filter((t) => t.enabled).map((t) => t.id);
        const opened = await rt.withLock(`open:${folder}`, () => openPlan({ folder, repo: profile.name, clone: git.root, branch: git.branch, plan, enabledTypes, home: ctx.home }));
        ref = { repo: profile.name, id: opened.id, dir: opened.dir };
        created = opened.created;
      }

      const key = projectKey(ref.repo, ref.id);
      if (body.windowId) rt.listeners.seen(body.windowId, key);
      await rt.withLock(key, () => requeueUnfinished(ref.dir, (w) => rt.listeners.isAlive(w)));
      const project = await readProjectFile(ref.dir);
      const importTypes = cfg.types.filter((t) => project.importPending.includes(t.id)).map((t) => ({ id: t.id, title: t.title }));
      rt.events.emit({ type: 'projects' });
      return c.json({
        kind: created ? 'created' : 'reopened',
        repo: ref.repo,
        project: ref.id,
        title: project.title,
        url: urlFor(ref.repo, ref.id),
        importTypes,
        models,
        maxParallel: cfg.agents.maxParallel,
        waitingSubmissions: (await pendingSubmissions(ref.dir)).length,
        next: importTypes.length
          ? `Start one dev-plumbing:importer subagent per import type (model ${models.importer}, at most ${cfg.agents.maxParallel} at a time). When they have all returned, call dp_wait.`
          : "Call dp_wait to listen for the user's answers.",
      });
    }),
  );

  r.post(
    '/repo-profile',
    handle(async (c) => {
      const body = await parse(c, profileBody);
      const cfg = await loadConfig(ctx.configDir);
      const git = await gitInfo(body.cwd);
      const existing = matchProfile(git.remote, cfg.repos);
      if (body.profile === undefined) {
        return c.json(
          existing
            ? { kind: 'existing', profile: existing }
            : { kind: 'missing', remote: git.remote ? normalizeRemote(git.remote) : null, clone: git.root, suggestedName: suggestRepoName(git.remote, git.root) },
        );
      }
      if (existing) throw new InputError(`This repo already has a repo profile (${existing.name}). Change it in Settings → Repos.`);
      const parsed = repoProfileSchema.safeParse(body.profile);
      if (!parsed.success) throw new InputError(`The profile isn't valid: ${formatZodError(parsed.error)}`);
      const profile = parsed.data;
      const remote = git.remote ? normalizeRemote(git.remote) : '(none)';
      if (!profile.match.some((m) => normalizeRemote(m) === remote)) throw new InputError(`match must include ${remote}, this clone's remote.`);
      const file = path.join(ctx.configDir, 'repos', `${profile.name}.json`);
      if (await fs.access(file).then(() => true, () => false)) throw new InputError(`A repo profile named ${profile.name} already exists. Pick another name.`);
      await writeJsonAtomic(file, profile);
      rt.events.emit({ type: 'config' });
      return c.json({ saved: `repos/${profile.name}.json`, profile });
    }),
  );

  r.post(
    '/items',
    handle(async (c) => {
      const body = await parse(c, itemsBody);
      const { cfg, ref } = await locateProject(ctx, body.repo, body.project);
      const type = cfg.types.find((t) => t.id === body.type && t.enabled);
      if (!type) throw new InputError(`"${body.type}" isn't an enabled plumbing type.`);
      const clone = await cloneFor(body.cwd, ref);
      const result = await rt.withLock(projectKey(ref.repo, ref.id), () =>
        writeImportBatch({ dir: ref.dir, type, batch: { items: body.items, noChanges: body.noChanges }, clone }),
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
    return {
      kind: 'submission' as const,
      submission: s.id,
      groups: await Promise.all(groups.map(async (threads) => ({ threads, titles: await Promise.all(threads.map(titleOf)), model: cfg.agents.models.thread }))),
      maxParallel: cfg.agents.maxParallel,
      decisions: activeDecisions(await readDecisions(ref.dir)).map((d) => d.text),
    };
  }

  r.post(
    '/wait',
    handle(async (c) => {
      const body = await parse(c, waitBody);
      const { cfg, ref } = await locateProject(ctx, body.repo, body.project);
      const key = projectKey(ref.repo, ref.id);
      rt.listeners.seen(body.windowId, key);
      rt.listeners.setBusy(body.windowId, false);
      const importDone = await rt.withLock(key, async () => {
        if (body.finished) await finishSubmission(ref.dir, body.finished.submission, body.finished.conflicts).catch((e) => {
          if (!(e instanceof StoreError)) throw e;
        });
        await finishWindowSubmissions(ref.dir, body.windowId);
        await requeueUnfinished(ref.dir, (w) => w !== body.windowId && rt.listeners.isAlive(w));
        return finishImport(ref.dir);
      });
      changed(ref);
      if (importDone) await openInBrowser(cfg, ref);

      const timeoutMs = Math.min(body.timeoutSeconds ?? cfg.agents.waitHeartbeatSeconds, MAX_POLL_SECONDS) * 1000;
      for (let round = 0; round < 2; round++) {
        const picked = await rt.withLock(key, async () => {
          const next = (await pendingSubmissions(ref.dir))[0];
          return next ? pickUp(ref.dir, next.id, body.windowId) : null;
        });
        if (picked) {
          rt.listeners.setBusy(body.windowId, true);
          changed(ref);
          return c.json(await describeSubmission(ref, picked, cfg));
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
      throw new InputError('Give threadId (for a thread) or importType (for an importer).');
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

  return r;
}
