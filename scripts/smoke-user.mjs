// Plays the user for scripts/smoke-claude.sh. It waits for the import, checks the drawings the importers wrote,
// answers one question the way the browser would, and waits for Claude's reply. Then it finalizes: it applies pending
// small edits, accepts Claude's proposals, parks whatever still blocks Finalize, starts it, waits for the finalizer's
// final, accepts it into the scratch repo and checks the copy. Exits non-zero if anything doesn't happen in time, if a
// visual type has items without drawings, or if the final didn't land.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.DEV_PLUMBING_HOME;
const long = process.env.DP_SMOKE_LONG === '1';
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
const choice = detail.open?.options.find((o) => !o.change);
const draft = choice ? { optionId: choice.id, note: 'Go with this, and keep it simple.' } : { text: 'Use your recommendation, and keep it simple.' };
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
log('Smoke test passed.');
