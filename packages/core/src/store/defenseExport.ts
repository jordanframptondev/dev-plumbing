import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../atomic';
import { diagramMermaid } from '../finalExport';
import { parseData, type DefenseExport, type RepoProfile } from '../schemas';
import { checkClone, checkTarget, planFolder, readOrNull } from './cloneTarget';
import { defenseMarkdown } from './defenseMarkdown';
import { ConflictError, InputError, readItems, readProjectFile } from './io';
import { tildify } from './open';
import { readDefense, writeDefense } from './whiteboard';

/**
 * Export .md: writes the Whiteboard Defense as Markdown into a clone, as <name>.whiteboard-defense.md in the plan's own
 * folder, next to where Accept puts <name>.final.md, then records where on the defense (exportedTo). It writes that one
 * file and nothing else, after Accept's checks: a clone of this repo picked by its root, the plan's folder really inside
 * it, and no link on the way. An earlier export there is overwritten. A defense that's out of date can be exported: the
 * file says what it was generated from and when. If recording fails, the file is put back as it was. `home` is the home
 * folder for `~` paths, as for Accept. The service runs it under the project's lock.
 */
export async function exportDefense(o: { dir: string; clone: string; profile: RepoProfile; home?: string; now?: Date }): Promise<{ exportedTo: DefenseExport }> {
  const at = (o.now ?? new Date()).toISOString();
  const project = await readProjectFile(o.dir);
  if (o.profile.name !== project.repo) throw new InputError(`The ${o.profile.name} repo profile isn't this project's repo, ${project.repo}.`);
  const defense = await readDefense(o.dir);
  if (!defense) throw new ConflictError("There's no Whiteboard Defense to export yet.");

  const root = await checkClone(o.clone, o.profile, o.home);
  const { name, planRel, planDir } = await planFolder(o.clone, root, project.source.path, 'Export');
  const rel = path.posix.join(planRel, `${name}.whiteboard-defense.md`);
  const file = path.join(planDir, `${name}.whiteboard-defense.md`);
  await checkTarget(o.clone, file, rel, 'file', 'Export');
  // What was there before, read now so an unreadable file stops Export before it writes, and a failure can put it back.
  const before = await readOrNull(file, rel, 'Export');
  const { values: items } = await readItems(o.dir);
  // The diagram a section names, drawn as Mermaid as the final draws it, for a reader of the repo who can't see
  // dev-plumbing. An item that no longer has a diagram is only named.
  const diagrams: Record<string, string> = {};
  for (const s of defense.sections) {
    const item = s.diagramItemId ? items.find((i) => i.id === s.diagramItemId) : undefined;
    const parsed = item ? parseData('diagram', item.data) : null;
    if (item && parsed?.ok) diagrams[item.id] = diagramMermaid(parsed.data);
  }
  const markdown = defenseMarkdown(defense, { title: project.title, itemTitles: Object.fromEntries(items.map((i) => [i.id, i.title])), diagrams });
  const exportedTo: DefenseExport = { clone: tildify(root, o.home), path: rel, at };

  let written = false;
  try {
    await writeFileAtomic(file, markdown);
    written = true;
    await writeDefense(o.dir, { ...defense, exportedTo });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const putBack = !written || (await (before === null ? fs.rm(file, { force: true }) : writeFileAtomic(file, before)).then(() => true, () => false));
    throw new ConflictError(
      putBack
        ? `Export didn't finish (${reason}). ${rel} in ${o.clone} is as it was. Try again.`
        : `Export didn't finish (${reason}), and ${rel} in ${o.clone} couldn't be put back. Check it, then try again.`,
    );
  }
  return { exportedTo };
}
