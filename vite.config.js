import { defineConfig } from 'vite';

// Project page on GitHub Pages → served from /neural-universe/
export default defineConfig({
  base: '/neural-universe/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
});
