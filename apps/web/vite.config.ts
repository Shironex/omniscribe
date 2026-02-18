import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { DARK_THEMES } from '../../packages/shared/src/types/settings';

/**
 * Injects the DARK_THEMES array from the shared package into index.html
 * so the inline theme-detection script stays in sync with the source of truth.
 */
function themeInjectionPlugin(): Plugin {
  return {
    name: 'omniscribe-theme-injection',
    transformIndexHtml(html) {
      return html.replace('__DARK_THEMES__', JSON.stringify(DARK_THEMES));
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), themeInjectionPlugin()],
  base: './', // Use relative paths for Electron compatibility
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Point to source for better dev experience and ESM compatibility
      '@omniscribe/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      // Plugin SDK: lets plugin frontend code import UI components and helpers
      '@omniscribe/ui': resolve(__dirname, './src/lib/plugin-sdk.ts'),
      // Plugin API types: lets plugin frontend code import type contracts
      '@omniscribe/plugin-api': resolve(__dirname, '../../packages/plugin-api/src/index.ts'),
      // Claude plugin frontend: lets usePluginInitialization dynamically import Claude's UI
      '@omniscribe/provider-claude/frontend': resolve(
        __dirname,
        '../../packages/plugins/provider-claude/src/frontend/index.ts'
      ),
    },
  },
  server: {
    port: 15174,
    strictPort: true,
    fs: {
      allow: ['../..'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          xterm: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links'],
        },
      },
    },
  },
});
