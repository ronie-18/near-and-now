/// <reference types="vitest" />
import { mergeConfig } from 'vite';
import { defineConfig } from 'vitest/config';
import viteConfigFn from './vite.config';

// vite.config.ts exports a function (it needs `command`/`mode`); resolve it before merging.
const viteConfig = viteConfigFn({ command: 'serve', mode: 'test', isSsrBuild: false, isPreview: false });

// Workspace-local test config so `npm test --workspace=frontend` gets globals + jsdom
// (previously only the repo-root vitest.config.ts had them, so `describe` was undefined).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      env: {
        VITE_SUPABASE_URL: 'https://test.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'test-anon-key'
      },
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html']
      }
    }
  })
);
