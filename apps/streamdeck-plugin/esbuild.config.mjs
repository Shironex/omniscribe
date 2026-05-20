import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync('com.shironex.omniscribe.sdPlugin/bin', { recursive: true, force: true });

await build({
  entryPoints: ['src/plugin.ts'],
  // .cjs extension forces CommonJS parsing regardless of any package.json
  // "type":"module" above us in the directory tree.
  outfile: 'com.shironex.omniscribe.sdPlugin/bin/plugin.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: 'inline',
  logLevel: 'info',
});
