// Plays the user for scripts/smoke-claude.sh. It waits for the import, checks the drawings the importers wrote,
// answers one question the way the browser would, and waits for Claude's reply. Then it finalizes: it applies pending
// small edits, accepts Claude's proposals, parks whatever still blocks Finalize, starts it, waits for the finalizer's
// final, accepts it into the scratch repo and checks the copy. Then the plan changes in the repo: it rewrites a line
// round 1 changed in the draft, and a section the draft never changed, removes a small one, and asks the runner for a
// second /dev-plumbing. It checks the update to v2, the merge, the re-import and the Plan changes threads, and accepts
// Claude's merged version on each, and checks what the update left: what v2 changed on each changed item, a re-import
// that finished, and whether a catch-up re-import is due. Last, it generates the Whiteboard Defense, checks it against
// the rules file and its presenter against the project's drawings, asks Claude about its Security model and sends one
// of its unknowns to Questions. Exits non-zero if anything doesn't happen in time, if a route answers with an error, if
// a visual type has items without drawings, or if the final, the update, what the update left or the Whiteboard
// Defense didn't land.
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
  return { ok: res.ok, status: res.status, body: await res.json() };
}

/** A route answered with an error where it had to work: waiting longer won't fix it. */
class RouteError extends Error {}
/** The body of a route that has to work, or a RouteError with the route and its status. */
function must(route, r) {
  if (!r.ok) throw new RouteError(`${route} answered ${r.status}: ${r.body?.error ?? 'no message'}`);
  return r.body;
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
    } catch (e) {
      // A route that answered with an error fails at once. Anything else may be the service not being up yet.
      if (e instanceof RouteError) throw e;
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
// What the update leaves behind (what v2 changed on an item, a re-import that didn't finish, the catch-up) is checked as
// it comes up, but failed only at the end, so the Whiteboard Defense still runs.
const followUps = [];
const v2Home = (await call(P)).body;
const project = v2Home.project;
const v2 = project.versions.find((v) => v.n === 2);
log(`Versions: ${project.versions.map((v) => `v${v.n}${v.merge ? ` (merge: ${v.merge.clean} clean, ${v.merge.conflicts} in conflict)` : ''}`).join(', ')}`);
log(`  Status: ${project.status}, import pending: ${project.importPending.join(', ') || 'none'}, re-import unfinished for: ${v2Home.importIncomplete?.titles.join(', ') || 'none'}`);
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
// Every importer's batch came, so the project home has no "didn't finish" line.
if (v2Home.importIncomplete) followUps.push(`The project home says the v${v2Home.importIncomplete.version} re-import didn't finish for ${v2Home.importIncomplete.titles.join(', ')}.`);
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
// An item flagged as changed in v2 shows "What v2 changed" in its thread: the parts that differ from its copy in
// docs/versions/v1/items/ (summary, details, fields, drawing), or "Nothing else changed." when only the flag was set.
const CHANGE_PARTS = [['summary', 'summary'], ['body', 'details'], ['fields', 'fields'], ['drawing', 'drawing']];
const whatChanged = [];
for (const r of kept.filter((x) => v2ById.get(x.id).flagged)) {
  const d = (await call(`${P}/threads/${r.threadId}`)).body;
  if (!d.item.flags?.some((f) => f.reason === "Changed in the plan's v2.")) continue;
  changedCount++;
  const vc = d.versionChange ?? null;
  const parts = vc ? CHANGE_PARTS.filter(([k]) => vc[k] !== null).map(([, label]) => label) : [];
  whatChanged.push(`"${r.title}": ${!vc ? 'nothing shown' : parts.length ? parts.join(', ') : 'nothing else changed'}`);
  if (vc?.version !== 2) followUps.push(`"${r.title}" is flagged as changed in v2, but its thread ${vc ? `shows what v${vc.version} changed` : "doesn't show what v2 changed"}.`);
}
log(`Re-import: ${imported.length} imported items before. ${kept.length} kept their ids (${changedCount} flagged as changed in v2), ${newItems.length} new, ${removedItems.length} removed from the plan, ${lost.length} gone.`);
if (whatChanged.length) log(`  What v2 changed: ${whatChanged.join('; ')}`);
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
// The Plan changes threads whose accepted option changed the draft. Only these call for a catch-up (Task 7).
const editedBySettling = [];
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
  else if (pick.change.md?.length) editedBySettling.push(r.title);
}

// The catch-up. Once every Plan changes thread of v2 is settled, the next /dev-plumbing re-imports once more, so the
// items catch up with what was settled, but only when settling one changed the draft: an accepted option with edits.
// Keep my draft, which Claude recommended in the earlier runs, changes nothing, and answers to other items don't
// count. This run doesn't start a third window, so it checks that the project home offers the catch-up exactly then.
const settledHome = must(P, await call(P));
const unsettled = (await itemRows()).filter((r) => r.type === 'plan-changes' && r.status !== 'resolved' && r.status !== 'parked');
/** Why no catch-up is due, or null when one is. */
const noCatchUp = !v2?.merge?.conflicts
  ? 'v2 had nothing to settle'
  : unsettled.length
    ? `${unsettled.length} Plan changes threads aren't settled`
    : !editedBySettling.length
      ? "every option accepted on them kept the draft as it was, so there's nothing to catch up"
      : null;
log(`Catch-up: ${noCatchUp ?? `every Plan changes thread is settled, and settling changed the draft (${editedBySettling.map((t) => `"${t}"`).join(', ')})`}; the project home says one is ${settledHome.catchUpDue ? 'due' : 'not due'}`);
if (typeof settledHome.catchUpDue !== 'boolean') followUps.push(`The project home's catchUpDue is ${JSON.stringify(settledHome.catchUpDue)}, not true or false.`);
else if (settledHome.catchUpDue && noCatchUp !== null) followUps.push(`The project home offers a catch-up, but ${noCatchUp}.`);
else if (!settledHome.catchUpDue && noCatchUp === null) followUps.push("The project home doesn't offer a catch-up, though every Plan changes thread of v2 is settled and settling changed the draft.");

if (wrong.length) throw new Error(`The update didn't land:\n- ${wrong.join('\n- ')}`);

// The Whiteboard Defense. The user generates it in the app, and this window (round 2's) hands the request to one
// whiteboard subagent on opus, which can take ten minutes or more. The user then checks it against the rules file, asks
// Claude about its Security model, and sends one claim it marks Unknown or Verify before release to Questions (or, with
// none, its first release concern to Concerns). The Defense thread may never reach the Finalize checklist, and the
// question may not make the defense out of date unless Claude added a Questions or Concerns item.
const W = `${P}/whiteboard`;
// As SPEC §12 and the defense's schema have them.
const SECTION_IDS = ['summary', 'diagram', 'walkthrough', 'data', 'security', 'failure', 'tradeoffs', 'complexity', 'readiness', 'unknowns'];
const LEVEL_NAMES = { 1: 'Lightweight', 2: 'Standard', 3: 'High risk' };
const BASIS_LABELS = { known: 'Known', inferred: 'Inferred', unknown: 'Unknown', verify: 'Verify before release' };
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const flaws = [];
const whiteboardView = async () => must(W, await call(W));
/** A thread once Claude is done with it. Its last message has to be Claude's reply. */
async function claudeReply(what, threadId) {
  const route = `${P}/threads/${threadId}`;
  const d = await until(what, async () => {
    const detail = must(route, await call(route));
    return detail.thread.status !== 'with_claude' ? detail : null;
  }, 15);
  if (d.thread.messages.at(-1)?.author !== 'claude') throw new Error(`"${d.item.title}" came back from Claude without a reply (${d.thread.status}).`);
  return d;
}
/** A Defense thread is in no group of the Finalize checklist, whatever its status. */
async function notOnFinalize(when, threadId) {
  const c = (await finalizeView()).checklist;
  const groups = ['blocking', 'defaults', 'parked', 'unreviewed'].filter((g) => c[g].some((e) => e.threadId === threadId));
  log(`  Finalize ${when}: ${c.blocking.length} blocking, the Defense thread ${groups.length ? `listed under ${groups.join(', ')}` : 'not listed'}`);
  if (groups.length) flaws.push(`The Finalize checklist lists the Defense thread ${when}, under ${groups.join(', ')}.`);
}

const firstView = await whiteboardView();
log(`Whiteboard Defense: ${firstView.defense ? 'one saved already' : 'none yet'}, can generate: ${firstView.canGenerate ? 'yes' : `no (${firstView.generateRefusal})`}`);
if (!firstView.canGenerate) throw new Error(`The Whiteboard Defense can't be generated: ${firstView.generateRefusal}`);
// Which document it should explain: the final while it's current, else the draft, as the Finalize page tells them apart.
// Round 1 accepted a final, but v2 changed the draft and its Plan changes were applied, so here it's the draft.
const finalNow = await finalizeView();
const currentVersion = project.versions.at(-1)?.n;
const finalCurrent = Boolean(project.docs.final) && finalNow.changesSinceFinal === 0 && finalNow.planVersionSinceFinal === null;
const expectDoc = finalCurrent ? 'final' : 'draft';
log(`  The final ${project.docs.final ? `is ${finalCurrent ? 'current' : 'behind'} (${finalNow.changesSinceFinal} changes since Accept, plan version since: ${finalNow.planVersionSinceFinal ?? 'none'})` : "isn't there"}, so it should explain the ${expectDoc} (v${currentVersion})`);
const generated = must(W, await call(W, 'POST', {}));
log(`Asked for the Whiteboard Defense: ${generated.message}`);
const generatedAt = Date.now();
let pickedUp = false;
const defenseView = await until("Claude's Whiteboard Defense", async () => {
  const v = await whiteboardView();
  if (v.request?.state === 'writing' && !pickedUp) {
    pickedUp = true;
    log(`  A Claude window picked it up after ${Math.round((Date.now() - generatedAt) / 1000)} s.`);
  }
  return v.request?.state === 'failed' || (v.defense && v.defense.id !== firstView.defense?.id) ? v : null;
  // Up to three resends of a defense with its presenter, on opus.
}, 25);
if (defenseView.request?.state === 'failed') throw new Error(`The whiteboard subagent gave up: ${defenseView.request.reason}`);
const generatedIn = Math.round((Date.now() - generatedAt) / 1000);

// What the subagent wrote: a level with reasons, the ten prose sections in order, each with claims, every statement
// marked, at least five questions, and the checklist, which the service copies from the rules file, where each line is
// "[ ] <line>".
const defense = defenseView.defense;
/** Every claim, with its ref (`<section id>.<index>`) and its section. */
const claims = defense.sections.flatMap((s) => s.claims.map((c, i) => ({ ...c, ref: `${s.id}.${i}`, section: s })));
const byBasis = (list) => Object.keys(BASIS_LABELS).map((b) => `${b} ${list.filter((x) => x.basis === b).length}`).join(', ');
const diagramSection = defense.sections.find((s) => s.id === 'diagram');
const ruleLines = [...fs.readFileSync(path.join(dir, 'outputs', 'whiteboard-defense.md'), 'utf8').matchAll(/^\[ \] (.+)$/gm)].map((m) => m[1].trim());
const checklistLines = defense.checklist.map((k) => k.text);
const firstDiff = [...Array(Math.max(ruleLines.length, checklistLines.length)).keys()].find((i) => checklistLines[i] !== ruleLines[i]);
const quoted = (text) => (text === undefined ? 'nothing' : `"${text}"`);
log(`Claude's Whiteboard Defense arrived in ${generatedIn} s: level ${defense.level} (${LEVEL_NAMES[defense.level] ?? 'no such level'}), based on the ${defense.basedOn.doc} (v${defense.basedOn.version})`);
for (const reason of defense.levelReasons) log(`  Level reason: ${reason}`);
log(`  Sections: ${defense.sections.map((s) => `${s.id} ${s.claims.length}`).join(', ')}`);
log(`  Claims: ${claims.length} (${byBasis(claims)}), ${defense.sections.reduce((n, s) => n + s.tables.length, 0)} tables`);
log(`  Diagram: ${diagramSection?.diagramItemId ? `drawn from ${diagramSection.diagramItemId}` : 'no project diagram'}, ${diagramSection?.diagram ? `${diagramSection.diagram.split('\n').length} lines of text` : 'no text diagram'}`);
log(`  Questions: ${defense.questions.length} (${byBasis(defense.questions)})`);
log(`  Concerns: ${defense.concerns.length} (${SEVERITIES.map((s) => `${s} ${defense.concerns.filter((c) => c.severity === s).length}`).join(', ')})`);
log(`  Checklist: ${checklistLines.length} lines, ${firstDiff === undefined ? 'as the rules file has them' : `not as the rules file has them from line ${firstDiff + 1}`}`);
log(`  Out of date when saved: ${defenseView.stale ?? 'no'}`);
if (![1, 2, 3].includes(defense.level) || !defense.levelReasons.length) flaws.push(`The level is ${defense.level}, with ${defense.levelReasons.length} reasons.`);
if (defense.sections.map((s) => s.id).join() !== SECTION_IDS.join()) flaws.push(`The sections are ${defense.sections.map((s) => s.id).join(', ')}, not the ten in order.`);
for (const s of defense.sections.filter((x) => !x.claims.length)) flaws.push(`${s.title} has no claims.`);
const bases = [...claims, ...defense.questions, ...defense.concerns].map((x) => x.basis);
if (bases.some((b) => !Object.hasOwn(BASIS_LABELS, b))) flaws.push(`Some statements are marked ${[...new Set(bases.filter((b) => !Object.hasOwn(BASIS_LABELS, b)))].join(', ')}.`);
if (defense.concerns.some((c) => !SEVERITIES.includes(c.severity))) flaws.push(`Some concerns have a severity that isn't one of ${SEVERITIES.join(', ')}.`);
if (defense.questions.length < 5) flaws.push(`The defense has ${defense.questions.length} questions; the run expects at least five.`);
if (ruleLines.length !== 20) flaws.push(`The rules file has ${ruleLines.length} checklist lines, not 20.`);
if (firstDiff !== undefined) flaws.push(`The checklist isn't the rules file's: line ${firstDiff + 1} is ${quoted(checklistLines[firstDiff])}, where the rules have ${quoted(ruleLines[firstDiff])}.`);
if (defense.basedOn.doc !== expectDoc || defense.basedOn.version !== currentVersion) {
  flaws.push(`The defense is based on the ${defense.basedOn.doc} (v${defense.basedOn.version}), not the ${expectDoc} (v${currentVersion}).`);
}
if (defenseView.stale) flaws.push(`The defense was out of date as soon as it was saved: ${defenseView.stale}`);

// The presenter, which Present draws: the seven chapters in order, each with one to eight steps, and at least one that
// draws something. A chapter draws one of the project's drawings, or none, and every part its steps reveal, and every
// part a note is near, is one of that drawing's parts. The service checked all this before it saved the defense. Here
// it's checked against the drawings of the whiteboard pack, which dp_context's route gives without writing anything:
// the defense isn't out of date, so they're the drawings the subagent had. Each drawing also has to be an item the
// project has now, on the right screen and not parked, as the browser's routes list them.
const PRESENT_CHAPTERS = [
  ['purpose', 'Purpose'],
  ['flow', 'System flow'],
  ['data', 'Data and source of truth'],
  ['states', 'States'],
  ['security', 'Security'],
  ['failure', 'Failure and retries'],
  ['rollback', 'Rollback and blast radius'],
];
const NOTE_INKS = ['ink', 'slate', 'seal', 'moss'];
/** A drawing as the pack keys it: diagram:<item id>, tables or flow:<item id>. */
const drawingKey = (d) => (d.kind === 'tables' ? 'tables' : `${d.kind}:${d.itemId}`);
const presenter = defense.presenter ?? null;
const presenterSteps = presenter ? presenter.chapters.reduce((n, c) => n + c.steps.length, 0) : 0;
if (!presenter) flaws.push("The defense has no presenter, so Present can't show it.");
else {
  const chapters = presenter.chapters;
  const pack = must('/api/claude/context', await call('/api/claude/context', 'POST', { repo: 'acme-app', project: project.id, whiteboard: true }));
  const options = new Map((pack.drawings ?? []).map((o) => [drawingKey(o.drawing), o]));
  const screens = new Map(must(P, await call(P)).types.map((t) => [t.id, t.screen]));
  const rows = await itemRows();
  const live = (r) => r.status !== 'parked' && r.removedIn === null && r.data !== null;
  /** Why a chapter's drawing isn't one the project has now, or null when it is. */
  const gone = (d) => {
    if (d.kind === 'tables') return rows.some((r) => screens.get(r.type) === 'database' && live(r)) ? null : 'the project has no tables to draw';
    const row = rows.find((r) => r.id === d.itemId);
    if (!row) return `there's no item ${d.itemId}`;
    if (!live(row)) return `${d.itemId} is parked, removed from the plan or has no drawing`;
    if (d.kind === 'diagram' && screens.get(row.type) !== 'diagram') return `${d.itemId} isn't a diagram`;
    if (d.kind === 'flow' && (screens.get(row.type) !== 'flows' || !['system', 'both'].includes(row.data.kind))) return `${d.itemId} isn't a system flow`;
    return null;
  };
  const drawn = chapters.filter((c) => c.drawing);
  const notes = chapters.flatMap((c) => c.steps.flatMap((s) => s.notes));
  log(`  Drawings in the pack: ${[...options.values()].map((o) => `${drawingKey(o.drawing)} (${o.parts.length} parts)`).join(', ') || 'none'}`);
  log(`  Presenter: ${chapters.length} chapters, ${presenterSteps} steps, ${drawn.length} drawing something (${['diagram', 'tables', 'flow'].map((k) => `${k} ${drawn.filter((c) => c.drawing.kind === k).length}`).join(', ')}), ${notes.length} notes (${NOTE_INKS.map((k) => `${k} ${notes.filter((x) => x.ink === k).length}`).join(', ')})`);
  if (chapters.map((c) => c.id).join() !== PRESENT_CHAPTERS.map(([id]) => id).join()) flaws.push(`The presenter's chapters are ${chapters.map((c) => c.id).join(', ')}, not the seven in order.`);
  else if (chapters.some((c, i) => c.title !== PRESENT_CHAPTERS[i][1])) flaws.push(`The presenter's chapter titles are ${chapters.map((c) => `"${c.title}"`).join(', ')}, not Present's.`);
  if (!drawn.length) flaws.push('No chapter of the presenter draws anything.');
  /** Parts a step names that aren't in its chapter's drawing. */
  const strays = [];
  for (const [i, c] of chapters.entries()) {
    const option = c.drawing ? options.get(drawingKey(c.drawing)) : undefined;
    const parts = new Set((option?.parts ?? []).map((p) => p.ref));
    const revealed = c.steps.reduce((n, s) => n + s.reveal.length, 0);
    log(`  ${i + 1}. ${c.title}: ${c.steps.length} steps, ${c.drawing ? `draws ${option ? `"${option.title}"` : 'something not in the pack'} (${drawingKey(c.drawing)}), revealing ${revealed} of its ${parts.size} parts` : 'draws nothing'}, ${c.steps.reduce((n, s) => n + s.notes.length, 0)} notes`);
    if (c.steps.length < 1 || c.steps.length > 8) flaws.push(`${c.title} has ${c.steps.length} steps; a chapter has one to eight.`);
    if (c.drawing && !option) flaws.push(`${c.title} draws ${drawingKey(c.drawing)}, which isn't one of the pack's drawings.`);
    const why = c.drawing ? gone(c.drawing) : null;
    if (why) flaws.push(`${c.title} draws ${drawingKey(c.drawing)}, but ${why}.`);
    for (const [s, step] of c.steps.entries()) {
      for (const ref of step.reveal) if (!parts.has(ref)) strays.push(`${c.id} step ${s + 1} reveals "${ref}"`);
      for (const note of step.notes) if (note.near !== '' && !parts.has(note.near)) strays.push(`${c.id} step ${s + 1} has a note near "${note.near}"`);
    }
  }
  if (strays.length) flaws.push(`The presenter names parts that aren't in its chapter's drawing: ${strays.join('; ')}.`);
}

// Ask Claude about 5. Security model, as "Ask Claude about this" does. The question is the thread's first message,
// sent like Send this thread. Claude answers in a Defense thread, which never offers to change the draft. When the answer
// needs nothing more, Claude resolves the thread itself.
const QUESTION = "What stops one customer from seeing or changing another customer's reminders? Say what the plan settles and what it leaves open.";
const askResult = must(`${W}/ask`, await call(`${W}/ask`, 'POST', { defenseId: defense.id, kind: 'section', ref: 'security', question: QUESTION }));
const askThread = askResult.threadId;
log(`Asked Claude about 5. Security model: ${askResult.message}`);
if (askResult.sent !== 1) flaws.push(`Asking sent ${askResult.sent} threads to Claude, not 1.`);
await notOnFinalize('while Claude answers', askThread);
const askAt = Date.now();
const answer = await claudeReply("Claude's answer about the Security model", askThread);
const fromClaude = answer.thread.messages.filter((m) => m.author === 'claude');
const offered = fromClaude.flatMap((m) => m.options ?? []);
const withChange = offered.filter((o) => o.change);
const smallEdits = fromClaude.flatMap((m) => m.smallEdits ?? []);
const addedItems = fromClaude.flatMap((m) => m.newItemIds ?? []);
log(`Claude answered in ${Math.round((Date.now() - askAt) / 1000)} s: ${fromClaude.at(-1).text.slice(0, 160)}`);
log(`  ${answer.type.title} item, made by ${answer.item.createdBy}, ${answer.thread.status.replace('_', ' ')}: ${offered.length} options, ${withChange.length} with a change, ${smallEdits.length} small edits, ${addedItems.length} new items`);
if (answer.item.type !== 'defense' || answer.item.createdBy !== 'whiteboard') flaws.push(`Asking made a ${answer.item.type} item made by ${answer.item.createdBy}, not a Defense item made by the whiteboard.`);
if (answer.type.title !== 'Defense questions') flaws.push(`The Defense type is called "${answer.type.title}", not "Defense questions".`);
// Resolved when the answer needed nothing more from the user, else waiting for them.
if (!['resolved', 'your_turn'].includes(answer.thread.status)) flaws.push(`The Defense thread came back ${answer.thread.status}, not resolved or your turn.`);
if (withChange.length || smallEdits.length) {
  const changes = [...withChange.map((o) => `option "${o.label}"`), ...smallEdits.map((e) => `small edit "${e.summary}"`)];
  flaws.push(`Claude's answer in the Defense thread changes the draft: ${changes.join(', ')}.`);
}
// What Claude added from a Defense thread can only be a Questions or a Concerns item.
for (const id of addedItems) {
  const route = `${P}/threads/t-${id}`;
  const added = must(route, await call(route));
  log(`  Added from the Defense thread: ${added.type.title} item "${added.item.title}"`);
  if (!['questions', 'concerns'].includes(added.item.type)) flaws.push(`Claude added "${added.item.title}" (${added.type.title}) from a Defense thread, which may add only Questions or Concerns items.`);
}
const navTypes = must(P, await call(P)).types.map((t) => t.id);
log(`  Defense questions in the nav: ${navTypes.includes('defense') ? 'yes' : 'no'}`);
if (!navTypes.includes('defense')) flaws.push("The nav doesn't show Defense questions, though it has a thread.");
await notOnFinalize('after Claude answered', askThread);
// A question about the defense doesn't make it out of date. A Questions or Concerns item Claude added to the plan in
// its answer would: that's a plan item like any other.
const afterAsk = await whiteboardView();
log(`  Out of date after asking Claude: ${afterAsk.stale ?? 'no'}${addedItems.length ? ` (Claude added ${addedItems.length} items to the plan)` : ''}`);
if (afterAsk.stale && !addedItems.length) flaws.push(`Asking Claude made the defense out of date: ${afterAsk.stale}`);

// Send the first claim marked Unknown or Verify before release to Questions; with none, the first release concern to
// Concerns. Its thread starts with Claude, which suggests answers with no message from the user. Those suggestions
// don't hold up Finalize until the user has written in the thread.
const unknownClaim = claims.find((c) => c.basis === 'unknown' || c.basis === 'verify');
const firstConcern = defense.concerns[0];
const toSend = unknownClaim
  ? { kind: 'claim', ref: unknownClaim.ref, text: unknownClaim.text, what: `${unknownClaim.section.title}, ${BASIS_LABELS[unknownClaim.basis]}`, typeId: 'questions' }
  : firstConcern
    ? { kind: 'concern', ref: firstConcern.id, text: firstConcern.text, what: `release concern, ${firstConcern.severity}`, typeId: 'concerns' }
    : null;
let sentThread = null;
if (!toSend) flaws.push('Nothing could be sent: no claim is marked Unknown or Verify before release, and there are no release concerns.');
else {
  if (!unknownClaim) log('No claim is marked Unknown or Verify before release, so the first release concern goes to Concerns instead.');
  const sendResult = must(`${W}/send`, await call(`${W}/send`, 'POST', { defenseId: defense.id, kind: toSend.kind, ref: toSend.ref }));
  sentThread = sendResult.threadId;
  log(`Sent "${toSend.text.slice(0, 80)}" (${toSend.what}) to ${sendResult.typeTitle}: ${sendResult.message}`);
  if (sendResult.typeId !== toSend.typeId) flaws.push(`It went to ${sendResult.typeTitle}, not ${toSend.typeId}.`);
  const sendAt = Date.now();
  const suggested = await claudeReply("Claude's suggested answers for what was sent", sentThread);
  const options = suggested.open?.options ?? [];
  const recommended = options.find((o) => o.id === suggested.open?.recommended);
  log(`Claude suggested answers in ${Math.round((Date.now() - sendAt) / 1000)} s: ${options.length} options${recommended ? `, recommended "${recommended.label}"` : ''}. ${suggested.thread.messages.at(-1).text.slice(0, 120)}`);
  if (!options.length) flaws.push(`Claude replied on "${suggested.item.title}" without suggesting answers.`);
  if (suggested.item.createdBy !== 'whiteboard' || suggested.item.fromDefense?.ref !== toSend.ref) flaws.push(`The item "${suggested.item.title}" doesn't say it came from the Whiteboard Defense.`);
  const blockedBy = (await finalizeView()).checklist.blocking.find((e) => e.threadId === sentThread)?.reason;
  log(`  Finalize with Claude's suggestions waiting: ${blockedBy ? `blocked: ${blockedBy}` : 'not blocked'}`);
  if (blockedBy === 'A proposal is waiting for your answer.') flaws.push("Claude's first suggestions on what was sent hold up Finalize before the user has answered.");
}

// The page links both threads to the parts they came from, and Finalize still leaves the Defense thread out.
const endView = await whiteboardView();
if (!endView.asked.some((l) => l.threadId === askThread)) flaws.push("The page doesn't list the thread that asked about the Security model.");
if (sentThread && !endView.sent.some((l) => l.threadId === sentThread)) flaws.push("The page doesn't show what was sent as sent.");
await notOnFinalize('at the end', askThread);
log(`Whiteboard Defense: written in ${generatedIn} s, level ${defense.level}, ${defense.questions.length} questions, ${defense.concerns.length} concerns, ${claims.length} claims, ${presenterSteps} presenter steps; asked ${endView.asked.length}, sent ${endView.sent.length}; out of date: ${endView.stale ?? 'no'}`);
const failures = [];
if (followUps.length) failures.push(`What the update left isn't right:\n- ${followUps.join('\n- ')}`);
if (flaws.length) failures.push(`The Whiteboard Defense isn't right:\n- ${flaws.join('\n- ')}`);
if (failures.length) throw new Error(failures.join('\n'));
log('Smoke test passed.');
