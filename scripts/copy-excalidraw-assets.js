/**
 * Copy Excalidraw prod assets for offline EXCALIDRAW_ASSET_PATH.
 */
import { cpSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod');
const dest = join(root, 'dist', 'whiteboard', 'assets');

if (!existsSync(src)) {
	console.error('Excalidraw prod assets not found. Run: npm install');
	process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('Copied Excalidraw assets to dist/whiteboard/assets/');
