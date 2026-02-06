import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

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
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  // Add banner for ESM compatibility and shebang
  banner: {
    js: '#!/usr/bin/env node',
  },
});

console.log('MCP server bundled: dist/index.js');
