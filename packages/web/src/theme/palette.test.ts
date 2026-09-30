import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = path.resolve(import.meta.dirname, '..');
function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(tsx?|css)$/.test(e.name) && !e.name.endsWith('.test.ts') ? [p] : [];
  });
}
const DEFAULT_PALETTE = /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|zinc|neutral|stone|slate)-\d{2,3}\b/;

describe('Ink wash rules', () => {
  it('uses no default Tailwind colours, gradients or paper colour', () => {
    const offenders = files(src).filter((f) => {
      const text = fs.readFileSync(f, 'utf8');
      return DEFAULT_PALETTE.test(text) || /bg-(?:linear|radial|conic|gradient)-/.test(text) || /#FFFFE3/i.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
