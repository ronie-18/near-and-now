import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// This file is for Vite build configuration only
export default defineConfig({
  plugins: [react()],
  base: './', // Use relative paths for cPanel deployment
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