// Plays the user for scripts/smoke-claude.sh. It waits for the import, answers one question the way the
// browser would, then waits for Claude's reply. Exits non-zero if anything doesn't happen in time.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.DEV_PLUMBING_HOME;
const long = process.env.DP_SMOKE_LONG === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[user ${new Date().toISOString().slice(11, 19)}] ${msg}`);

async function call(route, method = 'GET', body) {
  const run = JSON.parse(fs.readFileSync(path.join(dir, 'run', 'service.json'), 'utf8'));
  const res = await fetch(`http://127.0.0.1:${run.port}${route}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-dev-plumbing-token': run.token },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { ok: res.ok, body: await res.json() };
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
}, 15);
log(`Import finished in ${Math.round((Date.now() - started) / 1000)} s.`);
for (const t of home.types) log(`  ${t.title}: ${t.noChanges ? `no changes (${t.noChanges.reason})` : `${t.itemCount} items`}`);
log(`Repo profile saved: ${fs.existsSync(path.join(dir, 'repos', 'acme-app.json')) ? 'yes' : 'no'}`);

const target = home.inbox.find((e) => e.status === 'your_turn');
if (!target) throw new Error('No thread is waiting for an answer.');
const detail = (await call(`${P}/threads/${target.threadId}`)).body;
const choice = detail.open?.options.find((o) => !o.change);
const draft = choice ? { optionId: choice.id, note: 'Go with this, and keep it simple.' } : { text: 'Use your recommendation, and keep it simple.' };
if (long) {
  log('Waiting 35 minutes before answering, to check the long wait survives...');
  await sleep(35 * 60_000);
}
await call(`${P}/threads/${target.threadId}/draft`, 'PUT', draft);
const sent = (await call(`${P}/submit`, 'POST', { scope: 'thread', threadId: target.threadId })).body;
log(`Answered "${target.itemTitle}": ${sent.message}`);

const sentAt = Date.now();
const reply = await until("Claude's reply", async () => {
  const d = (await call(`${P}/threads/${target.threadId}`)).body;
  const last = d.thread.messages.at(-1);
  return last?.author === 'claude' && d.thread.status !== 'with_claude' ? last : null;
}, 15);
log(`Claude replied in ${Math.round((Date.now() - sentAt) / 1000)} s: ${reply.text.slice(0, 160)}`);
log('Smoke test passed.');
