import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrontMatter } from '@dev-plumbing/core';
import { TOOL_NAMES } from '../src/tools';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const asSeen = (tool: string) => `mcp__plugin_dev-plumbing_dp__${tool}`;

describe('the plugin', () => {
  it('is listed in the repo marketplace', () => {
    const market = JSON.parse(read('.claude-plugin/marketplace.json'));
    expect(market).toMatchObject({ name: 'dev-plumbing', owner: { name: expect.any(String) }, plugins: [{ name: 'dev-plumbing', source: './plugin' }] });
    expect(JSON.parse(read('plugin/.claude-plugin/plugin.json')).name).toBe('dev-plumbing');
  });

  it('starts the dp server through the launcher, with a 12-hour limit', () => {
    const server = JSON.parse(read('plugin/.mcp.json')).mcpServers.dp;
    expect(server).toEqual({ command: 'sh', args: ['${CLAUDE_PLUGIN_ROOT}/bin/dp-mcp.sh'], timeout: 43_200_000 });
    expect(fs.statSync(path.join(root, 'plugin/bin/dp-mcp.sh')).mode & 0o111).toBeTruthy();
  });

  it('gives each subagent only read tools and its own dp tools', () => {
    const expected: Record<string, string[]> = {
      'repo-setup': ['dp_repo_profile'],
      importer: ['dp_context', 'dp_write_items'],
      thread: ['dp_context', 'dp_reply'],
      finalizer: ['dp_context', 'dp_finalize'],
    };
    for (const [name, dp] of Object.entries(expected)) {
      const agent = parseFrontMatter(read(`plugin/agents/${name}.md`));
      expect(agent.data.name).toBe(name);
      expect(String(agent.data.description).length).toBeGreaterThan(20);
      const tools = String(agent.data.tools).split(',').map((t) => t.trim());
      expect([...tools].sort()).toEqual(['Glob', 'Grep', 'Read', ...dp.map(asSeen)].sort());
      for (const t of dp) expect(TOOL_NAMES).toContain(t);
    }
  });

  it('has the /dev-plumbing skill, which uses the tools and subagents by their real names', () => {
    const skill = parseFrontMatter(read('plugin/skills/dev-plumbing/SKILL.md'));
    expect(skill.data.name).toBe('dev-plumbing');
    for (const s of ['dp_open', 'dp_wait', 'dev-plumbing:repo-setup', 'dev-plumbing:importer', 'dev-plumbing:thread', '$ARGUMENTS', 'finished', 'threads:', 'text:']) {
      expect(skill.content).toContain(s);
    }
  });

  it('keeps one dp_wait per project, and stops when a newer one took over', () => {
    const skill = parseFrontMatter(read('plugin/skills/dev-plumbing/SKILL.md')).content;
    expect(skill).toMatch(/Never call `dp_wait` while one is still running in the background for this project/);
    expect(skill).toContain('**kind: replaced**');
  });

  it('imports flows and phases in a second wave, and passes on only the decisions that matter', () => {
    const skill = parseFrontMatter(read('plugin/skills/dev-plumbing/SKILL.md')).content;
    expect(skill).toContain('afterOthers');
    expect(skill).toContain('decisionCount');
    expect(skill).toMatch(/When all of those have returned, start the entries with `afterOthers: true`/);
  });

  it('has importers and thread agents write drawings to the documented shapes', () => {
    const importer = parseFrontMatter(read('plugin/agents/importer.md')).content;
    for (const s of ['type.dataShape', 'kitFiles', 'mockupId', 'itemIds', 'existingItems']) expect(importer).toContain(s);
    expect(importer).not.toContain('Mockup HTML comes in a later version');
    expect(importer).toMatch(/- `profile`:[^\n]*`kitFiles`/);
    const thread = parseFrontMatter(read('plugin/agents/thread.md')).content;
    for (const s of ['patch: { data }', 'type.dataShape', 'anchor.itemId', 'anchor.label', 'anchor.ref', 'the whole item is in `anchored`']) expect(thread).toContain(s);
    expect(thread).not.toContain('t-<anchor.itemId>');
  });

  it('has a finalizer that writes the final through dp_finalize, placing tokens instead of drawing', () => {
    const finalizer = parseFrontMatter(read('plugin/agents/finalizer.md')).content;
    for (const s of [
      'finalize: true',
      '`rules`',
      '`tokens`',
      '`previousFinal`',
      "**Parked items aren't in the pack.**",
      'Parked: left out of the final',
      '**Never draw.**',
      '{{diagram:<itemId>}}',
      '{{sequence:<itemId>}}',
      '{{steps:<itemId>}}',
      '{{schema:<itemId>}}',
      '{{migration:<itemId>}}',
      '{{mockup:<itemId>:after}}',
      'Call `dp_finalize` once',
      'at most three times',
      'Final written:',
      "don't write `{{` outside code blocks and inline code, and never put a token inside code.",
    ]) {
      expect(finalizer).toContain(s);
    }
    expect(finalizer).not.toContain('anywhere else');
    expect(parseFrontMatter(read('plugin/agents/finalizer.md')).data.color).toBe('yellow');
    const skill = parseFrontMatter(read('plugin/skills/dev-plumbing/SKILL.md')).content;
    for (const s of ['dev-plumbing:finalizer', '**kind: finalize**', '> Write the final spec for repo `<repo>`, plumbing project `<project>`, request `<request>`.', 'finished: { finalize:']) {
      expect(skill).toContain(s);
    }
  });

  it('runs the finalizer and the detection subagent in the foreground, before listening again', () => {
    const skill = parseFrontMatter(read('plugin/skills/dev-plumbing/SKILL.md')).content;
    const section = (from: string, to: string) => skill.slice(skill.indexOf(from), skill.indexOf(to));
    const foreground = 'Run it in the foreground and wait for its line: calling `dp_wait` before it returns fails the request.';
    expect(section('## 5. Write the final', '## 6.')).toContain(foreground);
    expect(section('## 6. Detect the repo profile again', '## Rules')).toContain(foreground);
  });

  it("detects a repo profile again when the user asks, keeping the user's own settings", () => {
    const setup = parseFrontMatter(read('plugin/agents/repo-setup.md'));
    expect(String(setup.data.description)).toContain('Detect again');
    for (const s of ['`redetect`', 'send the whole detected profile', "the service keeps your name, match and the user's own settings"]) expect(setup.content).toContain(s);
    const skill = parseFrontMatter(read('plugin/skills/dev-plumbing/SKILL.md')).content;
    for (const s of ['redetect: true', '**kind: detect-profile**', '> Detect the repo profile for `<repo>` again. The clone is at `<clone>`.', 'finished: { detect:']) {
      expect(skill).toContain(s);
    }
  });
  it('asks before bringing a changed plan in, and has importers re-import by key, removing only what they list', () => {
    const skill = parseFrontMatter(read('plugin/skills/dev-plumbing/SKILL.md')).content;
    const open = skill.slice(skill.indexOf('## 1. Open'), skill.indexOf('## 2. Import'));
    for (const s of [
      '**plan-changed**',
      'AskUserQuestion',
      '> The plan changed in the repo since v<n> (<a> lines added, <r> removed). Update to v<n+1>?',
      '**Update to v<n+1>**',
      '**Not now**',
      'update: true',
      'update: false',
      'take **Not now**',
      '**Update to v<n+1> (merge into my draft)**',
      '**Start the draft from v<n+1>**',
      '`fresh: true`',
      " Only the formatting changed.",
      " It's mostly rewritten, so merging would leave <k> conflicts.",
      'The plan on branch <branch> changed since v<n>',
      '**updated**',
      '`v<n>: <clean> changes merged, <conflicts> to settle in Plan changes.`',
      '`v<n>: <clean> changes merged, nothing to settle.`',
      "`v<n>: the draft now starts from the plan's v<n>. Your earlier draft is kept under Versions.`",
      'go to 2 with its `importTypes`',
      'when `next` starts with `Tell the user: "…"`, tell the user that line first',
      'If `dp_open` returns an error after `update: true`, the project changed in the meantime: tell the user the error, then call `dp_open` again with the same `plan` (or `project`) and `update: false`',
    ]) {
      expect(open).toContain(s);
    }
    const importer = parseFrontMatter(read('plugin/agents/importer.md')).content;
    for (const s of [
      '## Re-import',
      '`reimport`',
      '`changes`',
      '`existing`',
      'Send new items, items whose part of the plan `changes` touched, and `removed`: the keys of existing items whose part of the plan the `- ` lines took out.',
      'Never remove an item because the draft now answers it or its thread settled it. An existing item you don\'t mention is left as it is.',
      '**Reuse an existing `key` for the same thing,**',
      '**Use `noChanges` only when nothing in `changes` touches this type.**',
      'For an existing item, send its key, plus only the fields that changed; a field you leave out keeps its value, title and summary included (so leave out `data` unless the drawing changed).',
      "If a drawing's part of the plan changed, edit the current `data` you're given; don't redraw it from scratch.",
      "Changed in the plan's v<to>.",
    ]) {
      expect(importer).toContain(s);
    }
    // Nothing is removed by leaving it out any more.
    expect(importer).not.toContain('Send the whole list');
    // A field left out keeps its value, so the importer never has to resend a drawing it didn't change.
    expect(importer).not.toContain('whole `data` again');
    const thread = parseFrontMatter(read('plugin/agents/thread.md')).content;
    expect(thread).toContain("If the thread has no message from the person yet, the service sent it to you: a Plan changes thread, for example");
    expect(thread).toContain("do what the plumbing type's Rules say");
  });

});
