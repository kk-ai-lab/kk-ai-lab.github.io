import { defineConfig } from 'vite';

// User site on GitHub Pages (kk-ai-lab.github.io) → served from the domain root.
// Override with BASE_PATH=/something/ to publish as a project page instead.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
});
