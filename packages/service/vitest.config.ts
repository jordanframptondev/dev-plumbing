import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'service', environment: 'node', include: ['test/**/*.test.ts'], exclude: ['**/*.integration.test.ts', '**/node_modules/**'] },
});
