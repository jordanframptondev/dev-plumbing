// Plays the user for scripts/smoke-claude.sh. It waits for the import, checks the drawings the importers wrote,
// answers one question the way the browser would, then waits for Claude's reply. Exits non-zero if anything
// doesn't happen in time, or if a visual type has items without drawings.
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
log('Smoke test passed.');
