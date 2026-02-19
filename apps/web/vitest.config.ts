import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@omniscribe/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@omniscribe/plugin-api': path.resolve(__dirname, '../../packages/plugin-api/src/index.ts'),
      '@omniscribe/provider-claude/frontend': path.resolve(
        __dirname,
        '../../packages/plugins/provider-claude/src/frontend/index.ts'
      ),
      '@omniscribe/provider-codex/frontend': path.resolve(
        __dirname,
        '../../packages/plugins/provider-codex/src/frontend/index.ts'
      ),
      '@omniscribe/ui': path.resolve(__dirname, './src/lib/plugin-sdk.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    clearMocks: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts'],
    },
  },
});
