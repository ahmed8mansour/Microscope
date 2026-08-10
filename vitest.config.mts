import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './'),
    },
  },
  // Tests always run in a server/Node context. Resolving the `react-server`
  // condition makes the `server-only` marker package no-op here, matching
  // how Next.js's bundler treats it for actual Server Components — without
  // this, any module chain that imports `server-only` throws unconditionally
  // under plain Node/Vitest. Vitest loads test files via Vite's SSR module
  // runner, so this must be set under `ssr.resolve`, not the top-level
  // `resolve` (which governs client-target resolution).
  ssr: {
    resolve: {
      conditions: ['react-server', 'node', 'import', 'default'],
    },
  },
});
