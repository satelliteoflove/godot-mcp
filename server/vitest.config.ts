import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**'],
      // Floor just under the measured baseline (81.5% stmts / 73.7% branch /
      // 85.2% funcs at introduction) — regressions fail CI, honest additions
      // of hard-to-test code have a little room.
      thresholds: {
        statements: 78,
        branches: 70,
        functions: 82,
        lines: 78,
      },
    },
  },
});
