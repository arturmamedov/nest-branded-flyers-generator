import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  appType: 'mpa',
  // Art, logos and uploads are served by Express under /assets and /uploads.
  publicDir: false,
  build: {
    outDir: 'dist',
    // Not "assets": that path belongs to the flyer art served by Express.
    assetsDir: 'static',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        render: resolve(import.meta.dirname, 'render.html'),
      },
    },
  },
});
