import { defineConfig } from 'tsup';

// One self-contained file inside the plugin, so Claude Code can run it straight from the repo.
export default defineConfig({
  entry: { mcp: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: '../../plugin/dist',
  clean: true,
  noExternal: [/.*/],
  outExtension: () => ({ js: '.mjs' }),
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
