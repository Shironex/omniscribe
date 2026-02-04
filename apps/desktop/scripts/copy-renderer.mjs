import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const webDistPath = path.resolve(rootDir, '../web/dist');
const rendererPath = path.resolve(rootDir, 'dist/renderer');

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

if (!fs.existsSync(webDistPath)) {
  console.error('Error: Web dist folder not found. Build web app first.');
  process.exit(1);
}

// Create renderer directory
fs.mkdirSync(rendererPath, { recursive: true });

// Copy files
copyRecursive(webDistPath, rendererPath);
console.log('Copied web dist to dist/renderer');
