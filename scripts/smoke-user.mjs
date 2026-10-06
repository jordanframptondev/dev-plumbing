// Plays the user for scripts/smoke-claude.sh. It waits for the import, checks the drawings the importers wrote,
// answers one question the way the browser would, and waits for Claude's reply. Then it finalizes: it applies pending
// small edits, accepts Claude's proposals, parks whatever still blocks Finalize, starts it, waits for the finalizer's
// final, accepts it into the scratch repo and checks the copy. Then the plan changes in the repo: it rewrites a line
// round 1 changed in the draft, and a section the draft never changed, removes a small one, and asks the runner for a
// second /dev-plumbing. It checks the update to v2, the merge, the re-import and the Plan changes threads, and accepts
// Claude's merged version on each. Exits non-zero if anything doesn't happen in time, if a visual type has items
// without drawings, or if the final or the update didn't land.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.DEV_PLUMBING_HOME;
const long = process.env.DP_SMOKE_LONG === '1';
// The runner watches for this file, then stops the Claude window and runs /dev-plumbing again.
const round2 = process.env.DP_SMOKE_ROUND2;
if (!round2) throw new Error('DP_SMOKE_ROUND2 is not set. Run this through scripts/smoke-claude.sh.');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[user ${new Date().toISOString().slice(11, 19)}] ${msg}`);
const service = () => JSON.parse(fs.readFileSync(path.join(dir, 'run', 'service.json'), 'utf8'));

async function call(route, method = 'GET', body) {
  const run = service();
  const res = await fetch(`http://127.0.0.1:${run.port}${route}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-dev-plumbing-token': run.token },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { ok: res.ok, body: await res.json() };
}

/** A route that answers with a document rather than JSON, such as a mockup. */
async function fetchText(route) {
  const run = service();
  const res = await fetch(`http://127.0.0.1:${run.port}${route}`, { headers: { 'x-dev-plumbing-token': run.token } });
  return { status: res.status, type: res.headers.get('content-type') ?? '', text: await res.text() };
}

async function until(what, fn, minutes) {
  const end = Date.now() + minutes * 60_000;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      // The service may not be up yet.
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

const P = '/api/projects/acme-app/restock-reminders';
const started = Date.now();
const home = await until('the import to finish', async () => {
  const r = await call(P);
  return r.ok && r.body.project.status === 'active' ? r.body : null;
}, 25);
log(`Import finished in ${Math.round((Date.now() - started) / 1000)} s.`);
for (const t of home.types) {
  log(`  ${t.title}: ${t.importFailed ? "didn't finish" : t.noChanges ? `no changes (${t.noChanges.reason})` : `${t.itemCount} items`}`);
}

const profileFile = path.join(dir, 'repos', 'acme-app.json');
log(`Repo profile saved: ${fs.existsSync(profileFile) ? 'yes' : 'no'}`);
if (fs.existsSync(profileFile)) {
  const profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
  log(`  schema: ${profile.schema ? `${profile.schema.type} ${profile.schema.path}` : 'none'}`);
  for (const app of profile.apps ?? []) log(`  app ${app.name} (${app.path}): kitFiles ${app.kitFiles?.length ? app.kitFiles.join(', ') : 'none'}`);
}

// The drawings. Every visual type with items must have data on them, and at least one UI item needs markup
// that the mockup route can render. Every write was checked against its shape, so stored data is valid data.
const problems = [];
const visual = home.types.filter((t) => t.screen !== 'list' || t.timeline);
for (const t of visual) {
  if (!t.itemCount) continue;
  const r = await call(`${P}/types/${t.id}`);
  if (!r.ok) {
    problems.push(`${t.title}: ${r.body.error}`);
    continue;
  }
  const rows = r.body.items;
  const withData = rows.filter((i) => i.data !== null);
  log(`  ${t.title}: ${rows.length} items, ${withData.length} with data`);
  if (!withData.length) problems.push(`${t.title} has items, but none has data.`);
  if (t.screen === 'database') {
    const checked = rows.filter((i) => i.checks?.kind === 'database' && i.checks.checked);
    const warnings = checked.reduce((n, i) => n + i.checks.warnings.length, 0);
    const notChecked = rows.find((i) => i.checks?.kind === 'database' && !i.checks.checked);
    log(`  Database: ${checked.length} of ${rows.length} tables checked against ${checked[0]?.checks.file ?? 'no schema'}, ${warnings} warnings${notChecked ? ` (not checked: ${notChecked.checks.reason})` : ''}`);
  }
  if (t.screen === 'flows') {
    const steps = withData.flatMap((i) => i.data.steps ?? []);
    log(`  Flows: ${steps.length} steps, ${steps.filter((s) => s.mockupId).length} pointing at a UI mockup`);
  }
  if (t.timeline) {
    log(`  Phases: ${withData.reduce((n, i) => n + (i.data.itemIds?.length ?? 0), 0)} items listed across ${withData.length} phases`);
  }
  if (t.screen === 'mockups') {
    const marked = rows.filter((i) => typeof i.data?.after === 'string' && i.data.after.trim());
    log(`  UI changes: ${marked.length} of ${rows.length} with After markup, ${rows.filter((i) => i.data?.before).length} with Before`);
    if (!marked.length) problems.push('No UI item has mockup markup.');
    else {
      const id = marked[0].id;
      const doc = await fetchText(`${P}/items/${id}/mockup/after`);
      log(`  Mockup ${id}: ${doc.status} ${doc.type}`);
      if (doc.status !== 200 || !doc.type.startsWith('text/html')) problems.push(`The mockup document for ${id} didn't load (${doc.status} ${doc.type}).`);
      const kit = await call(`${P}/items/${id}/mockup-kit`);
      if (kit.ok) log(`  Kit: app ${kit.body.app ?? 'none'}, ${kit.body.files.length} files, warnings: ${kit.body.warnings.join(' ') || 'none'}`);
    }
  }
}
if (!visual.some((t) => t.screen === 'mockups' && t.itemCount)) problems.push('No UI item has mockup markup (UI changes has no items).');
if (problems.length) throw new Error(`The drawings aren't right:\n- ${problems.join('\n- ')}`);

const target = home.inbox.find((e) => e.status === 'your_turn');
if (!target) throw new Error('No thread is waiting for an answer.');
const detail = (await call(`${P}/threads/${target.threadId}`)).body;
// Round 1 has to change the draft, or round 2 has nothing to conflict with. So the answer is an explicit edit request for
// one line of the plan, in Approach, which round 2 neither removes nor rewrites cleanly. Any thread will do: Claude can
// edit any line of the plan.
const OLD_LINE = "A daily job finds subscriptions due in the next few days and sends a reminder. We haven't decided whether reminders go by SMS, email or both, or how many days before the due date to send them.";
const NEW_LINE = 'A daily job finds subscriptions due in the next three days and sends an email reminder.';
const planLine = (await call(`${P}/docs/draft`)).body.text.includes(OLD_LINE);
if (!planLine) throw new Error("The scratch plan's Approach line isn't in the draft, so round 1 can't ask to change it.");
const draft = { text: `Please change the plan's line "${OLD_LINE}" to "${NEW_LINE}". Nothing else.` };
if (long) {
  log('Waiting 35 minutes before answering, to check the long wait survives...');
  await sleep(35 * 60_000);
}
const saved = await call(`${P}/threads/${target.threadId}/draft`, 'PUT', draft);
if (!saved.ok) throw new Error(`Saving the draft failed: ${saved.body.error}`);
const before = detail.thread.messages.length;
const submitted = await call(`${P}/submit`, 'POST', { scope: 'thread', threadId: target.threadId });
if (!submitted.ok) throw new Error(`Submitting failed: ${submitted.body.error}`);
const sent = submitted.body;
log(`Answered "${target.itemTitle}": ${sent.message}`);
if (sent.sent !== 1) throw new Error(`Expected 1 thread sent to Claude, got ${sent.sent}.`);

const sentAt = Date.now();
const reply = await until("Claude's reply", async () => {
  const d = (await call(`${P}/threads/${target.threadId}`)).body;
  const last = d.thread.messages.at(-1);
  return d.thread.messages.length > before && last?.author === 'claude' && d.thread.status !== 'with_claude' ? last : null;
}, 15);
log(`Claude replied in ${Math.round((Date.now() - sentAt) / 1000)} s: ${reply.text.slice(0, 160)}`);
// The edit has to land in the draft: Claude applied it as a small edit (the default), or offered an option with a
// change, which you accept, or left a small edit waiting, which you apply.
const draftHas = async () => (await call(`${P}/docs/draft`)).body.text.includes(NEW_LINE);
if (!(await draftHas())) {
  const d = (await call(`${P}/threads/${target.threadId}`)).body;
  const pick = d.open?.options.find((o) => o.id === d.open.recommended && o.change) ?? d.open?.options.find((o) => o.change);
  if (pick) {
    await call(`${P}/threads/${target.threadId}/draft`, 'PUT', { optionId: pick.id });
    const r = await call(`${P}/submit`, 'POST', { scope: 'thread', threadId: target.threadId });
    log(`  Accepted "${pick.label}" on "${target.itemTitle}": ${r.ok ? r.body.message : r.body.error}`);
  }
  for (const e of (await call(`${P}/changes`)).body.entries.filter((x) => x.kind === 'small-edit' && x.state === 'pending')) {
    const r = await call(`${P}/changes/${e.id}/apply`, 'POST', {});
    log(`  Applied the small edit "${e.summary}": ${r.ok ? 'ok' : r.body.error}`);
  }
}
if (!(await draftHas())) throw new Error("Claude didn't make the edit round 1 asked for: the draft doesn't have the new Approach line.");
log('Round 1 changed the Approach line in the draft.');
// Finalize, clearing what blocks it the way you could in the app, so the run doesn't wait on more answers:
// 1. a small edit waiting to be applied is applied;
// 2. a proposal waiting for your answer is accepted, so its item stays in the final (often the thread answered above,
//    which may hold the only diagram). A plain accept with no note is applied and resolved straight away;
// 3. whatever still blocks is parked.
const F = `${P}/finalize`;
const SMALL_EDIT = 'A small edit is waiting to be applied.';
const PROPOSAL = 'A proposal is waiting for your answer.';
async function finalizeView() {
  const r = await call(F);
  if (!r.ok) throw new Error(`Reading the Finalize page failed: ${r.body.error}`);
  return r.body;
}
await until('every thread to come back from Claude', async () => {
  const r = await call(P);
  return r.ok && r.body.summary.counts.withClaude === 0;
}, 10);
let view = await finalizeView();
const list = view.checklist;
log(`Checklist: ${list.blocking.length} blocking, ${list.defaults.length} using their default, ${list.parked.length} parked, ${list.unreviewed.length} nobody reviewed`);
if (!list.canStart) {
  if (list.blocking.some((e) => e.reason === SMALL_EDIT)) {
    const pending = (await call(`${P}/changes`)).body.entries.filter((e) => e.kind === 'small-edit' && e.state === 'pending');
    for (const e of pending) {
      const r = await call(`${P}/changes/${e.id}/apply`, 'POST', {});
      log(`  Applied the small edit "${e.summary}": ${r.ok ? 'ok' : r.body.error}`);
    }
  }
  // Claude's recommended option with a change, or else the first option with a change.
  for (const e of list.blocking.filter((x) => x.reason === PROPOSAL)) {
    const d = (await call(`${P}/threads/${e.threadId}`)).body;
    const pick = d.open?.options.find((o) => o.id === d.open.recommended && o.change) ?? d.open?.options.find((o) => o.change);
    if (!pick) continue;
    await call(`${P}/threads/${e.threadId}/draft`, 'PUT', { optionId: pick.id });
    const r = await call(`${P}/submit`, 'POST', { scope: 'thread', threadId: e.threadId });
    log(`  Accepted "${pick.label}" on "${e.title}": ${r.ok ? r.body.message : r.body.error}`);
  }
  view = await finalizeView();
  const toPark = new Map(view.checklist.blocking.filter((e) => e.reason !== SMALL_EDIT).map((e) => [e.threadId, e]));
  for (const e of toPark.values()) {
    const r = await call(`${P}/threads/${e.threadId}/park`, 'POST', { parked: true });
    log(`  Parked "${e.title}" (${e.reason}): ${r.ok ? 'ok' : r.body.error}`);
  }
  view = await finalizeView();
  if (!view.checklist.canStart) {
    throw new Error(`Finalize is still blocked:\n- ${view.checklist.blocking.map((e) => `${e.title}: ${e.reason}`).join('\n- ')}`);
  }
}

const asked = await call(F, 'POST', {});
if (!asked.ok) throw new Error(`Starting Finalize failed: ${asked.body.error}`);
log(`Started Finalize: ${asked.body.message}`);
const askedAt = Date.now();
const written = await until("Claude's final", async () => {
  const v = await finalizeView();
  return v.request?.state === 'proposed' || v.request?.state === 'failed' ? v : null;
}, 15);
if (written.request.state === 'failed') throw new Error(`The finalizer gave up: ${written.request.reason}`);
const md = written.proposal.markdown;
const count = (re) => (md.match(re) ?? []).length;
const sections = count(/^## /gm);
const mermaidBlocks = count(/^```mermaid$/gm);
const schemaDiffs = count(/^```diff$/gm);
const mockupLinks = count(/\.assets\/[^)\s]+\.html/g);
log(`Claude's final arrived in ${Math.round((Date.now() - askedAt) / 1000)} s: ${md.length} chars, ${sections} sections, ${mermaidBlocks} Mermaid blocks, ${schemaDiffs} schema diffs, ${mockupLinks} mockup links`);
if (written.proposal.stale) throw new Error("Claude's final is already stale.");

// Accept into the scratch repo, the clone the plan came from.
const clone = written.clones.find((c) => c.source)?.path ?? written.clones[0]?.path;
if (!clone) throw new Error("None of the project's clones is on this Mac.");
const accepted = await call(`${F}/accept`, 'POST', { clone });
if (!accepted.ok) throw new Error(`Accept failed: ${accepted.body.error}`);
const planDir = path.posix.dirname(home.project.source.path);
const finalRel = `${planDir}/${written.name}.final.md`;
log(`Accepted into ${clone}: ${finalRel}`);
const missing = [];
const finalFile = path.join(clone, finalRel);
if (!fs.existsSync(finalFile)) missing.push(`${finalRel} isn't in the scratch repo.`);
else {
  const copy = fs.readFileSync(finalFile, 'utf8');
  const kinds = [...copy.matchAll(/^```mermaid\n(\S+)/gm)].map((m) => m[1]);
  const byKind = [...new Set(kinds)].map((k) => `${k} ${kinds.filter((x) => x === k).length}`).join(', ');
  log(`  Mermaid blocks in the repo copy: ${kinds.length}${byKind ? ` (${byKind})` : ''}`);
  if (!kinds.length) missing.push('The repo copy has no Mermaid block.');
  if (copy.includes('{{')) missing.push('The repo copy still has a {{token}}.');
  if (copy !== md) missing.push("The repo copy isn't the final that was previewed.");
}
const assetsDir = path.join(clone, planDir, `${written.name}.assets`);
const assets = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).filter((f) => f.endsWith('.html')) : [];
log(`  Assets: ${assets.join(', ') || 'none'}`);
if (!assets.length) missing.push(`${planDir}/${written.name}.assets has no mockup HTML.`);
const after = (await call(P)).body;
log(`  Project status: ${after.project.status}`);
if (after.project.status !== 'finalized') missing.push(`The project is ${after.project.status}, not finalized.`);
const finalized = (await call(`/api/projects?${new URLSearchParams({ q: after.project.title, tab: 'finalized', offset: '0', limit: '10' })}`)).body;
const listed = finalized.items.some((s) => s.repo === 'acme-app' && s.id === after.project.id);
log(`  Listed under Finalized: ${listed ? 'yes' : 'no'}`);
if (!listed) missing.push("The app home doesn't list the project under Finalized.");
log(`  Next: ${accepted.body.nextCommand}`);
if (accepted.body.nextCommand !== `writing-plans ${finalRel}`) missing.push(`The next command is "${accepted.body.nextCommand}", not "writing-plans ${finalRel}".`);
if (missing.length) throw new Error(`Finalize didn't land:\n- ${missing.join('\n- ')}`);

// Bring changes in. The plan changes in the repo, the way plans do after an import:
// 1. a line round 1 changed in the draft gets new text in the repo too, so both sides changed it: a conflict;
// 2. one section the draft never changed gets new text, which should merge cleanly;
// 3. one small section the draft never changed is removed, and its items should be parked.
// The runner then stops this Claude window and runs /dev-plumbing again, as you would, saying yes to "Update to v2?".
const NEW_TEXT = {
  Approach:
    "A daily job at 9:00 in the customer's time zone finds subscriptions due in the next few days and sends a reminder. We haven't decided whether reminders go by SMS, email or both, or how many days before the due date to send them.",
  Data: '- A new `RestockReminder` table logs each reminder: the subscription, the channel, when it was sent, whether it was delivered, and whether the customer reordered.\n- `Subscription` gains `remindDaysBefore` (default 3) and `remindersPaused`.',
  Screens: 'A Restock settings card on the account page (`apps/web/app/account/page.tsx`) turns reminders on or off, sets how many days before, and shows when the next reminder goes out.',
  Flow: 'The customer gets a reminder, taps Reorder, sees the order summary and confirms. A customer who paused reminders, or reordered in the last day, gets nothing.',
  Phases: 'Ship the table and the daily job first, then the settings card, then one-tap reorder behind a feature flag.',
  'Open points': '- Should customers be able to snooze a reminder for a week?\n- What happens if the daily job runs twice on the same day?',
};
/** A plan's `## ` sections, each from its heading line to the next heading. The text before the first one has heading ''. */
const sectionsOf = (text) => text.split(/^(?=## )/m).map((body) => ({ heading: /^## (.+)$/m.exec(body)?.[1] ?? '', body }));
/** A section with new text under its heading, keeping the blank line before the next heading. */
const rewritten = (s) => `## ${s.heading}\n\n${NEW_TEXT[s.heading]}\n${s.body.endsWith('\n\n') ? '\n' : ''}`;
/** Every item the app lists, with its type: id, title, thread, status, how it was made, flagged and removedIn. */
async function itemRows() {
  const h = (await call(P)).body;
  const rows = [];
  for (const t of h.types) {
    const r = await call(`${P}/types/${t.id}`);
    if (r.ok) rows.push(...r.body.items.map((i) => ({ ...i, type: t.id })));
  }
  return rows;
}

const planFile = path.join(clone, home.project.source.path);
const v1Plan = fs.readFileSync(planFile, 'utf8');
const v1Draft = (await call(`${P}/docs/draft`)).body.text;
// Each section with where it starts and ends in the plan.
let end = 0;
const planSections = sectionsOf(v1Plan).map((s) => ({ ...s, start: end, end: (end += s.body.length) }));
// The lines of the plan round 1 changed in the draft: the removed parts of the Changes view's diff (plan → draft),
// each with where it starts in the plan. The first one under a ## heading is the one the repo rewrites too.
let at = 0;
const changedLines = [];
for (const s of (await call(`${P}/changes`)).body.segments) {
  if (s.kind === 'added') continue;
  if (s.kind === 'removed' && s.text.trim()) changedLines.push({ at, text: s.text });
  at += s.text.length;
}
const conflict = changedLines
  .map((c) => ({ ...c, section: planSections.find((s) => c.at >= s.start && c.at < s.end) }))
  .find((c) => c.section?.heading);
const conflictSection = conflict?.section.heading ?? null;
/** The lines as the repo's v2 has them: each one says something new. */
const theirs = (text) => text.replace(/^(.*\S.*)$/gm, (line) => `${line.replace(/[.:]?\s*$/, '')}, as the repo's v2 now has it.`);
// A section the draft changed no longer appears in it word for word.
const touched = planSections.filter((s) => !v1Draft.includes(s.body)).map((s) => s.heading);
const untouched = (h) => planSections.some((s) => s.heading === h) && !touched.includes(h);
const removedSection = ['Open points', 'Flow', 'Screens'].find(untouched) ?? null;
const cleanSection = ['Phases', 'Screens', 'Flow', 'Data', 'Approach'].find((h) => untouched(h) && h !== removedSection) ?? null;
const v2Plan = planSections
  .map((s) => {
    if (s.heading === removedSection) return '';
    if (s.heading === cleanSection) return rewritten(s);
    if (!conflict || s !== conflict.section) return s.body;
    // Only the part of the changed lines inside this section.
    const from = conflict.at - s.start;
    const lines = conflict.text.slice(0, s.end - conflict.at);
    return s.body.slice(0, from) + theirs(lines) + s.body.slice(from + lines.length);
  })
  .join('');
const rowsV1 = await itemRows();
fs.writeFileSync(planFile, v2Plan);
const edits = [
  conflictSection ? `rewrote "${conflict.text.trim().split('\n')[0].slice(0, 60)}" in ${conflictSection}, which the draft changed too` : 'found no line round 1 changed in the draft',
  cleanSection ? `rewrote ${cleanSection}, which the draft never changed` : 'found no section the draft never changed',
  removedSection ? `removed ${removedSection}` : 'found no small section to remove',
];
log(`Changed the plan in the repo: ${edits.join('; ')}.`);
fs.writeFileSync(round2, new Date().toISOString());
log('Asked the runner to stop this Claude window and run /dev-plumbing again.');

const updateAt = Date.now();
await until('the update to v2 and its re-import', async () => {
  const r = await call(P);
  return r.ok && r.body.project.versions.length >= 2 && r.body.project.status !== 'importing';
}, 25);
log(`Updated to v2 and re-imported in ${Math.round((Date.now() - updateAt) / 1000)} s.`);
await until('the Plan changes threads to come back from Claude', async () => {
  const r = await call(P);
  return r.ok && r.body.summary.counts.withClaude === 0;
}, 15);

const wrong = [];
const v2Home = (await call(P)).body;
const project = v2Home.project;
const v2 = project.versions.find((v) => v.n === 2);
log(`Versions: ${project.versions.map((v) => `v${v.n}${v.merge ? ` (merge: ${v.merge.clean} clean, ${v.merge.conflicts} in conflict)` : ''}`).join(', ')}`);
log(`  Status: ${project.status}, import pending: ${project.importPending.join(', ') || 'none'}`);
for (const t of v2Home.types) log(`  ${t.title}: ${t.importFailed ? "didn't finish" : t.noChanges ? 'no changes' : `${t.itemCount} items`}`);
if (!v2) wrong.push('project.versions has no v2.');
// The update changed the draft, so the finalized project is active again, and the Finalize page says v2 came in.
if (project.status !== 'active') wrong.push(`The project is ${project.status} after the re-import. The update changed the draft, so it should be active.`);
const sinceFinal = (await call(`${P}/finalize`)).body.planVersionSinceFinal;
log(`  Finalize page: ${sinceFinal === null ? 'no newer version noted' : `"The plan's v${sinceFinal} came in since the last final."`}`);
if (sinceFinal !== 2) wrong.push(`The Finalize page doesn't say the plan's v2 came in since the last final (planVersionSinceFinal is ${sinceFinal}).`);
// The update has to have had a conflict to settle, or the most model-dependent part never ran.
if (!conflictSection) wrong.push("Round 1 didn't change any line of the plan in the draft, so v2 had nothing to conflict with.");
else if (v2 && !v2.merge?.conflicts) wrong.push(`v2 rewrote a line in ${conflictSection} that the draft changed too, but the merge found no conflict.`);
if (project.reimporting) wrong.push('project.reimporting is still set.');
if (project.importPending.length) wrong.push(`Still waiting for importers: ${project.importPending.join(', ')}.`);
const versionList = (await call(`${P}/versions`)).body.versions;
log(`  Versions list: ${versionList.map((v) => `v${v.n}${v.current ? ' (current)' : ''}`).join(', ')}`);
if (versionList[0]?.n !== 2 || !versionList[0].current) wrong.push("The Versions list doesn't start with v2 as the current version.");
const compared = (await call(`${P}/versions/compare?${new URLSearchParams({ from: '1', to: '2', which: 'original' })}`)).body.segments ?? [];
log(`  v1 to v2: ${compared.filter((s) => s.kind === 'added').length} added and ${compared.filter((s) => s.kind === 'removed').length} removed passages`);

// v1 is kept as it was, and the repo's text is the new original.
const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
const v1Dir = path.join(settings.projectsFolder, 'acme-app', project.id, 'docs', 'versions', 'v1');
const readOrNull = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
const same = (saved, was) => (saved === null ? 'missing' : saved === was ? 'as it was' : 'different');
const savedPlan = readOrNull(path.join(v1Dir, 'original.md'));
const savedDraft = readOrNull(path.join(v1Dir, 'draft.md'));
log(`  docs/versions/v1: plan ${same(savedPlan, v1Plan)}, draft ${same(savedDraft, v1Draft)}`);
if (savedPlan !== v1Plan || savedDraft !== v1Draft) wrong.push("docs/versions/v1 doesn't hold the plan and the draft from before the update.");
if ((await call(`${P}/docs/original`)).body.text !== v2Plan) wrong.push("original.md isn't the repo's new plan.");

// The merge: the clean edit and the removal are in the draft, your text stays where both changed, and no markers.
const v2Draft = (await call(`${P}/docs/draft`)).body.text;
const yours = conflictSection ? sectionsOf(v1Draft).find((s) => s.heading === conflictSection)?.body : undefined;
const markers = /^(<{7,}|\|{7,}|>{7,})( |$)|^={7,}$/m.test(v2Draft);
log(
  `  Draft: ${cleanSection ? `${cleanSection} edit ${v2Draft.includes(NEW_TEXT[cleanSection]) ? 'merged' : 'missing'}` : 'no clean edit'}, ${removedSection ? `${removedSection} ${v2Draft.includes(`## ${removedSection}\n`) ? 'still there' : 'gone'}` : 'nothing removed'}, ${yours ? `your ${conflictSection} ${v2Draft.includes(yours) ? 'kept' : 'not kept word for word'}` : 'no conflict section'}, conflict markers: ${markers ? 'yes' : 'none'}`,
);
if (cleanSection && !v2Draft.includes(NEW_TEXT[cleanSection])) wrong.push(`The draft doesn't have the repo's new ${cleanSection} text.`);
if (removedSection && v2Draft.includes(`## ${removedSection}\n`)) wrong.push(`The draft still has the ${removedSection} section the repo removed.`);
if (markers) wrong.push('The draft has conflict markers.');

// The re-import: imported items keep their ids, changed ones are flagged, removed ones are parked (or flagged when
// Claude had them), and nothing is deleted.
const rowsV2 = await itemRows();
const v2ById = new Map(rowsV2.map((r) => [r.id, r]));
const imported = rowsV1.filter((r) => r.createdBy === 'import');
const kept = imported.filter((r) => v2ById.has(r.id) && v2ById.get(r.id).removedIn === null);
const lost = imported.filter((r) => !v2ById.has(r.id));
const removedItems = rowsV2.filter((r) => r.removedIn !== null);
const newItems = rowsV2.filter((r) => r.type !== 'plan-changes' && !rowsV1.some((x) => x.id === r.id));
let changedCount = 0;
for (const r of kept.filter((x) => v2ById.get(x.id).flagged)) {
  const d = (await call(`${P}/threads/${r.threadId}`)).body;
  if (d.item.flags?.some((f) => f.reason === "Changed in the plan's v2.")) changedCount++;
}
log(`Re-import: ${imported.length} imported items before. ${kept.length} kept their ids (${changedCount} flagged as changed in v2), ${newItems.length} new, ${removedItems.length} removed from the plan, ${lost.length} gone.`);
for (const r of removedItems) log(`  Removed from the plan: "${r.title}" (${r.type}), ${r.status}${r.flagged ? ', flagged' : ''}, removedIn ${r.removedIn}`);
if (removedSection && !removedItems.length) log(`  No item came only from ${removedSection}, so nothing was parked.`);
if (imported.length && !kept.length) wrong.push('No imported item kept its id: the importers made everything again.');
if (lost.length) wrong.push(`Items deleted by the re-import: ${lost.map((r) => r.title).join(', ')}.`);
const loose = removedItems.filter((r) => r.status !== 'parked' && !r.flagged);
if (loose.length) wrong.push(`Removed from the plan, but neither parked nor flagged: ${loose.map((r) => r.title).join(', ')}.`);
// An item answered in round 1 is never taken out while its section is still in the plan.
const v2Headings = new Set(sectionsOf(v2Plan).map((s) => s.heading).filter(Boolean));
const answered = rowsV1.filter((r) => r.createdBy === 'import' && r.status === 'resolved');
const takenOut = [];
for (const r of answered.filter((x) => v2ById.get(x.id)?.removedIn != null)) {
  const heading = (await call(`${P}/threads/${r.threadId}`)).body.item.mdAnchor?.heading;
  if (heading && v2Headings.has(heading)) takenOut.push(`"${r.title}" (§ ${heading})`);
}
log(`  Answered in round 1: ${answered.length} items, ${takenOut.length} removed from the plan while their section is still there`);
if (takenOut.length) wrong.push(`Answered items removed from the plan although their section is still in v2: ${takenOut.join(', ')}.`);

// Plan changes: one thread per conflict. Claude proposed a merged version on each, and you accept it.
const conflicts = rowsV2.filter((r) => r.type === 'plan-changes');
log(`Plan changes: ${conflicts.length} thread${conflicts.length === 1 ? '' : 's'}`);
if (v2?.merge && conflicts.length !== v2.merge.conflicts) wrong.push(`v2 counted ${v2.merge.conflicts} conflicts, but there are ${conflicts.length} Plan changes threads.`);
for (const r of conflicts) {
  const d = (await call(`${P}/threads/${r.threadId}`)).body;
  const pick = d.open?.options.find((o) => o.id === d.open.recommended && o.change) ?? d.open?.options.find((o) => o.change);
  if (!pick) {
    log(`  "${r.title}": no merged version from Claude (${d.thread.status})`);
    wrong.push(`Claude didn't propose a merged version on "${r.title}".`);
    continue;
  }
  await call(`${P}/threads/${r.threadId}/draft`, 'PUT', { optionId: pick.id });
  const accepted2 = await call(`${P}/submit`, 'POST', { scope: 'thread', threadId: r.threadId });
  log(`  "${r.title}": accepted Claude's "${pick.label}": ${accepted2.ok ? accepted2.body.message : accepted2.body.error}`);
  if (!accepted2.ok || accepted2.body.resolved !== 1) wrong.push(`Claude's merged version on "${r.title}" wasn't applied.`);
}
if (wrong.length) throw new Error(`The update didn't land:\n- ${wrong.join('\n- ')}`);
log('Smoke test passed.');
