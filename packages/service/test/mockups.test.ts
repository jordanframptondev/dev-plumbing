import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { writeJsonAtomic } from '@dev-plumbing/core';
import { createApp } from '../src/app';
import { markupOf, mockupCsp, mockupDocument, PIN_SCRIPT } from '../src/mockup';
import { createRuntime } from '../src/runtime';
import { makeRepo } from '../../core/test/fixtures';
import { call, makeContext, removeTempDirs } from './helpers';

afterAll(removeTempDirs);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const P = '/api/projects/acme-app/restock-reminders';
const MARKUP = '<main class="p-6"><div class="bg-brand rounded-card p-4" data-testid="card">Restock soon</div></main>';
const SETTINGS = { location: { app: 'web', route: '/reminders', files: ['apps/web/app/reminders/page.tsx'] }, kit: 'web', after: MARKUP };
const BADGE = { location: { app: 'web', files: [] }, kit: 'web', after: '<span class="rounded-card bg-brand px-2">3 days left</span>', before: '<span>Restock</span>' };
const KIT = '@import "tailwindcss";\n@import "./theme.css";\n@plugin "@tailwindcss/typography";\n';
const THEME = '@theme {\n  --color-brand: #0f766e;\n  --radius-card: 14px;\n}\n';
const POLICY = (nonce: string) =>
  `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`;
const nonceOf = (html: string) => /<script nonce="([^"]+)" src="\/kit\/tailwind.js"><\/script>/.exec(html)?.[1] ?? '';
const count = (text: string, part: string) => text.split(part).length - 1;

/** A repo with a Tailwind kit, its repo profile, and a plumbing project with two UI items and a question. */
async function setup(profile: Record<string, unknown> = {}) {
  const s = await makeContext();
  const repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
  await fs.mkdir(path.join(repo, 'apps', 'web', 'app'), { recursive: true });
  await fs.writeFile(path.join(repo, 'apps', 'web', 'app', 'globals.css'), KIT);
  await fs.writeFile(path.join(repo, 'apps', 'web', 'app', 'theme.css'), THEME);
  await writeJsonAtomic(path.join(s.ctx.configDir, 'repos', 'acme-app.json'), {
    name: 'acme-app',
    match: ['github.com/acme/acme-app'],
    apps: [{ name: 'web', path: 'apps/web', kitFiles: ['apps/web/app/globals.css'] }],
    ...profile,
  });
  const app = createApp(s.ctx, createRuntime());
  const send = async (method: string, route: string, body?: unknown): Promise<{ status: number; body: Json }> => {
    const res = await call(app, route, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  };
  const items: Record<string, unknown[]> = {
    ui: [
      { key: 'settings', title: 'Restock settings card', summary: 'A card on the reminders page.', data: SETTINGS },
      { key: 'badge', title: 'Restock badge', summary: 'A badge on each item.', data: BADGE },
    ],
    questions: [{ key: 'days', title: 'How many days before?', summary: 'Lead time.' }],
  };
  const open = await send('POST', '/api/claude/open', { cwd: repo, plan: 'docs/specs/restock-reminders.md' });
  for (const type of open.body.importTypes as { id: string }[]) {
    const list = items[type.id];
    const r = await send('POST', '/api/claude/items', { repo: 'acme-app', project: 'restock-reminders', type: type.id, ...(list ? { items: list } : { noChanges: 'None.' }) });
    if (r.status !== 200) throw new Error(`${type.id}: ${r.body.error}`);
  }
  const get = (route: string) => call(app, `${P}${route}`);
  return { ...s, app, send, get, repo, dir: path.join(s.root, 'acme-app', 'restock-reminders') };
}

describe('mockup documents', () => {
  it('serve the markup with the kit, the Tailwind compiler and the pin script', async () => {
    const t = await setup();
    const res = await t.get('/items/ui-settings/mockup/after');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const html = await res.text();
    expect(html).toContain('<title>Restock settings card</title>');
    expect(html).toContain(MARKUP);
    expect(html).toContain('<style type="text/tailwindcss">@import "tailwindcss";');
    // The kit's relative import is inlined; its own Tailwind import and its @plugin are gone.
    expect(html).toContain('--color-brand: #0f766e;');
    expect(count(html, '@import')).toBe(1);
    expect(html).not.toContain('@plugin');
    const nonce = nonceOf(html);
    expect(nonce).not.toBe('');
    expect(html).toContain(`<script nonce="${nonce}">${PIN_SCRIPT}</script>`);
    // A fresh nonce for every document.
    expect(nonceOf(await (await t.get('/items/ui-settings/mockup/after')).text())).not.toBe(nonce);
  });

  it("the document's CSP blocks everything but our two scripts", async () => {
    const t = await setup();
    const res = await t.get('/items/ui-settings/mockup/after');
    const html = await res.text();
    const nonce = nonceOf(html);
    expect(res.headers.get('content-security-policy')).toBe(POLICY(nonce));
    expect(mockupCsp('abc')).toBe(POLICY('abc'));
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(count(html, '<script')).toBe(2);
    expect(count(html, `nonce="${nonce}"`)).toBe(2);
    // The markup goes in exactly as written: the policy, not a rewrite, is what keeps it harmless.
    expect(html).toContain(`<body>\n${MARKUP}\n</body>`);
    // Nothing from the markup comes before either script, so it can't swallow, clobber or steal them.
    const markupAt = html.indexOf(MARKUP);
    const lastNonce = html.lastIndexOf(`nonce="${nonce}"`);
    expect(lastNonce).toBeGreaterThan(html.indexOf('<script nonce'));
    expect(markupAt).toBeGreaterThan(lastNonce);
    expect(html.indexOf('</head>')).toBeGreaterThan(html.indexOf(PIN_SCRIPT.slice(0, 40)));
  });

  it('still serve markup that breaks a write rule, without meta tags', async () => {
    const t = await setup();
    const file = path.join(t.dir, 'items', 'ui-settings.json');
    const item = JSON.parse(await fs.readFile(file, 'utf8'));
    const risky = '<img src="https://example.com/x.png"><button onclick="alert(1)">x</button>';
    await fs.writeFile(file, JSON.stringify({ ...item, data: { ...item.data, after: `${risky}<meta http-equiv="refresh" content="0;url=https://example.com">` } }));
    const html = await (await t.get('/items/ui-settings/mockup/after')).text();
    // The meta tag is escaped into text, so it can't be a live tag.
    expect(html).toContain(`<body>\n${risky}&lt;meta http-equiv="refresh" content="0;url=https://example.com">\n</body>`);
    expect(count(html, '<meta')).toBe(2);
  });

  it("404 a missing side, an unknown side, and items that aren't UI items", async () => {
    const t = await setup();
    for (const route of ['/items/ui-settings/mockup/before', '/items/ui-settings/mockup/sideways', '/items/questions-days/mockup/after', '/items/ui-nope/mockup/after']) {
      const res = await t.get(route);
      expect(res.status, route).toBe(404);
      expect(((await res.json()) as { error: string }).error, route).toBeTruthy();
    }
    expect((await t.get('/items/ui-badge/mockup/before')).status).toBe(200);
    expect((await t.get('/items/questions-days/mockup-kit')).status).toBe(404);
  });

  it('report kit warnings beside the document, not in it', async () => {
    const t = await setup();
    const kit = await t.send('GET', `${P}/items/ui-settings/mockup-kit`);
    expect(kit.body).toEqual({ app: 'web', files: ['apps/web/app/globals.css'], warnings: ["Kit: @plugin lines skipped (they don't work in mockups)."] });
    expect(await (await t.get('/items/ui-settings/mockup/after')).text()).not.toContain('Kit:');
  });

  it('say why there is no kit, and still draw the mockup', async () => {
    const noApp = await setup({ apps: [] });
    expect((await noApp.send('GET', `${P}/items/ui-settings/mockup-kit`)).body).toEqual({ app: null, files: [], warnings: ['Kit: the repo profile has no app called web.'] });
    const noClone = await setup();
    await fs.rm(noClone.repo, { recursive: true, force: true });
    expect((await noClone.send('GET', `${P}/items/ui-settings/mockup-kit`)).body).toEqual({
      app: 'web',
      files: ['apps/web/app/globals.css'],
      warnings: ["Kit: the plan's clone isn't on this Mac any more."],
    });
    const res = await noClone.get('/items/ui-settings/mockup/after');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(MARKUP);
    expect(html).not.toContain('--color-brand');
  });

  it('render the mockup an open option proposes, before anyone accepts it', async () => {
    const t = await setup();
    const proposed = { ...SETTINGS, after: '<main class="p-6"><p>Proposed: 5 days left</p></main>' };
    await t.send('PUT', `${P}/threads/t-ui-settings/draft`, { text: 'Can the card say how many days are left?' });
    await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-ui-settings' });
    const reply = await t.send('POST', '/api/claude/reply', {
      repo: 'acme-app',
      project: 'restock-reminders',
      threadId: 't-ui-settings',
      text: 'Two ways to go.',
      options: [
        { id: 'days', label: 'Show the days left', change: { items: [{ itemId: 'ui-settings', patch: { data: proposed } }] } },
        { id: 'keep', label: 'Keep the card as it is' },
        { id: 'retitle', label: 'Rename the question', change: { items: [{ itemId: 'questions-days', patch: { title: 'Lead time?' } }] } },
      ],
    });
    expect(reply.status).toBe(200);

    const res = await t.get('/threads/t-ui-settings/options/days/mockup/after');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<p>Proposed: 5 days left</p>');
    expect(html).not.toContain('Restock soon');
    expect(html).toContain('--color-brand: #0f766e;');
    expect(res.headers.get('content-security-policy')).toBe(POLICY(nonceOf(html)));
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    // The saved mockup is unchanged until the option is accepted.
    expect(await (await t.get('/items/ui-settings/mockup/after')).text()).toContain(MARKUP);

    for (const route of [
      '/threads/t-ui-settings/options/days/mockup/before',
      '/threads/t-ui-settings/options/keep/mockup/after',
      '/threads/t-ui-settings/options/retitle/mockup/after',
      '/threads/t-ui-settings/options/nope/mockup/after',
      '/threads/t-nope/options/days/mockup/after',
    ]) {
      const missing = await t.get(route);
      expect(missing.status, route).toBe(404);
      expect(((await missing.json()) as { error: string }).error, route).toBeTruthy();
    }
  });

  it("a mockup frame can load the Tailwind compiler, but can't call the API", async () => {
    const t = await setup();
    // The app's iframe navigation is same-origin, so it gets the document without a token.
    const page = await t.app.request(`http://localhost:4545${P}/items/ui-settings/mockup/after`, { headers: { 'sec-fetch-site': 'same-origin' } });
    expect(page.status).toBe(200);
    // Inside the sandbox the document has an opaque origin: its requests are cross-site, with Origin: null.
    const fromFrame = { headers: { 'sec-fetch-site': 'cross-site', origin: 'null' } };
    expect((await t.app.request(`http://localhost:4545${P}/items/ui-settings/mockup-kit`, fromFrame)).status).toBe(401);
    const js = await t.app.request('http://localhost:4545/kit/tailwind.js', fromFrame);
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(js.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(js.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await js.text()).toContain('text/tailwindcss');
  });

  it('keep kit CSS inside its style tag, and the title as text', () => {
    const html = mockupDocument({ body: '<p>Hi</p>', kitCss: '.a{}</style><script>alert(1)</script>', nonce: 'n0', title: 'Cards & <lists>' });
    expect(html).toContain('<title>Cards &amp; &lt;lists&gt;</title>');
    expect(html).toContain('.a{}<\\/style><script>alert(1)</script></style>');
    expect(count(html, '</style>')).toBe(1);
  });

  it('use a pin script that parses and never closes its own tag', () => {
    expect(() => new Function(PIN_SCRIPT)).not.toThrow();
    expect(PIN_SCRIPT).not.toMatch(/<\/script/i);
  });

  it('escape meta tags in a way that cannot build a new one', () => {
    for (const hostile of ['<me<meta>ta http-equiv="refresh" content="0;url=https://x.example/">', '<p>hi</p><meta http-equiv="refresh" content="0;url=https://x.example/"', '<META\nhttp-equiv=refresh>', '<meta']) {
      const out = markupOf({ after: hostile }, 'after') ?? '';
      expect(out, hostile).not.toMatch(/<meta/i);
      const html = mockupDocument({ body: out, kitCss: '', nonce: 'n0', title: 't' });
      expect(count(html.toLowerCase(), '<meta'), hostile).toBe(2);
    }
    expect(markupOf({ after: '<p>no meta here</p>' }, 'after')).toBe('<p>no meta here</p>');
  });

  it('escape templates, so no declarative shadow root can hide a link', () => {
    for (const mode of ['closed', 'open']) {
      const hostile = `<div><template shadowrootmode="${mode}"><a href="https://x.example/">x</a></template></div><TEMPLATE\nshadowrootmode=open>`;
      const out = markupOf({ after: hostile }, 'after') ?? '';
      expect(out, mode).not.toMatch(/<template/i);
      const html = mockupDocument({ body: out, kitCss: '', nonce: 'n0', title: 't' });
      expect(count(html.toLowerCase(), '<template'), mode).toBe(0);
    }
  });
});

// jsdom lives in the web package; it's only used here to run the frame's script against hostile markup.
// It has no types here (the web package owns the dependency), so the little that's used is typed by hand.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FrameWindow = any;
const { JSDOM } = createRequire(path.resolve(__dirname, '../../web/package.json'))('jsdom') as {
  JSDOM: new (html: string, options: { runScripts: string; pretendToBeVisual: boolean; beforeParse: (win: FrameWindow) => void }) => { window: FrameWindow };
};

/** Loads a whole mockup document in jsdom with its scripts run, and returns the messages the script posts to its parent. */
async function loadFrame(markup: string) {
  const html = mockupDocument({ body: markup, kitCss: '', nonce: 'n0', title: 'Hostile' });
  const posted: { type: string }[] = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(win: FrameWindow) {
      (win as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() {}
        disconnect() {}
      };
      // A top-level jsdom window is its own parent, so what the script posts to it can be listened for.
      win.addEventListener('message', (e: Event) => {
        const d = (e as MessageEvent).data as { source?: string; type: string };
        if (d?.source === 'dp-mockup') posted.push(d);
      });
    },
  });
  await new Promise<void>((resolve) => dom.window.addEventListener('load', () => resolve()));
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { win: dom.window, posted };
}

describe('the pin script against hostile markup', () => {
  const HOSTILE =
    '<a id="a" href="https://x.example/">link</a>' +
    '<map name="m"><area id="area" href="https://x.example/" shape="rect" coords="0,0,9,9"></map>' +
    '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><a id="svga" xlink:href="https://x.example/"><text id="svgt">t</text></a></svg>' +
    '<form id="f"><button id="b">go</button></form>' +
    '<img name="querySelector"><img name="createElement"><img name="addEventListener"><img name="documentElement">';

  const click = (win: Awaited<ReturnType<typeof loadFrame>>['win'], id: string) => {
    const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true });
    win.document.getElementById(id)!.dispatchEvent(ev);
    return ev.defaultPrevented;
  };

  it('stops every kind of link and form from navigating, and still reports its size', async () => {
    const { win, posted } = await loadFrame(HOSTILE);
    for (const id of ['a', 'area', 'svga', 'svgt']) expect(click(win, id), id).toBe(true);
    const submit = new win.Event('submit', { bubbles: true, cancelable: true });
    win.document.getElementById('f')!.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    expect(posted.some((m) => m.type === 'size')).toBe(true);
  });

  it('tells the app when the document is being left, whatever the markup does', async () => {
    const { win, posted } = await loadFrame(HOSTILE);
    posted.length = 0;
    win.dispatchEvent(new win.Event('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(posted).toEqual([{ source: 'dp-mockup', type: 'leaving' }]);
  });

  it("says nothing when the page is only put in the back/forward cache, and says it's leaving when it really goes", async () => {
    const { win, posted } = await loadFrame(HOSTILE);
    posted.length = 0;
    win.dispatchEvent(new win.PageTransitionEvent('pagehide', { persisted: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(posted).toEqual([]);
    win.dispatchEvent(new win.PageTransitionEvent('pagehide', { persisted: false }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(posted).toEqual([{ source: 'dp-mockup', type: 'leaving' }]);
  });

  it('stops a middle-click on a link, as it stops a click', async () => {
    const { win } = await loadFrame(HOSTILE);
    for (const id of ['a', 'area', 'svga', 'svgt']) {
      const ev = new win.MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
      win.document.getElementById(id)!.dispatchEvent(ev);
      expect(ev.defaultPrevented, id).toBe(true);
    }
  });

  it('stops a link inside an open shadow root', async () => {
    const { win, posted } = await loadFrame('<div id="host"></div>');
    const root = win.document.getElementById('host').attachShadow({ mode: 'open' });
    root.innerHTML = '<a id="inner" href="https://x.example/">x</a>';
    const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    root.getElementById('inner').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(posted.some((m: { type: string }) => m.type === 'size')).toBe(true);
  });

  it('survives markup that swallows the rest of the document', async () => {
    for (const tail of ['<plaintext>', '<textarea>', '<style>', '<!--']) {
      const { win, posted } = await loadFrame(`${HOSTILE}<a id="late" href="https://x.example/">late</a>${tail}`);
      expect(click(win, 'a'), tail).toBe(true);
      expect(posted.some((m) => m.type === 'size'), tail).toBe(true);
    }
  });
});
