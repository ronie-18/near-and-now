import { defineConfig, createLogger } from 'vite';
import react from '@vitejs/plugin-react';

const logger = createLogger();
const origWarn = logger.warn.bind(logger);
logger.warn = (msg, options) => {
  // bcryptjs imports Node's crypto but has a pure-JS browser fallback — safe to suppress
  if (msg.includes('Module "crypto"')) return;
  origWarn(msg, options);
};

export default defineConfig({
  plugins: [react()],
  base: '/',
  customLogger: logger,
  envDir: '../',
  server: {
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-ui': ['lucide-react'],
          'vendor-misc': ['bcryptjs', 'crypto-js', 'zod', 'dompurify'],
        },
      },
    },
  },
});
