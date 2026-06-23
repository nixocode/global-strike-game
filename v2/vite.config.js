import { defineConfig } from 'vite';

// Static SPA. Builds to dist/ for any static host (Vercel/Netlify/GH Pages).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: false,
  },
});
