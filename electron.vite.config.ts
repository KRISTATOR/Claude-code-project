import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * Build-time constants. Only the Supabase URL and the anon (publishable) key may
 * ever be baked in; see CLAUDE.md, hard rule 2.
 */
const root = dirname(fileURLToPath(import.meta.url));

const buildDefines = {
  __ZAZEMI_TEST_BUILD__: JSON.stringify(process.env['ZAZEMI_TEST_BUILD'] === '1'),
  __ZAZEMI_SUPABASE_URL__: JSON.stringify(process.env['ZAZEMI_SUPABASE_URL'] ?? ''),
  __ZAZEMI_SUPABASE_ANON_KEY__: JSON.stringify(process.env['ZAZEMI_SUPABASE_ANON_KEY'] ?? ''),
};

const alias = {
  '@core': resolve(root, 'src/core'),
  '@shared': resolve(root, 'src/shared'),
};

export default defineConfig({
  main: {
    resolve: { alias },
    define: buildDefines,
    build: {
      externalizeDeps: true,
      rollupOptions: { input: { index: resolve(root, 'src/main/index.ts') } },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      // Sandboxed preload scripts must be a single CommonJS file.
      externalizeDeps: false,
      rollupOptions: {
        input: { index: resolve(root, 'src/preload/index.ts') },
        external: ['electron'],
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(root, 'src/renderer'),
    resolve: { alias },
    plugins: [react()],
    build: {
      rollupOptions: { input: { index: resolve(root, 'src/renderer/index.html') } },
    },
  },
});
