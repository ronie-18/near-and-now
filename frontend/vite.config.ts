import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// This file is for Vite build configuration only
export default defineConfig({
  plugins: [react()],
  // Vercel: absolute / so deep routes load /assets/* correctly. Non-Vercel: ./ for static hosts (e.g. cPanel).
  base: process.env.VERCEL ? '/' : './',
  envDir: path.resolve(__dirname, '..'), // Load .env from project root
  server: {
    proxy: {
      '/api': {
        target: 'https://near-and-now-backend-production.up.railway.app',
        changeOrigin: true
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
});