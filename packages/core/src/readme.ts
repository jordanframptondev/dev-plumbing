import path from 'node:path';
import { writeFileAtomic } from './atomic';
import { agentsFields, plumbingTypeHeaderDocs, repoProfileDocs, settingsFields, type FieldSpec } from './schemas';

const fieldTable = (fields: readonly FieldSpec[]) =>
  ['| Key | Default | What it does |', '|---|---|---|', ...fields.map((f) => `| \`${f.key}\` | \`${JSON.stringify(f.default)}\` | **${f.label}.** ${f.description} |`)].join('\n');

const docTable = (rows: { key: string; description: string }[]) =>
  ['| Key | What it does |', '|---|---|', ...rows.map((r) => `| \`${r.key}\` | ${r.description} |`)].join('\n');

export function renderReadme(): string {
  return [
    '# dev-plumbing configuration',
    '',
    "Everything you can tune in dev-plumbing lives in this folder. The app's Settings and Plumbing rules pages edit these files, and you can edit them in any editor. Changes apply on the next request; a new port needs a restart.",
    '',
    '```',
    'settings.json                   app settings',
    'agents.json                     subagent settings',
    'repos/<repo>.json               one repo profile per repo',
    'plumbing/<type>.md              rules and criteria for each plumbing type',
    'outputs/finalize.md             rules for Finalize spec',
    'outputs/whiteboard-defense.md   rules for Whiteboard Defense',
    'run/                            managed by the app (port, pid, token, log)',
    '```',
    '',
    '## settings.json',
    '',
    fieldTable(settingsFields),
    '',
    '## agents.json',
    '',
    fieldTable(agentsFields),
    '',
    '## Repo profiles: repos/<repo>.json',
    '',
    'A profile is created the first time you run /dev-plumbing in a repo. Plain JSON, no comments.',
    '',
    docTable(repoProfileDocs),
    '',
    '## Plumbing types: plumbing/<type>.md',
    '',
    'Each file starts with a YAML header between `---` lines, then the rules as Markdown. The importer follows the whole file; thread subagents follow the **Rules** section. A new file is a new plumbing type.',
    '',
    docTable(plumbingTypeHeaderDocs),
    '',
    'Body sections: `## What to look for`, `## Rules`, `## Done when`, `## Always ask`.',
    '',
    '## Getting back to the defaults',
    '',
    'Use Reset to default on the Settings or Plumbing rules page, or delete a file and run `dev-plumbing setup` again. Setup only adds missing files and never overwrites yours.',
    '',
  ].join('\n');
}

export async function writeReadme(dir: string): Promise<string> {
  const file = path.join(dir, 'README.md');
  await writeFileAtomic(file, renderReadme());
  return file;
}
