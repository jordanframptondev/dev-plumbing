import { buildKitCss, type LoadedConfig, type MockupKitInfo, type ProjectRef } from '@dev-plumbing/core';
import { cloneOf } from './checker';
import type { AppContext } from './context';

/** The mockup document's policy: our two nonce'd scripts, inline styles, data: images and fonts, and nothing else. */
export function mockupCsp(nonce: string): string {
  return `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`;
}

/**
 * The frame's side of the mockup messages. The app's side is MockupFrame in the web app.
 * - `size`: the content's height, on load and whenever it changes.
 * - Pin mode: an outline follows the pointer, and a click posts `picked` with a selector and the element's text.
 * - Pins: numbered markers on the pinned elements. Clicking one posts `open-pin`. Every `pins` message is answered
 *   with `missing-pins`, the pins whose selector matches nothing in this version of the markup.
 * Marker colours are the Ink wash tones as fixed hex values, because the frame doesn't have the app's CSS variables.
 */
export const PIN_SCRIPT = String.raw`(() => {
  'use strict';
  // This script runs in <head>, before any markup has parsed, so the markup can't have changed anything it uses yet.
  // Everything it needs is captured here. After the markup has parsed, no document method or element property is read
  // by name, because markup like <img name="querySelector"> or <form><input name="closest"> can shadow them.
  const doc = document;
  const win = window;
  const qs = doc.querySelector.bind(doc);
  const create = doc.createElement.bind(doc);
  const listen = doc.addEventListener.bind(doc);
  const winListen = win.addEventListener.bind(win);
  const raf = win.requestAnimationFrame.bind(win);
  const root = doc.documentElement;
  const parentWin = win.parent;
  const E = Element;
  const N = Node;
  const ResizeObs = win.ResizeObserver;
  const MutationObs = win.MutationObserver;
  const getter = (proto, name) => Object.getOwnPropertyDescriptor(proto, name).get;
  const parentOf = getter(N.prototype, 'parentElement');
  const prevOf = getter(E.prototype, 'previousElementSibling');
  const nameOf = getter(E.prototype, 'localName');
  const hasAttr = E.prototype.hasAttribute;
  const hasAttrNS = E.prototype.hasAttributeNS;
  const rectOf = E.prototype.getBoundingClientRect;
  const XLINK = 'http://www.w3.org/1999/xlink';
  const TONES = { seal: '#a5503b', slate: '#6d8196', moss: '#5f8a5b', mist: '#cbcbcb' };
  const post = (message) => parentWin.postMessage(Object.assign({ source: 'dp-mockup' }, message), '*');
  const elementOf = (target) => (target instanceof E ? target : target instanceof N ? parentOf.call(target) : null);

  // A mockup is a picture: nothing in it navigates the frame. No CSP directive stops a frame navigating itself, so this
  // is the guard. It's registered now, in the capture phase, so it sees every click and submit first.
  const linkLike = (el) => {
    for (let node = el; node; node = parentOf.call(node)) {
      const name = nameOf.call(node);
      if (name === 'a' || name === 'area' || hasAttr.call(node, 'href') || hasAttrNS.call(node, XLINK, 'href')) return true;
    }
    return false;
  };
  listen('click', (e) => {
    const el = elementOf(e.target);
    if (el && linkLike(el)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  listen('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, true);

  let ready = false;
  const pending = [];
  let handle = () => {};
  // Messages that arrive before the page has parsed wait for it.
  winListen('message', (e) => {
    const data = e.data;
    if (e.source !== parentWin || !data || data.source !== 'dp-app') return;
    if (ready) handle(data);
    else pending.push(data);
  });

  const setup = () => {
    const body = qs('body');
    const head = qs('head');

    // Our own elements sit outside <body>, so they never change the selectors of the mockup's elements.
    const layer = create('div');
    layer.setAttribute('data-dp-layer', '');
    layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;';
    root.appendChild(layer);
    const outline = create('div');
    outline.style.cssText = 'position:absolute;display:none;pointer-events:none;box-sizing:border-box;border:2px solid #6d8196;border-radius:4px;';
    layer.appendChild(outline);

    let pinMode = false;
    let markers = [];

    const ours = (node) => node instanceof N && layer.contains(node);
    const pickable = (target) => {
      const el = elementOf(target);
      if (!el || ours(el) || el === body || !body.contains(el)) return null;
      return el;
    };

    // body > main:nth-of-type(1) > div:nth-of-type(2): stable while the markup keeps its shape.
    const selectorFor = (el) => {
      const parts = [];
      for (let node = el; node && node !== body; node = parentOf.call(node)) {
        let k = 1;
        for (let s = prevOf.call(node); s; s = prevOf.call(s)) if (nameOf.call(s) === nameOf.call(node)) k++;
        parts.unshift(nameOf.call(node) + ':nth-of-type(' + k + ')');
      }
      return ['body'].concat(parts).join(' > ');
    };
    const textOf = (el) => {
      let text = '';
      try {
        text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      } catch (err) {
        text = '';
      }
      return text ? text.slice(0, 60) : nameOf.call(el);
    };

    const showOutline = (el) => {
      if (!el) {
        outline.style.display = 'none';
        return;
      }
      const r = rectOf.call(el);
      outline.style.left = r.left + win.scrollX - 2 + 'px';
      outline.style.top = r.top + win.scrollY - 2 + 'px';
      outline.style.width = r.width + 4 + 'px';
      outline.style.height = r.height + 4 + 'px';
      outline.style.display = 'block';
    };
    const setPinMode = (on) => {
      pinMode = on;
      root.style.cursor = on ? 'crosshair' : '';
      if (!on) showOutline(null);
    };

    listen('mouseover', (e) => {
      if (pinMode) showOutline(pickable(e.target));
    }, true);
    root.addEventListener('mouseleave', () => showOutline(null));
    // The guard above already stopped links. In pin mode a click picks the element, links included.
    listen('click', (e) => {
      if (!pinMode || ours(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const el = pickable(e.target);
      if (el) post({ type: 'picked', selector: selectorFor(el), text: textOf(el) });
    }, true);

    const placeMarkers = () => {
      const maxLeft = root.clientWidth - 20;
      for (const m of markers) {
        const r = rectOf.call(m.el);
        m.node.style.left = Math.max(0, Math.min(maxLeft, r.right + win.scrollX - 10)) + 'px';
        m.node.style.top = Math.max(0, r.top + win.scrollY - 10) + 'px';
      }
    };
    let queued = false;
    const schedulePlace = () => {
      if (queued) return;
      queued = true;
      raf(() => {
        queued = false;
        placeMarkers();
      });
    };

    const setPins = (pins) => {
      for (const m of markers) m.node.remove();
      markers = [];
      const missing = [];
      for (const pin of pins) {
        if (!pin || typeof pin.id !== 'string') continue;
        let el = null;
        try {
          el = typeof pin.selector === 'string' ? qs(pin.selector) : null;
        } catch (err) {
          el = null;
        }
        if (!el || !body.contains(el)) {
          missing.push(pin.id);
          continue;
        }
        const tone = Object.prototype.hasOwnProperty.call(TONES, pin.tone) ? TONES[pin.tone] : TONES.slate;
        const node = create('button');
        node.type = 'button';
        node.textContent = String(pin.n);
        node.title = 'Pin ' + pin.n;
        node.setAttribute('data-dp-pin', pin.id);
        node.style.cssText =
          'position:absolute;width:20px;height:20px;margin:0;padding:0;box-sizing:border-box;border:1.5px solid #fff;border-radius:50%;' +
          'background:' + tone + ';color:#fff;font:600 11px/17px -apple-system,system-ui,sans-serif;text-align:center;' +
          'cursor:pointer;pointer-events:auto;box-shadow:0 1px 2px rgba(0,0,0,.25);';
        node.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          post({ type: 'open-pin', id: pin.id });
        });
        layer.appendChild(node);
        markers.push({ el, node });
      }
      placeMarkers();
      post({ type: 'missing-pins', ids: missing });
    };

    let lastHeight = -1;
    const sendSize = () => {
      const height = Math.ceil(Math.max(body.scrollHeight, rectOf.call(body).bottom + win.scrollY));
      if (height === lastHeight) return;
      lastHeight = height;
      post({ type: 'size', height: height });
    };
    const changed = () => {
      sendSize();
      schedulePlace();
    };
    new ResizeObs(changed).observe(body);
    // The Tailwind compiler adds its styles a moment after the page loads, which can move pinned elements.
    new MutationObs(schedulePlace).observe(head, { childList: true, subtree: true, characterData: true });
    winListen('load', changed);
    winListen('resize', changed);

    handle = (data) => {
      if (data.type === 'pin-mode') setPinMode(Boolean(data.on));
      else if (data.type === 'pins' && Array.isArray(data.pins)) setPins(data.pins);
    };
    ready = true;
    sendSize();
    for (const data of pending.splice(0)) handle(data);
  };
  listen('DOMContentLoaded', setup);
})();`;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A whole mockup document: the Tailwind compiler, the pin script, the kit (compiled in the frame) and the markup.
 * The style starts with our own `@import "tailwindcss"`. buildKitCss removed the kit's, and the browser compiler only
 * adds one itself when the CSS has no @import at all.
 */
export function mockupDocument(o: { body: string; kitCss: string; nonce: string; title: string }): string {
  // Kit CSS is the repo's text, so it must not be able to close the style tag.
  const kit = o.kitCss.replace(/<\/style/gi, '<\\/style');
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(o.title)}</title>`,
    `<script nonce="${o.nonce}" src="/kit/tailwind.js"></script>`,
    // Both scripts come before anything from the markup, so the markup can't swallow, clobber or steal them.
    `<script nonce="${o.nonce}">${PIN_SCRIPT}</script>`,
    `<style type="text/tailwindcss">@import "tailwindcss";\n${kit}</style>`,
    '</head><body>',
    o.body,
    '</body></html>',
  ].join('\n');
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * One side's markup, or null when there's none. It's read leniently: markup that breaks a write rule (edited by hand,
 * or written by an older version) is still served, because the sandbox and the CSP, not the write check, are what keep
 * it harmless. Meta tags are escaped into text, in one pass that can't build a new tag: a refresh tag would navigate the frame away, and no CSP directive stops that.
 */
export function markupOf(data: unknown, side: 'after' | 'before'): string | null {
  const value = isObject(data) ? data[side] : undefined;
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.replace(/<(?=meta(?:[\s/>]|$))/gi, '&lt;');
}

/** The app names a UI item's data points at: its kit first, then its location's app. */
function appNames(data: unknown): string[] {
  if (!isObject(data)) return [];
  const location = isObject(data.location) ? data.location : {};
  return [data.kit, location.app].filter((n): n is string => typeof n === 'string' && n.length > 0);
}

/**
 * The design kit for a UI item's mockup (saved or proposed), built from the plan's clone.
 * A kit problem never throws: it becomes a warning.
 */
export async function kitFor(o: { ctx: AppContext; cfg: LoadedConfig; ref: ProjectRef; data: unknown }): Promise<MockupKitInfo & { css: string }> {
  const names = appNames(o.data);
  const apps = o.cfg.repos.find((p) => p.name === o.ref.repo)?.apps ?? [];
  const app = names.map((n) => apps.find((a) => a.name === n)).find((a) => a !== undefined);
  if (!app) {
    return { app: null, files: [], css: '', warnings: [names.length ? `Kit: the repo profile has no app called ${names[0]}.` : "Kit: this item doesn't name an app."] };
  }
  if (!app.kitFiles.length) return { app: app.name, files: [], css: '', warnings: [`Kit: the repo profile lists no kit files for ${app.name}.`] };
  const clone = await cloneOf(o.ctx, o.ref);
  if (!clone) return { app: app.name, files: app.kitFiles, css: '', warnings: ["Kit: the plan's clone isn't on this Mac any more."] };
  const kit = await buildKitCss({ clone, files: app.kitFiles });
  return { app: app.name, files: app.kitFiles, css: kit.css, warnings: kit.warnings };
}
