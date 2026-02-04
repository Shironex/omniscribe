import * as esbuild from 'esbuild';

// Bundle the MCP server into a single file for distribution
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'dist/index.js',
  sourcemap: false,
  minify: true,
  // Add banner for ESM compatibility and shebang
  banner: {
    js: '#!/usr/bin/env node',
  },
});

console.log('MCP server bundled: dist/index.js');
