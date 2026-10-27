import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The wiki DPS engine is vendored under vendor/osrs-dps-calc and imports itself as '@/...'.
// It also imports a few Next.js / network modules that the calculations never use; those
// are pointed at small local shims.
export default defineConfig({
  // Relative paths so the built app also works when the desktop launcher serves it.
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: here('./vendor/osrs-dps-calc/src/') },
      { find: /^next\/image$/, replacement: here('./src/shims/next-image.ts') },
      { find: /^axios$/, replacement: here('./src/shims/axios.ts') },
      { find: /^~\//, replacement: here('./src/') },
    ],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
  },
  server: {
    port: 5178,
    strictPort: true,
    // The desktop build folders contain a copy of the app; watching them confuses hot reload.
    // Polling, because native file events on this drive sometimes miss edits (the CSS especially).
    watch: { usePolling: true, interval: 300, ignored: ['**/dist/**', '**/dist-app/**', '**/release/**', '**/build/**', '**/app/.venv/**', '**/vendor/**/node_modules/**', '**/.git/**'] },
  },
});
