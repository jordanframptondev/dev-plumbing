import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'cli', environment: 'node', include: ['test/**/*.test.ts'], exclude: ['**/*.integration.test.ts', '**/node_modules/**'] },
});
