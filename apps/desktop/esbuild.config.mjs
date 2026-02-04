import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const isWatch = process.argv.includes('--watch');

// Common options for both main and preload
const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
  // External modules that shouldn't be bundled
  external: [
    // Electron must be external
    'electron',
    // Native module - must stay external
    'node-pty',
    // NestJS optional dependencies (not used but dynamically required)
    '@nestjs/microservices',
    '@nestjs/microservices/*',
    '@nestjs/websockets/socket-module',
    '@nestjs/platform-fastify',
    'class-validator',
    'class-transformer',
    // These are optional and cause issues if bundled
    '@grpc/grpc-js',
    '@grpc/proto-loader',
    'amqplib',
    'amqp-connection-manager',
    'nats',
    'kafkajs',
    'mqtt',
    'redis',
    'ioredis',
    'cache-manager',
  ],
};

// Build main process (NestJS + Electron main)
const mainConfig = {
  ...commonOptions,
  entryPoints: ['src/main/index.ts'],
  outfile: 'dist/main/index.js',
  format: 'cjs',
  // Handle decorators for NestJS
  tsconfig: 'tsconfig.json',
};

// Build preload script
const preloadConfig = {
  ...commonOptions,
  entryPoints: ['src/main/preload.ts'],
  outfile: 'dist/main/preload.js',
  format: 'cjs',
};

async function copyRendererFiles() {
  const webDistPath = path.resolve('../web/dist');
  const rendererPath = path.resolve('dist/renderer');

  if (!fs.existsSync(webDistPath)) {
    console.warn('Warning: Web dist folder not found. Build web app first.');
    return;
  }

  // Create renderer directory
  fs.mkdirSync(rendererPath, { recursive: true });

  // Copy files recursively
  copyRecursive(webDistPath, rendererPath);
  console.log('Copied web dist to renderer folder');
}

function copyRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function build() {
  try {
    console.log('Building main process...');
    await esbuild.build(mainConfig);
    console.log('Built: dist/main/index.js');

    console.log('Building preload script...');
    await esbuild.build(preloadConfig);
    console.log('Built: dist/main/preload.js');

    // Copy renderer files in production build
    if (process.env.NODE_ENV === 'production') {
      await copyRendererFiles();
    }

    console.log('Build complete!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

async function watch() {
  console.log('Starting watch mode...');

  const mainCtx = await esbuild.context(mainConfig);
  const preloadCtx = await esbuild.context(preloadConfig);

  await mainCtx.watch();
  await preloadCtx.watch();

  console.log('Watching for changes...');
}

if (isWatch) {
  watch();
} else {
  build();
}
