import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Allow `import './x.ts'` style used to keep paths Deno-compatible.
    // (Vitest/Vite resolves these via esbuild without rewriting.)
    environment: 'node',
    globals: false,
  },
  resolve: {
    // No alias needed — relative imports use explicit `.ts` extensions to
    // stay valid in both Deno (Edge Functions) and Vite/esbuild (tests).
    extensions: ['.ts', '.js', '.mjs'],
  },
});
