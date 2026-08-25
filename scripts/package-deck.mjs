/**
 * Package deck for platform upload.
 * Output: dist/{deck-id}-{version}.zip (includes platform-manifest.json + deck-meta.js)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { buildDeckMetaJs, readDeckMeta, buildPlatformManifest } from './inject-deck-meta.mjs';
import { loadInjectedIndexHtml, listOverlayCss } from './deck-content.mjs';
import { scanPollMarkersFromHtml } from './scan-poll-markers.mjs';
import { scanBoardMarkersFromHtml } from './scan-board-markers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.github',
  'tests',
  'test',
  'examples',
  'react',
  'content',
]);

const WHITEBOARD_JS = path.join(ROOT, 'dist/whiteboard/whiteboard.js');
const WHITEBOARD_ASSETS = path.join(ROOT, 'dist/whiteboard/assets');

function assertWhiteboardBuilt() {
  if (!fs.existsSync(WHITEBOARD_JS)) {
    console.error(
      'Missing dist/whiteboard/whiteboard.js — run `npm run build:present` from this deck folder first.'
    );
    process.exit(1);
  }
  if (!fs.existsSync(WHITEBOARD_ASSETS)) {
    console.error(
      'Missing dist/whiteboard/assets/ — run `npm run build:present` from this deck folder first.'
    );
    process.exit(1);
  }
}

function collectFiles(dir, base, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, base, files);
    } else if (entry.isFile()) {
      const rel = path.relative(base, full).replace(/\\/g, '/');
      if (rel.endsWith('.scss')) continue;
      if (rel.startsWith('dist/') && rel.endsWith('.zip')) continue;
      if (rel === 'dist/presentation.zip') continue;
      if (rel === 'dist/platform-manifest.json') continue;
      if (rel === 'platform-manifest.json') continue;
      files.push({ rel, full });
    }
  }
  return files;
}

async function main() {
  assertWhiteboardBuilt();

  const meta = readDeckMeta();
  const injectedHtml = loadInjectedIndexHtml(ROOT);
  const pollScan = scanPollMarkersFromHtml(injectedHtml);
  const boardScan = scanBoardMarkersFromHtml(injectedHtml);
  const platformManifest = buildPlatformManifest(meta, pollScan, boardScan);
  const deckMetaJs = buildDeckMetaJs({
    ...meta,
    poll_markers: pollScan.poll_markers,
    poll_definitions: pollScan.poll_definitions,
    capabilities: platformManifest.capabilities,
  });

  fs.writeFileSync(path.join(ROOT, 'js/deck-meta.js'), deckMetaJs, 'utf8');

  const deckId = platformManifest.deck_id;
  const version = meta.version;
  const outDir = path.resolve(process.env.DECK_OUT_DIR || path.join(ROOT, 'dist'));
  const zipName = `${deckId}-${version}.zip`;
  const outPath = path.join(outDir, zipName);
  const manifestJson = JSON.stringify(platformManifest, null, 2) + '\n';

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'platform-manifest.json'), manifestJson);

  const files = collectFiles(ROOT, ROOT);
  const zip = new JSZip();

  zip.file('platform-manifest.json', manifestJson);
  zip.file('js/deck-meta.js', deckMetaJs);
  zip.file('index.html', injectedHtml);

  for (const css of listOverlayCss()) {
    zip.file(`css/${css.name}`, fs.readFileSync(css.full));
  }

  for (const { rel, full } of files) {
    if (rel === 'js/deck-meta.js') continue;
    if (rel === 'index.html') continue;
    zip.file(rel, fs.readFileSync(full));
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(outPath, buffer);

  console.log(`Packaged: ${outPath} (${files.length + 2} files incl. platform-manifest.json + deck-meta.js)`);
  console.log(`Platform manifest: bridge_api=${platformManifest.bridge_api}, version=${version}, polls=${pollScan.poll_definitions.length}, boards=${boardScan.board_ids.length}`);
  console.log('Upload the zip via admin course resources (course → Add presentation resource).');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
