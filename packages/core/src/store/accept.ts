import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../atomic';
import { mockupAssetHtml, mockupAssetName } from '../finalExport';
import { expandHome } from '../paths';
import { dataKindOf, parseData, type PlumbingProject, type PlumbingType, type RepoProfile } from '../schemas';
import { checkClone, checkTarget, planFolder, readOrNull, within } from './cloneTarget';
import { discardProposal, finalInputsHash, readFinalize } from './finalize';
import { ConflictError, docPath, InputError, readItems, readProjectFile, writeProjectFile } from './io';
import { tildify } from './open';

type ExportedTo = NonNullable<PlumbingProject['docs']['exportedTo']>;
type Asset = { name: string; html: string };
type Place = { finalRel: string; finalFile: string; assetsRel: string; assetsDir: string };

/** The final in the project folder. Accept moves an earlier one to finals/ first. */
const FINAL = 'docs/final.md';
const STALE = 'The draft changed since Claude wrote this. Finalize again.';
/** The only names Accept writes into the assets folder, and so the only names it ever removes from it. */
const ASSET_NAME = /^[a-z0-9][a-z0-9-]*\.(after|before)\.html$/;

const quiet = () => undefined;
/** What's at p, without following a link, or null when nothing is. */
const lstat = (p: string) => fs.lstat(p).catch(() => null);

/**
 * Where the copy goes: <name>.final.md and <name>.assets/, in the plan's own folder (planFolder checks that it's really
 * inside the clone). Neither may be a link.
 */
async function checkPlace(clone: string, root: string, sourcePath: string): Promise<Place> {
  const { name, planRel, planDir } = await planFolder(clone, root, sourcePath, 'Accept');
  const place: Place = {
    finalRel: path.posix.join(planRel, `${name}.final.md`),
    finalFile: path.join(planDir, `${name}.final.md`),
    assetsRel: path.posix.join(planRel, `${name}.assets`),
    assetsDir: path.join(planDir, `${name}.assets`),
  };
  await checkTarget(clone, place.finalFile, place.finalRel, 'file', 'Accept');
  await checkTarget(clone, place.assetsDir, place.assetsRel, 'folder', 'Accept');
  return place;
}

/** Each mockup the final links to, as a plain HTML file with the item's markup. One file per item and side. */
async function mockupAssets(o: { dir: string; assets: { itemId: string; side: 'after' | 'before' }[]; types: PlumbingType[]; profile: RepoProfile }): Promise<Asset[]> {
  const { values: items } = await readItems(o.dir);
  const assets = new Map<string, string>();
  for (const { itemId, side } of o.assets) {
    const item = items.find((i) => i.id === itemId);
    const type = item ? o.types.find((t) => t.id === item.type) : undefined;
    const parsed = item && type && dataKindOf(type) === 'mockups' ? parseData('mockups', item.data) : null;
    const body = parsed?.ok ? parsed.data[side] : undefined;
    const name = mockupAssetName(itemId, side);
    if (!item || !parsed?.ok || !body?.trim() || !ASSET_NAME.test(name)) {
      throw new ConflictError(`The ${side} mockup of "${item?.title ?? itemId}" has changed since Claude wrote this. Finalize again.`);
    }
    const m = parsed.data;
    // The kit is picked as the mockup frame picks it: the item's kit first, then the app it lives in.
    const app = [m.kit, m.location.app].map((n) => o.profile.apps.find((a) => a.name === n)).find((a) => a !== undefined);
    assets.set(name, mockupAssetHtml({ title: item.title, app: app?.name ?? m.location.app, route: m.location.route, kitFiles: app?.kitFiles ?? [], body }));
  }
  return [...assets].map(([name, html]) => ({ name, html })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Assets this project wrote last time, into this same folder of this same clone, that the new final doesn't link to.
 * Only those names, and only plain files: a file you added to the folder is never touched.
 */
async function staleAssets(o: { previous: ExportedTo | undefined; root: string; place: Place; keep: Asset[]; home: string | undefined }): Promise<string[]> {
  const { previous } = o;
  if (!previous || previous.path !== o.place.finalRel) return [];
  if ((await fs.realpath(expandHome(previous.clone, o.home)).catch(() => null)) !== o.root) return [];
  const keep = new Set(o.keep.map((a) => a.name));
  const stale: string[] = [];
  for (const name of previous.assets) {
    if (!ASSET_NAME.test(name) || keep.has(name)) continue;
    if ((await lstat(path.join(o.place.assetsDir, name)))?.isFile()) stale.push(name);
  }
  return stale;
}

/**
 * Accept: saves the previewed proposal as docs/final.md, keeping any earlier final in finals/, and copies it into the
 * clone as <name>.final.md, with its mockups in <name>.assets/, next to the plan. The project becomes Finalized.
 *
 * Every check runs before the first write: no import is running, the proposal is for the current draft and items, the
 * clone is a clone of this repo, and nothing Accept writes is, or goes through, a link. If a write fails part-way,
 * everything written so far is put back and project.json isn't touched, so the project is never marked finalized
 * without its final.
 * `home` is the home folder for `~` paths (the service passes ctx.home), so exportedTo.clone has the same form as
 * project.clones.
 */
export async function acceptFinal(o: {
  dir: string;
  clone: string;
  profile: RepoProfile;
  types: PlumbingType[];
  home?: string;
  now?: Date;
}): Promise<{ exportedTo: ExportedTo; nextCommand: string }> {
  const at = (o.now ?? new Date()).toISOString();
  const project = await readProjectFile(o.dir);
  if (o.profile.name !== project.repo) throw new InputError(`The ${o.profile.name} repo profile isn't this project's repo, ${project.repo}.`);
  // A re-import may still change items the final was written from, so a proposal can't be accepted until it's done.
  if (project.status === 'importing') throw new ConflictError('Wait for the import to finish, then accept.');

  const request = await readFinalize(o.dir);
  const proposal = request?.state === 'proposed' ? request.proposal : undefined;
  const markdown = proposal ? await fs.readFile(docPath(o.dir, proposal.file), 'utf8').catch(() => null) : null;
  if (!proposal || markdown === null) throw new ConflictError("There's no proposed final to accept. Start finalize first.");
  // The proposal's draftHash is finalInputsHash: the draft, every item and the decisions it was written from.
  if ((await finalInputsHash(o.dir)) !== proposal.draftHash) throw new ConflictError(STALE);

  const root = await checkClone(o.clone, o.profile, o.home);
  const place = await checkPlace(o.clone, root, project.source.path);
  const assets = await mockupAssets({ dir: o.dir, assets: proposal.assets, types: o.types, profile: o.profile });
  for (const a of assets) await checkTarget(o.clone, path.join(place.assetsDir, a.name), `${place.assetsRel}/${a.name}`, 'file', 'Accept');
  const stale = await staleAssets({ previous: project.docs.exportedTo, root, place, keep: assets, home: o.home });
  const earlier = await readOrNull(docPath(o.dir, FINAL), FINAL);
  const stamp = at.replace(/[:.]/g, '-');
  let archive = docPath(o.dir, `finals/${stamp}.md`);
  for (let n = 2; await lstat(archive); n++) archive = docPath(o.dir, `finals/${stamp}-${n}.md`);
  const madeAssetsDir = assets.length > 0 && !(await lstat(place.assetsDir));
  const exportedTo: ExportedTo = { clone: tildify(root, o.home), path: place.finalRel, at, assets: assets.map((a) => a.name) };

  // What each file held before Accept wrote or removed it (null: it didn't exist), read now so an unreadable file stops Accept
  // before the first write. The journal lets a failure put each one back.
  const label = (file: string) => (within(o.dir, file) ? path.relative(o.dir, file) : path.relative(root, file)).split(path.sep).join('/');
  const befores = new Map<string, Buffer | null>();
  const targets = [docPath(o.dir, FINAL), place.finalFile, ...assets.map((a) => path.join(place.assetsDir, a.name)), ...stale.map((n) => path.join(place.assetsDir, n))];
  for (const file of targets) befores.set(file, await readOrNull(file, label(file)));
  const journal: { file: string; before: Buffer | null }[] = [];
  const put = async (file: string, data: string | Buffer) => {
    journal.push({ file, before: file === archive ? null : (befores.get(file) ?? null) });
    await writeFileAtomic(file, data);
  };
  const remove = async (file: string) => {
    journal.push({ file, before: befores.get(file) ?? null });
    await fs.rm(file);
  };
  try {
    if (earlier) await put(archive, earlier);
    await put(docPath(o.dir, FINAL), markdown);
    await put(place.finalFile, markdown);
    for (const a of assets) await put(path.join(place.assetsDir, a.name), a.html);
    for (const name of stale) await remove(path.join(place.assetsDir, name));
    await writeProjectFile(o.dir, { ...project, docs: { ...project.docs, final: FINAL, exportedTo }, status: 'finalized', updatedAt: at });
  } catch (error) {
    // Put each file back, newest first. Once one can't be, nothing created earlier is removed: the archive above all, since
    // it may be the only copy of the earlier final.
    const left: string[] = [];
    for (const { file, before } of journal.reverse()) {
      if (before === null && left.length > 0) {
        if (await lstat(file)) left.push(label(file));
        continue;
      }
      try {
        await (before === null ? fs.rm(file, { force: true }) : writeFileAtomic(file, before));
      } catch {
        left.push(label(file));
      }
    }
    const reason = error instanceof Error ? error.message : String(error);
    if (left.length === 0) {
      // Folders Accept made for nothing go too. rmdir only removes an empty folder, so earlier finals keep theirs.
      await fs.rmdir(path.dirname(archive)).catch(quiet);
      if (madeAssetsDir) await fs.rmdir(place.assetsDir).catch(quiet);
      throw new ConflictError(`Accept didn't finish (${reason}). What it had written was put back, and the project isn't finalized. Try again.`);
    }
    const kept = earlier && (await lstat(archive)) ? ` The previous final is kept in ${label(archive)}.` : '';
    throw new ConflictError(
      `Accept didn't finish (${reason}), and some files couldn't be put back: ${[...new Set(left.reverse())].join(', ')}.${kept} The project isn't finalized. Check those files, then try again.`,
    );
  }
  // The final is saved. If the finished proposal can't be removed, the Finalize page still offers it, which is harmless.
  await discardProposal(o.dir).catch(quiet);
  return { exportedTo, nextCommand: `writing-plans ${place.finalRel}` };
}
