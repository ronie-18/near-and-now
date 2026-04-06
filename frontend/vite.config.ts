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

// This file is for Vite build configuration only
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  // Dev server proxy: forward /api → local Express only. Do NOT use VITE_API_URL here — that is the
  // browser API base in production (often the same Vercel origin as the SPA) and is unrelated to where
  // the Vite dev proxy should send traffic (localhost:3000). Misusing it caused ECONNREFUSED / wrong host.
  const apiProxyTarget = resolveApiProxyTarget(env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000');
  const proxySecure = apiProxyTarget.startsWith('https://');

  return {
  plugins: [react()],
  // Always use absolute path for consistent routing in production
  base: '/',
  envDir: projectRoot, // Load .env from project root
  server: {
    proxy: {
      '/api': {
        // Local backend: set VITE_API_PROXY_TARGET=http://localhost:3000 in .env (same folder as vite envDir).
        target: apiProxyTarget,
        changeOrigin: true,
        // `secure: true` with an http:// target can cause flaky proxy errors (e.g. ECONNRESET) on some setups.
        secure: proxySecure
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor libraries
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // Split UI libraries
          ui: ['lucide-react'],
          // Split Supabase
          supabase: ['@supabase/supabase-js'],
          // Split security utilities
          security: ['dompurify', 'zod', 'crypto-js'],
          // Split admin components
          admin: [
            './src/pages/admin/AdminDashboardPage.tsx',
            './src/pages/admin/ProductsPage.tsx',
            './src/pages/admin/OrdersPage.tsx',
            './src/pages/admin/CustomersPage.tsx'
          ]
        }
      }
    },
    chunkSizeWarningLimit: 1000 // Increase warning limit to 1MB
  }
  };
});