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
      // Codex plugin frontend: lets usePluginInitialization dynamically import Codex's UI
      '@omniscribe/provider-codex/frontend': resolve(
        __dirname,
        '../../packages/plugins/provider-codex/src/frontend/index.ts'
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
    // 'hidden' emits .map files alongside the bundles but strips the
    // //# sourceMappingURL= comment from the JS. DevTools won't surface
    // them automatically — keeping our minified code minified for
    // anyone poking around the renderer — while crash reporters and
    // sentry-style backends can still upload the maps for symbolicated
    // stacks.
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(react|react-dom)\//.test(id)) return 'vendor';
          if (id.includes('node_modules/@xterm/')) return 'xterm';
          if (id.includes('node_modules/@dnd-kit/')) return 'dndkit';
          // The app imports `motion/react`; `motion` is a thin re-export shim
          // that depends on `framer-motion` (where the actual code lives). Group
          // both into one chunk named for the package we actually declare.
          if (id.includes('node_modules/motion/') || id.includes('node_modules/framer-motion/')) {
            return 'motion';
          }
          if (id.includes('node_modules/@radix-ui/')) return 'radix';
          if (id.includes('node_modules/@floating-ui/')) return 'floating-ui';
          if (
            id.includes('node_modules/socket.io-client/') ||
            id.includes('node_modules/engine.io-client/') ||
            id.includes('node_modules/socket.io-parser/')
          ) {
            return 'socketio';
          }
          if (id.includes('node_modules/sonner/')) return 'sonner';
        },
      },
    },
  },
});
