import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { mockupAssetHtml } from '../src/finalExport';
import { repoProfileSchema, type PlumbingType } from '../src/schemas';
import { acceptFinal } from '../src/store/accept';
import { recordChange } from '../src/store/changes';
import { finalName, pickUpFinalize, readFinalize, requestFinalize, saveProposal } from '../src/store/finalize';
import { ConflictError, InputError, readProjectFile } from '../src/store/io';
import { tildify } from '../src/store/open';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';
import { DRAFT, listType, makeRepo, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const PLAN = 'docs/specs/restock.md';
const types: PlumbingType[] = [...TYPES, listType('ui', { title: 'UI changes', screen: 'mockups', order: 3 })];
const profile = repoProfileSchema.parse({
  name: 'acme',
  match: ['github.com/acme/acme'],
  apps: [{ name: 'web', path: 'apps/web', kitFiles: ['apps/web/app/globals.css'] }],
});
const AFTER = '<section class="card"><h2>Restock soon</h2><button class="btn">Order now</button></section>';
const BEFORE = '<section class="card"><h2>Your subscription</h2></section>';
const MOCKUP = { location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] }, kit: 'web', after: AFTER, before: BEFORE };
const FIRST = '# Restock reminders\n\n## UI changes\n\n{{mockup:ui-card:after}}\n\n{{mockup:ui-card:before}}\n';
const T1 = new Date('2026-10-03T10:00:00.000Z');
const T2 = new Date('2026-10-04T11:30:00.000Z');

/** A clone of acme with the plan in it, and its plumbing project: one resolved UI item with both mockups. */
async function setup(o: { remote?: string | null; plan?: string } = {}): Promise<{ dir: string; clone: string }> {
  const plan = o.plan ?? PLAN;
  const clone = makeRepo({ plan, remote: o.remote });
  const ui = pair('ui-card', { type: 'ui', title: 'Restock card', status: 'resolved' });
  const dir = await seedProject({
    pairs: [{ item: { ...ui.item, data: MOCKUP }, thread: ui.thread }],
    project: { source: { path: plan, clone, branch: 'main', hashAtImport: 'x' } },
  });
  return { dir, clone };
}

/** Starts finalize, has a window pick it up, and saves the finalizer's document, as the service does. */
async function propose(dir: string, markdown: string, now = T1): Promise<void> {
  await requestFinalize(dir, { types, now });
  const request = await pickUpFinalize(dir, 'w-1', now);
  const { source } = await readProjectFile(dir);
  await saveProposal(dir, { requestId: request!.id, markdown, types, name: finalName(source.path), now });
}

/** Every file and folder under these folders (except .git), with each file's text and each link's target. */
async function snapshot(...roots: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.name === '.git') continue;
      if (entry.isSymbolicLink()) {
        out[p] = `link to ${await fs.readlink(p)}`;
      } else if (entry.isDirectory()) {
        out[p] = 'folder';
        await walk(p);
      } else {
        out[p] = await fs.readFile(p, 'utf8');
      }
    }
  };
  for (const root of new Set(roots)) await walk(root);
  return out;
}

const read = (...parts: string[]) => fs.readFile(path.join(...parts), 'utf8');
const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

describe('accepting the final', () => {
  it('saves the final, copies it and its mockups next to the plan, and finalizes the project', async () => {
    const { dir, clone } = await setup();
    await propose(dir, FIRST);
    const proposed = await read(dir, 'docs', 'final.proposed.md');
    expect(proposed).toContain('[After mockup](restock.assets/ui-card.after.html)');

    const result = await acceptFinal({ dir, clone, profile, types, now: T2 });
    const exportedTo = { clone: tildify(clone), path: 'docs/specs/restock.final.md', at: T2.toISOString(), assets: ['ui-card.after.html', 'ui-card.before.html'] };
    expect(result).toEqual({ exportedTo, nextCommand: 'writing-plans docs/specs/restock.final.md' });

    expect(await read(dir, 'docs', 'final.md')).toBe(proposed);
    expect(await read(clone, 'docs', 'specs', 'restock.final.md')).toBe(proposed);
    const kit = { title: 'Restock card', app: 'web', route: '/account', kitFiles: ['apps/web/app/globals.css'] };
    expect(await read(clone, 'docs', 'specs', 'restock.assets', 'ui-card.after.html')).toBe(mockupAssetHtml({ ...kit, body: AFTER }));
    expect(await read(clone, 'docs', 'specs', 'restock.assets', 'ui-card.before.html')).toBe(mockupAssetHtml({ ...kit, body: BEFORE }));
    expect((await fs.readdir(path.join(clone, 'docs', 'specs'))).sort()).toEqual(['restock.assets', 'restock.final.md', 'restock.md']);
    // The plan in the repo is only ever read.
    expect(await read(clone, PLAN)).toBe(DRAFT);

    const project = await readProjectFile(dir);
    expect(project.status).toBe('finalized');
    expect(project.docs).toEqual({ original: 'docs/original.md', draft: 'docs/draft.md', final: 'docs/final.md', exportedTo });
    expect(project.updatedAt).toBe(T2.toISOString());
    // The proposal is used up, and there was no earlier final to keep.
    expect(await readFinalize(dir)).toBeNull();
    expect(await fs.lstat(path.join(dir, 'docs', 'final.proposed.md')).catch(() => null)).toBeNull();
    expect(await fs.lstat(path.join(dir, 'finals')).catch(() => null)).toBeNull();
  });

  it('puts the copy at the top of the clone when the plan is there, and makes no assets folder without mockups', async () => {
    const { dir, clone } = await setup({ plan: 'restock.md' });
    await propose(dir, '# Restock reminders\n\nNo screens change.\n');
    expect(await acceptFinal({ dir, clone, profile, types, now: T2 })).toEqual({
      exportedTo: { clone: tildify(clone), path: 'restock.final.md', at: T2.toISOString(), assets: [] },
      nextCommand: 'writing-plans restock.final.md',
    });
    expect(await read(clone, 'restock.final.md')).toBe('# Restock reminders\n\nNo screens change.\n');
    expect(await fs.lstat(path.join(clone, 'restock.assets')).catch(() => null)).toBeNull();
  });

  it('reads and writes ~ paths with the home it is given, as project.clones does', async () => {
    const { dir, clone } = await setup();
    await propose(dir, FIRST);
    // The service's home, which isn't the OS home in tests: the clone sits right inside it.
    const home = path.dirname(clone);
    const tilde = `~/${path.basename(clone)}`;
    const result = await acceptFinal({ dir, clone: tilde, profile, types, home, now: T2 });
    expect(result.exportedTo.clone).toBe(tilde);
    expect(await read(clone, 'docs', 'specs', 'restock.final.md')).toBe(await read(dir, 'docs', 'final.md'));
  });

  it('accept never writes outside the chosen clone', async () => {
    const outside = await fs.realpath(tempDir('dp-outside-'));
    await fs.writeFile(path.join(outside, 'notes.md'), 'Mine.\n');
    await fs.mkdir(path.join(outside, 'specs'));
    await fs.mkdir(path.join(outside, 'assets'));
    const specs = (clone: string) => path.join(clone, 'docs', 'specs');
    const cases: { name: string; remote?: string | null; target: (clone: string) => Promise<string>; error: RegExp }[] = [
      { name: 'a clone of another repo', remote: 'git@github.com:acme/other.git', target: async (c) => c, error: /is a clone of github\.com\/acme\/other, not github\.com\/acme\/acme\./ },
      { name: 'a clone with no remote', remote: null, target: async (c) => c, error: /has no git remote, so it can't be checked against github\.com\/acme\/acme\./ },
      {
        name: 'a folder that is not a git clone',
        target: async () => {
          const plain = await fs.realpath(tempDir('dp-plain-'));
          await fs.mkdir(path.join(plain, 'docs', 'specs'), { recursive: true });
          return plain;
        },
        error: /isn't a git clone\. Copy into a clone of acme\./,
      },
      { name: 'a folder inside the clone', target: async (c) => path.join(c, 'docs'), error: /docs is a folder inside a clone\. Pick the clone itself\./ },
      {
        name: 'a plan folder that links outside the clone',
        target: async (c) => {
          await fs.rm(specs(c), { recursive: true });
          await fs.symlink(path.join(outside, 'specs'), specs(c));
          return c;
        },
        error: /docs\/specs in .+ is or goes through a link\./,
      },
      {
        name: 'a final that is a link',
        target: async (c) => {
          await fs.symlink(path.join(outside, 'notes.md'), path.join(specs(c), 'restock.final.md'));
          return c;
        },
        error: /docs\/specs\/restock\.final\.md in .+ is a link\. Accept won't write through it/,
      },
      {
        name: 'an assets folder that is a link',
        target: async (c) => {
          await fs.symlink(path.join(outside, 'assets'), path.join(specs(c), 'restock.assets'));
          return c;
        },
        error: /docs\/specs\/restock\.assets in .+ is a link\./,
      },
      {
        name: 'a mockup file that is a link',
        target: async (c) => {
          await fs.mkdir(path.join(specs(c), 'restock.assets'));
          await fs.symlink(path.join(outside, 'notes.md'), path.join(specs(c), 'restock.assets', 'ui-card.after.html'));
          return c;
        },
        error: /docs\/specs\/restock\.assets\/ui-card\.after\.html in .+ is a link\./,
      },
    ];
    for (const c of cases) {
      const { dir, clone } = await setup({ remote: c.remote });
      await fs.writeFile(path.join(dir, 'docs', 'final.md'), 'The earlier final.\n');
      await propose(dir, FIRST);
      const target = await c.target(clone);
      const before = await snapshot(dir, clone, target, outside);
      const error = await failure(acceptFinal({ dir, clone: target, profile, types, now: T2 }));
      expect(error, c.name).toBeInstanceOf(InputError);
      expect((error as Error).message, c.name).toMatch(c.error);
      // Nothing was written anywhere: not the project folder (docs/final.md included), the clone, or outside it.
      expect(await snapshot(dir, clone, target, outside), c.name).toEqual(before);
    }
  });

  it("a proposal for an older draft can't be accepted", async () => {
    const { dir, clone } = await setup();
    await propose(dir, FIRST);
    await recordChange(dir, {
      threadId: 't-ui-card',
      kind: 'small-edit',
      summary: 'Say how reminders are logged',
      change: { md: [{ find: 'Log reminders in a table.', replace: 'Log each reminder in a table.' }] },
      apply: true,
      now: T2,
    });
    const before = await snapshot(dir, clone);
    const error = await failure(acceptFinal({ dir, clone, profile, types, now: T2 }));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe('The draft changed since Claude wrote this. Finalize again.');
    expect(await snapshot(dir, clone)).toEqual(before);
    expect((await readFinalize(dir))?.state).toBe('proposed');
  });

  it("refuses with no proposal, another repo's profile, a clone path that isn't full, or no plan folder", async () => {
    const { dir, clone } = await setup();
    await expect(acceptFinal({ dir, clone, profile, types })).rejects.toThrow("There's no proposed final to accept. Start finalize first.");
    await requestFinalize(dir, { types, now: T1 });
    await pickUpFinalize(dir, 'w-1', T1);
    await expect(acceptFinal({ dir, clone, profile, types })).rejects.toThrow("There's no proposed final to accept.");

    const elsewhere = await setup({ plan: 'notes/restock.md' });
    await propose(elsewhere.dir, FIRST);
    const other = repoProfileSchema.parse({ name: 'acme-labs', match: ['github.com/acme/acme'] });
    await expect(acceptFinal({ dir: elsewhere.dir, clone, profile: other, types })).rejects.toThrow("The acme-labs repo profile isn't this project's repo, acme.");
    await expect(acceptFinal({ dir: elsewhere.dir, clone: 'acme', profile, types })).rejects.toThrow('Pick a clone by its full path.');
    await expect(acceptFinal({ dir: elsewhere.dir, clone: path.join(clone, 'missing'), profile, types })).rejects.toThrow(/missing isn't a folder on this Mac\./);
    // This clone of acme has docs/specs, but not the notes folder the plan lives in.
    await expect(acceptFinal({ dir: elsewhere.dir, clone, profile, types })).rejects.toThrow(`${clone} has no notes folder, where the plan lives.`);
  });

  it('finalizing again keeps history and cleans only our assets', async () => {
    const { dir, clone } = await setup();
    await propose(dir, FIRST);
    await acceptFinal({ dir, clone, profile, types, now: T1 });
    const first = await read(dir, 'docs', 'final.md');
    const assets = path.join(clone, 'docs', 'specs', 'restock.assets');
    // Your own files in the assets folder, one of them named like an asset this project never wrote.
    await fs.writeFile(path.join(assets, 'sketch.html'), '<p>My sketch.</p>\n');
    await fs.writeFile(path.join(assets, 'ui-other.after.html'), '<p>Not from this project.</p>\n');

    await propose(dir, '# Restock reminders\n\nSecond pass.\n\n{{mockup:ui-card:after}}\n', T2);
    const result = await acceptFinal({ dir, clone, profile, types, now: T2 });
    const second = await read(dir, 'docs', 'final.md');
    expect(second).toContain('Second pass.');
    expect(await fs.readdir(path.join(dir, 'finals'))).toEqual(['2026-10-04T11-30-00-000Z.md']);
    expect(await read(dir, 'finals', '2026-10-04T11-30-00-000Z.md')).toBe(first);
    expect(await read(clone, 'docs', 'specs', 'restock.final.md')).toBe(second);
    expect((await fs.readdir(assets)).sort()).toEqual(['sketch.html', 'ui-card.after.html', 'ui-other.after.html']);
    expect(await read(assets, 'ui-other.after.html')).toBe('<p>Not from this project.</p>\n');
    expect(result.exportedTo.assets).toEqual(['ui-card.after.html']);
    expect((await readProjectFile(dir)).docs.exportedTo?.assets).toEqual(['ui-card.after.html']);
  });

  it("leaves another clone's copy alone when it finalizes into a different clone", async () => {
    const { dir, clone } = await setup();
    await propose(dir, FIRST);
    await acceptFinal({ dir, clone, profile, types, now: T1 });
    const second = makeRepo({ plan: PLAN });
    const secondAssets = path.join(second, 'docs', 'specs', 'restock.assets');
    await fs.mkdir(secondAssets);
    await fs.writeFile(path.join(secondAssets, 'ui-card.before.html'), '<p>Already here.</p>\n');
    const firstCopy = await snapshot(clone);

    await propose(dir, '# Restock reminders\n\n{{mockup:ui-card:after}}\n', T2);
    const result = await acceptFinal({ dir, clone: second, profile, types, now: T2 });
    expect(result.exportedTo).toMatchObject({ clone: tildify(second), path: 'docs/specs/restock.final.md' });
    expect(await snapshot(clone)).toEqual(firstCopy);
    expect((await fs.readdir(secondAssets)).sort()).toEqual(['ui-card.after.html', 'ui-card.before.html']);
    expect(await read(secondAssets, 'ui-card.before.html')).toBe('<p>Already here.</p>\n');
  });

  it('a proposal goes stale when only an item changed, with the draft as it was', async () => {
    const { dir, clone } = await setup();
    await propose(dir, FIRST);
    // An accept that only redraws the mockup: the draft is untouched, but the final's mockup would change.
    const item = JSON.parse(await read(dir, 'items', 'ui-card.json'));
    await fs.writeFile(path.join(dir, 'items', 'ui-card.json'), JSON.stringify({ ...item, data: { ...MOCKUP, after: AFTER.replace('Order now', 'Reorder') } }));
    expect(await read(dir, 'docs', 'draft.md')).toBe(DRAFT);
    const before = await snapshot(dir, clone);
    const error = await failure(acceptFinal({ dir, clone, profile, types, now: T2 }));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe('The draft changed since Claude wrote this. Finalize again.');
    expect(await snapshot(dir, clone)).toEqual(before);
    expect((await readFinalize(dir))?.state).toBe('proposed');
  });

  it("refuses a mockup that isn't a mockup any more since Claude wrote the final", async () => {
    const { dir, clone } = await setup();
    await propose(dir, FIRST);
    // The items are as they were, but the UI type's screen was changed in the settings, so they aren't mockups now.
    const listed = types.map((t) => (t.id === 'ui' ? { ...t, screen: 'list' as const } : t));
    const before = await snapshot(dir, clone);
    await expect(acceptFinal({ dir, clone, profile, types: listed, now: T2 })).rejects.toThrow('The after mockup of "Restock card" has changed since Claude wrote this. Finalize again.');
    expect(await snapshot(dir, clone)).toEqual(before);
  });

  it('puts back what it wrote when a write fails part-way', async () => {
    const { dir, clone } = await setup();
    await fs.writeFile(path.join(dir, 'docs', 'final.md'), 'The earlier final.\n');
    await fs.writeFile(path.join(clone, 'docs', 'specs', 'restock.final.md'), 'The earlier final.\n');
    await propose(dir, FIRST);
    // A real folder, but one Accept can't write into, so the first mockup fails after the final and the copy are written.
    const assets = path.join(clone, 'docs', 'specs', 'restock.assets');
    await fs.mkdir(assets);
    await fs.chmod(assets, 0o500);
    const before = await snapshot(dir, clone);

    const error = await failure(acceptFinal({ dir, clone, profile, types, now: T2 }));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toMatch(/^Accept didn't finish \(.+\)\. What it had written was put back, and the project isn't finalized\. Try again\.$/);
    expect(await snapshot(dir, clone)).toEqual(before);
    expect((await readProjectFile(dir)).status).toBe('active');
    expect((await readFinalize(dir))?.state).toBe('proposed');
  });
});
