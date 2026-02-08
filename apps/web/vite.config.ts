import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
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
  plugins: [react(), themeInjectionPlugin()],
  base: './', // Use relative paths for Electron compatibility
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Point to source for better dev experience and ESM compatibility
      '@omniscribe/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
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
