import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    globals: false,
    passWithNoTests: true,
    server: {deps: {external: ['ink', 'ink-testing-library', 'react']}},
  },
  esbuild: {
    jsx: 'automatic',
  },
});
