import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// This file is for Vite build configuration only
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  // Local dev: proxy /api → backend (default localhost:3000). Override with VITE_API_PROXY_TARGET.
  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET ||
    env.VITE_API_URL ||
    'http://127.0.0.1:3000';

  return {
  plugins: [react()],
  // Vercel: absolute / so deep routes load /assets/* correctly. Non-Vercel: ./ for static hosts (e.g. cPanel).
  base: process.env.VERCEL ? '/' : './',
  envDir: projectRoot, // Load .env from project root
  server: {
    proxy: {
      '/api': {
        // Local backend: set VITE_API_PROXY_TARGET=http://localhost:3000 in .env (same folder as vite envDir).
        target: apiProxyTarget,
        changeOrigin: true,
        secure: true
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