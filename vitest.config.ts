import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(root, 'src/core'),
      '@shared': resolve(root, 'src/shared'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/db/**/*.test.ts'],
    environment: 'node',
    // Czech formatting tests depend on the local time zone only for dates built
    // from components, but pin it anyway so results match on every machine.
    env: { TZ: 'Europe/Prague' },
  },
});
