/**
 * Vite build for the React renderer plus Electron main/preload via vite-plugin-electron.
 * Also copies the SQLite schema SQL into dist-electron for runtime DB init.
 */
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import fs from 'fs';
import path from 'path';

/** Copy SQLite schema next to compiled Electron main process. */
function copySchemaPlugin(): Plugin {
  const copy = () => {
    const src = path.resolve(__dirname, 'electron/database/schema.sql');
    const destDir = path.resolve(__dirname, 'dist-electron/database');
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, path.join(destDir, 'schema.sql'));
  };
  return {
    name: 'copy-sqlite-schema',
    buildStart() {
      copy();
    },
    closeBundle() {
      copy();
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    copySchemaPlugin(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              // Native module must stay external (loaded by Electron at runtime).
              external: ['better-sqlite3'],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                entryFileNames: 'preload.js',
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
  },
});
