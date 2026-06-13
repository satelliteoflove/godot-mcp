import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**'],
      // Floor just under the measured baseline (77.4% stmts / 71.4% branch /
      // 82.2% funcs at introduction; cli.ts and index.ts are covered by the
      // protocol smoke, not vitest) — regressions fail CI, honest additions
      // of hard-to-test code have a little room.
      thresholds: {
        statements: 75,
        branches: 68,
        functions: 79,
        lines: 75,
      },
    },
  },
});
