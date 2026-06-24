import { defineConfig } from 'vite';

// Static SPA. Builds to dist/ for any static host (Vercel/Netlify/GH Pages).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false, // don't ship readable source maps to the public deploy
  },
  server: {
    port: 5173,
    open: false,
  },
});
