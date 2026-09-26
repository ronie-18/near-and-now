import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/** Avoid `localhost` in proxy target — Node DNS can throw ENOTFOUND for localhost in some setups. */
function normalizeLocalProxyTarget(raw: string): string {
  const trimmed = raw.replace(/\/$/, '');
  try {
    const u = new URL(trimmed);
    if (u.hostname === 'localhost' || u.hostname === '::1') {
      u.hostname = '127.0.0.1';
      return u.toString().replace(/\/$/, '');
    }
  } catch {
    /* keep as-is */
  }
  return trimmed;
}

/** Vite default dev port — if VITE_API_URL mistakenly points here, proxy would loop to the frontend. */
const VITE_DEFAULT_PORT = 5173;

function resolveApiProxyTarget(raw: string): string {
  const normalized = normalizeLocalProxyTarget(raw);
  try {
    const u = new URL(normalized);
    const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
    const loopback = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
    if (loopback && port === VITE_DEFAULT_PORT && u.protocol === 'http:') {
      console.warn(
        `[vite] VITE_API_URL / VITE_API_PROXY_TARGET points at port ${VITE_DEFAULT_PORT} (Vite dev server). ` +
          `The API proxy must target the backend (default http://127.0.0.1:3000). Using :3000.`
      );
      u.port = '3000';
      return u.toString().replace(/\/$/, '');
    }
  } catch {
    /* keep normalized */
  }
  return normalized;
}

/** Backend prefixes the SPA calls same-origin in dev (vercel.json / AWS routing forward the same ones). */
const API_PREFIXES = ['/api', '/delivery-partner', '/shopkeeper', '/store-owner', '/health'];

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, projectRoot, '');
  // Dev server proxy: forward API prefixes → local Express only. Do NOT use VITE_API_URL here — that is the
  // browser API base in production and is unrelated to where the Vite dev proxy should send traffic.
  const apiProxyTarget = resolveApiProxyTarget(env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000');
  const proxySecure = apiProxyTarget.startsWith('https://');
  const isBuild = command === 'build';

  return {
    plugins: [react()],
    // Always use absolute path for consistent routing in production
    base: '/',
    envDir: projectRoot, // Load .env from project root
    // Strip debug logging from production bundles. console.warn / console.error are kept
    // so real failures still reach the browser console (and error reporting).
    esbuild: isBuild ? { pure: ['console.log', 'console.debug', 'console.info', 'console.trace'] } : undefined,
    server: {
      proxy: Object.fromEntries(
        API_PREFIXES.map((prefix) => [
          prefix,
          {
            target: apiProxyTarget,
            changeOrigin: true,
            // `secure: true` with an http:// target can cause flaky proxy errors (ECONNRESET) on some setups.
            secure: proxySecure
          }
        ])
      )
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      target: 'es2020',
      rollupOptions: {
        output: {
          // Pages are code-split per route in App.tsx / AdminRoutes.tsx; here we only
          // separate the big, rarely-changing vendor libraries so they cache across deploys.
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            icons: ['lucide-react'],
            supabase: ['@supabase/supabase-js'],
            maps: ['@react-google-maps/api'],
            security: ['dompurify', 'zod', 'crypto-js']
          }
        }
      },
      chunkSizeWarningLimit: 600
    }
  };
});
