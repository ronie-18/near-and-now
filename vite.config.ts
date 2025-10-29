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
        manualChunks: undefined
      }
    }
  }
});