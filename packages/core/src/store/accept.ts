import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../atomic';
import { mockupAssetHtml, mockupAssetName } from '../finalExport';
import { gitInfo } from '../git';
import { expandHome } from '../paths';
import { dataKindOf, normalizeRemote, parseData, type PlumbingProject, type PlumbingType, type RepoProfile } from '../schemas';
import { discardProposal, finalInputsHash, finalName, readFinalize } from './finalize';
import { ConflictError, docPath, InputError, readItems, readProjectFile, writeProjectFile } from './io';
import { matchProfile, tildify } from './open';

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
/** p is root, or inside it. */
const within = (root: string, p: string) => {
  const rel = path.relative(root, p);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
};

/** The clone's real path, once it's known to be the top of a git clone whose remote is one of the profile's. */
async function checkClone(clone: string, profile: RepoProfile, home: string | undefined): Promise<string> {
  if (!(clone === '~' || clone.startsWith('~/') || path.isAbsolute(clone))) throw new InputError('Pick a clone by its full path.');
  const root = await fs.realpath(expandHome(clone, home)).catch(() => null);
  const stat = root ? await fs.stat(root).catch(() => null) : null;
  if (!root || !stat?.isDirectory()) throw new InputError(`${clone} isn't a folder on this Mac.`);
  const git = await gitInfo(root).catch(() => null);
  if (!git) throw new InputError(`${clone} isn't a git clone. Copy into a clone of ${profile.name}.`);
  if ((await fs.realpath(git.root).catch(() => git.root)) !== root) throw new InputError(`${clone} is a folder inside a clone. Pick the clone itself.`);
  if (!matchProfile(git.remote, [profile])) {
    const wanted = profile.match.map(normalizeRemote).join(' or ');
    throw new InputError(
      git.remote ? `${clone} is a clone of ${normalizeRemote(git.remote)}, not ${wanted}.` : `${clone} has no git remote, so it can't be checked against ${wanted}.`,
    );
  }
  return root;
}

/** A target may be missing, or be a real file (or folder). A link is never written through, wherever it points. */
async function checkTarget(clone: string, file: string, rel: string, kind: 'file' | 'folder'): Promise<void> {
  const stat = await lstat(file);
  if (!stat) return;
  if (stat.isSymbolicLink()) throw new InputError(`${rel} in ${clone} is a link. Accept won't write through it: remove the link, then accept again.`);
  if (kind === 'file' ? !stat.isFile() : !stat.isDirectory()) throw new InputError(`${rel} in ${clone} isn't a ${kind}.`);
}

/**
 * Where the copy goes: <name>.final.md and <name>.assets/, in the plan's own folder. That folder must really be inside
 * the clone, with no link anywhere on the way, so a link can't send the copy somewhere else.
 */
async function checkPlace(clone: string, root: string, sourcePath: string): Promise<Place> {
  const name = finalName(sourcePath);
  const planRel = path.posix.dirname(sourcePath);
  const planDir = path.resolve(root, planRel);
  if (!name || !within(root, planDir)) throw new InputError(`The plan's path, ${sourcePath}, doesn't give a place inside the clone for the copy.`);
  const real = await fs.realpath(planDir).catch(() => null);
  if (!real) throw new InputError(`${clone} has no ${planRel} folder, where the plan lives.`);
  if (real !== planDir) throw new InputError(`${planRel} in ${clone} is or goes through a link. Accept writes only into real folders inside the clone.`);
  if (!(await fs.stat(planDir)).isDirectory()) throw new InputError(`${planRel} in ${clone} isn't a folder.`);
  const place: Place = {
    finalRel: path.posix.join(planRel, `${name}.final.md`),
    finalFile: path.join(planDir, `${name}.final.md`),
    assetsRel: path.posix.join(planRel, `${name}.assets`),
    assetsDir: path.join(planDir, `${name}.assets`),
  };
  await checkTarget(clone, place.finalFile, place.finalRel, 'file');
  await checkTarget(clone, place.assetsDir, place.assetsRel, 'folder');
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
 * Every check runs before the first write: the proposal is for the current draft and items, the clone is a clone of this repo,
 * and nothing Accept writes is, or goes through, a link. If a write fails part-way, everything written so far is put
 * back and project.json isn't touched, so the project is never marked finalized without its final.
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

  const request = await readFinalize(o.dir);
  const proposal = request?.state === 'proposed' ? request.proposal : undefined;
  const markdown = proposal ? await fs.readFile(docPath(o.dir, proposal.file), 'utf8').catch(() => null) : null;
  if (!proposal || markdown === null) throw new ConflictError("There's no proposed final to accept. Start finalize first.");
  // The proposal's draftHash is finalInputsHash: the draft, every item and the decisions it was written from.
  if ((await finalInputsHash(o.dir)) !== proposal.draftHash) throw new ConflictError(STALE);

  const root = await checkClone(o.clone, o.profile, o.home);
  const place = await checkPlace(o.clone, root, project.source.path);
  const assets = await mockupAssets({ dir: o.dir, assets: proposal.assets, types: o.types, profile: o.profile });
  for (const a of assets) await checkTarget(o.clone, path.join(place.assetsDir, a.name), `${place.assetsRel}/${a.name}`, 'file');
  const stale = await staleAssets({ previous: project.docs.exportedTo, root, place, keep: assets, home: o.home });
  const earlier = await fs.readFile(docPath(o.dir, FINAL)).catch(() => null);
  const stamp = at.replace(/[:.]/g, '-');
  let archive = docPath(o.dir, `finals/${stamp}.md`);
  for (let n = 2; await lstat(archive); n++) archive = docPath(o.dir, `finals/${stamp}-${n}.md`);
  const madeAssetsDir = assets.length > 0 && !(await lstat(place.assetsDir));
  const exportedTo: ExportedTo = { clone: tildify(root, o.home), path: place.finalRel, at, assets: assets.map((a) => a.name) };

  // What each file held before Accept wrote or removed it (null: it didn't exist), so a failure can put it back.
  const journal: { file: string; before: Buffer | null }[] = [];
  const put = async (file: string, data: string | Buffer) => {
    journal.push({ file, before: await fs.readFile(file).catch(() => null) });
    await writeFileAtomic(file, data);
  };
  const remove = async (file: string) => {
    journal.push({ file, before: await fs.readFile(file) });
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
    for (const { file, before } of journal.reverse()) await (before === null ? fs.rm(file, { force: true }) : writeFileAtomic(file, before)).catch(quiet);
    // Folders Accept made for nothing go too. rmdir only removes an empty folder, so earlier finals keep theirs.
    await fs.rmdir(path.dirname(archive)).catch(quiet);
    if (madeAssetsDir) await fs.rmdir(place.assetsDir).catch(quiet);
    const reason = error instanceof Error ? error.message : String(error);
    throw new ConflictError(`Accept didn't finish (${reason}). What it had written was put back, and the project isn't finalized. Try again.`);
  }
  // The final is saved. If the finished proposal can't be removed, the Finalize page still offers it, which is harmless.
  await discardProposal(o.dir).catch(quiet);
  return { exportedTo, nextCommand: `writing-plans ${place.finalRel}` };
}
