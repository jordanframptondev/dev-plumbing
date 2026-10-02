import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildKitCss } from '../src/kit';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

/** A clone inside a temp folder, so a test can put files beside it, outside the clone. */
async function setup(files: Record<string, string>): Promise<{ root: string; clone: string }> {
  const root = await fs.realpath(tempDir('dp-kit-'));
  const clone = path.join(root, 'clone');
  await fs.mkdir(clone);
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(clone, rel)), { recursive: true });
    await fs.writeFile(path.join(clone, rel), text);
  }
  return { root, clone };
}

describe('building a design kit for mockups', () => {
  it("inlines relative imports and drops Tailwind's own", async () => {
    const { clone } = await setup({
      'apps/web/app/globals.css':
        '/* Acme kit */\n@import "tailwindcss";\n@import "./theme.css";\n/* @import "old.css"; */\n@layer components {\n  .card { @apply rounded-card p-4; }\n}\n',
      'apps/web/app/theme.css': '@theme {\n  --color-brand: #0f766e;\n}\n',
    });
    const r = await buildKitCss({ clone, files: ['apps/web/app/globals.css', 'apps/web/app/theme.css'] });
    expect(r.warnings).toEqual([]);
    expect(r.css).not.toContain('@import');
    expect(r.css).not.toContain('Acme kit');
    expect(r.css).toContain('/* apps/web/app/globals.css */');
    expect(r.css).toContain('/* apps/web/app/theme.css */\n@theme {\n  --color-brand: #0f766e;\n}');
    expect(r.css.indexOf('--color-brand')).toBeLessThan(r.css.indexOf('.card { @apply rounded-card p-4; }'));
    // theme.css is listed too, but it was already inlined.
    expect(r.css.split('--color-brand').length).toBe(2);
  });

  it('drops every form of the Tailwind import', async () => {
    const { clone } = await setup({
      'kit.css': `@import 'tailwindcss' source("../src");\n@import "tailwindcss/theme.css" layer(theme);\n@import url("tailwindcss/utilities.css") layer(utilities);\n.k { color: red; }\n`,
    });
    const r = await buildKitCss({ clone, files: ['kit.css'] });
    expect(r).toEqual({ css: '/* kit.css */\n.k { color: red; }\n', warnings: [] });
  });

  it('skips package and URL imports, with a warning', async () => {
    const { clone } = await setup({ 'kit.css': '@import "@acme/ui/theme.css";\n@import url("https://fonts.example.com/inter.css");\n.a { color: red; }\n' });
    const r = await buildKitCss({ clone, files: ['kit.css'] });
    expect(r.warnings).toEqual(['Kit: skipped @import "@acme/ui/theme.css".', 'Kit: skipped @import "https://fonts.example.com/inter.css".']);
    expect(r.css).toBe('/* kit.css */\n.a { color: red; }\n');
  });

  it('removes @plugin, @source, @config and @reference, with one warning each', async () => {
    const { clone } = await setup({
      'kit.css':
        '@plugin "@tailwindcss/typography";\n@plugin "daisyui" {\n  themes: light;\n}\n@source "../components";\n@config "./tailwind.config.js";\n@reference "./base.css";\n.b { margin: 0; }\n',
    });
    const r = await buildKitCss({ clone, files: ['kit.css'] });
    expect(r.warnings).toEqual([
      "Kit: @plugin lines skipped (they don't work in mockups).",
      "Kit: @source lines skipped (they don't work in mockups).",
      "Kit: @config lines skipped (they don't work in mockups).",
      "Kit: @reference lines skipped (they don't work in mockups).",
    ]);
    expect(r.css).toBe('/* kit.css */\n.b { margin: 0; }\n');
  });

  it('reads only .css files that exist', async () => {
    const { clone } = await setup({ 'tailwind.config.js': 'module.exports = {};\n', 'apps/web/app/globals.css': '.ok { color: black; }\n' });
    const r = await buildKitCss({ clone, files: ['tailwind.config.js', 'apps/web/app/missing.css', 'apps/web/app/globals.css'] });
    expect(r.warnings).toEqual(["Kit: tailwind.config.js isn't a .css file.", "Kit: apps/web/app/missing.css isn't in the clone."]);
    expect(r.css).toBe('/* apps/web/app/globals.css */\n.ok { color: black; }\n');
  });

  it('stops at 1 MB in total', async () => {
    const big = '.x { color: red; }\n'.repeat(40_000); // 760,000 bytes
    const { clone } = await setup({ 'a.css': big, 'b.css': big, 'c.css': '.c { color: blue; }\n' });
    const r = await buildKitCss({ clone, files: ['a.css', 'b.css', 'c.css'] });
    expect(r.warnings).toEqual(['Kit: skipped b.css, because kit files are limited to 1 MB in total.']);
    expect(r.css).toContain('/* a.css */');
    expect(r.css).not.toContain('/* b.css */');
    expect(r.css).toContain('/* c.css */\n.c { color: blue; }');
  });

  it('inlines imports at most 5 deep', async () => {
    const files: Record<string, string> = { 'k7.css': '.k7 { order: 7; }\n' };
    for (let i = 0; i < 7; i++) files[`k${i}.css`] = `@import "./k${i + 1}.css";\n.k${i} { order: ${i}; }\n`;
    const { clone } = await setup(files);
    const r = await buildKitCss({ clone, files: ['k0.css'] });
    expect(r.css).toContain('.k5 { order: 5; }');
    expect(r.css).not.toContain('.k6');
    expect(r.warnings).toEqual(['Kit: skipped @import "./k6.css", because imports nest more than 5 deep.']);
  });

  it('kit files outside the clone are never read', async () => {
    const { root, clone } = await setup({ 'apps/web/globals.css': '@import "../../../secret.css";\n.ok { color: black; }\n' });
    const secret = path.join(root, 'secret.css');
    await fs.writeFile(secret, '.secret { content: "SENTINEL"; }\n');
    await fs.symlink(secret, path.join(clone, 'apps', 'web', 'linked.css'));
    const r = await buildKitCss({ clone, files: ['apps/web/globals.css', '../secret.css', secret, 'apps/web/linked.css'] });
    expect(r.css).not.toContain('SENTINEL');
    expect(r.css).toBe('/* apps/web/globals.css */\n.ok { color: black; }\n');
    expect(r.warnings).toEqual([
      "Kit: ../../../secret.css isn't in the clone.",
      "Kit: ../secret.css isn't in the clone.",
      `Kit: ${secret} isn't in the clone.`,
      "Kit: apps/web/linked.css isn't in the clone.",
    ]);
  });

  it('says so when the clone is gone', async () => {
    const r = await buildKitCss({ clone: path.join(tempDir('dp-kit-'), 'gone'), files: ['apps/web/app/globals.css'] });
    expect(r).toEqual({ css: '', warnings: ["Kit: the plan's clone isn't on this Mac any more."] });
  });
});
