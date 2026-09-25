// ─────────────────────────────────────────────────────────────
// DEOLS Frontend Build Script
// Copies and minifies static assets to dist/
// ─────────────────────────────────────────────────────────────

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'src');
const DIST = join(__dirname, 'dist');

console.log('Building DEOLS frontend…');

// Create dist directory
mkdirSync(DIST, { recursive: true });

// Copy index.html and fix paths for dist with cache-busting version
const buildTimestamp = Date.now();
let html = readFileSync(join(__dirname, 'index.html'), 'utf-8');
html = html.replace(/(?:src\/)?styles\.css(?:\?v=\d+)?/g, `styles.css?v=${buildTimestamp}`);
html = html.replace(/(?:src\/)?app\.js(?:\?v=\d+)?/g, `app.js?v=${buildTimestamp}`);
writeFileSync(join(DIST, 'index.html'), html);

// Copy CSS
cpSync(join(SRC, 'styles.css'), join(DIST, 'styles.css'));

// Copy JS
cpSync(join(SRC, 'app.js'), join(DIST, 'app.js'));

console.log('✓ Build complete → frontend/dist/');
