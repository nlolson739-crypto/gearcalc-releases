import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { changelog } from './scripts/changelog';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// When the engine's built-in data last changed upstream (the newest commit touching cdn/json). The app compares it
// with the date of the data the launcher downloaded and uses whichever is newer.
function builtInDataDate(): string | null {
  try {
    const out = execFileSync('git', ['-C', here('./vendor/osrs-dps-calc'), 'log', '-1', '--format=%cI', '--', 'cdn/json'], { encoding: 'utf8' }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function engineDate(): string | null {
  try {
    return execFileSync('git', ['-C', here('./vendor/osrs-dps-calc'), 'log', '-1', '--format=%cI'], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

// The engine imports its data as '../../cdn/json/<file>.json'. Inside the engine those imports are pointed at
// src/data/<file>.ts, which hands over either the built-in copy or the newer one the launcher downloaded.
const vendorSrc = here('./vendor/osrs-dps-calc/src/');
function wikiDataFiles(): Plugin {
  return {
    name: 'gearcalc-wiki-data',
    enforce: 'pre',
    resolveId(source, importer) {
      const m = /cdn\/json\/(monsters|equipment|spells)\.json$/.exec(source);
      if (!m || !importer || !resolve(importer).startsWith(resolve(vendorSrc))) return null;
      return here(`./src/data/${m[1]}.ts`);
    },
  };
}

// In the browser preview, serve the launcher's downloaded data (if this PC has any) the way the desktop app does.
function devWikiData(): Plugin {
  const dir = join(process.env.APPDATA ?? '', 'GearCalc', 'wikidata');
  return {
    name: 'gearcalc-dev-wiki-data',
    configureServer(server) {
      server.middlewares.use('/wikidata/', (req, res, next) => {
        const file = join(dir, decodeURIComponent((req.url ?? '').split('?')[0]));
        if (!file.startsWith(dir + sep) || !file.endsWith('.json') || !existsSync(file)) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(readFileSync(file));
      });
    },
  };
}

// The wiki DPS engine is vendored under vendor/osrs-dps-calc and imports itself as '@/...'.
// It also imports a few Next.js / network modules that the calculations never use; those
// are pointed at small local shims.
export default defineConfig({
  // Relative paths so the built app also works when the desktop launcher serves it.
  base: './',
  plugins: [wikiDataFiles(), devWikiData(), react()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: here('./vendor/osrs-dps-calc/src/') },
      { find: /^next\/image$/, replacement: here('./src/shims/next-image.ts') },
      { find: /^axios$/, replacement: here('./src/shims/axios.ts') },
      { find: /^~\//, replacement: here('./src/') },
    ],
  },
  define: {
    __BUILTIN_DATA_DATE__: JSON.stringify(builtInDataDate()),
    __ENGINE_DATE__: JSON.stringify(engineDate()),
    __CHANGELOG__: JSON.stringify(changelog()),
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
