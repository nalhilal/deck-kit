/**
 * Verify packaged platform zip meets backend compatibility requirements.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { parseBridgeApiFromSource, readDeckMeta } from './inject-deck-meta.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REQUIRED_BRIDGE_API = 3;

async function main() {
  const meta = readDeckMeta();
  const deckId = meta.deck_id;
  const version = meta.version;
  const outDir = path.resolve(process.env.DECK_OUT_DIR || path.join(ROOT, 'dist'));
  const zipPath = path.join(outDir, `${deckId}-${version}.zip`);

  if (!fs.existsSync(zipPath)) {
    console.error(`verify-platform-bundle: missing ${zipPath} — run npm run package:platform first`);
    process.exit(1);
  }

  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const manifestEntry = zip.file('platform-manifest.json');
  if (!manifestEntry) {
    console.error('verify-platform-bundle: platform-manifest.json missing from zip');
    process.exit(1);
  }

  const manifest = JSON.parse(await manifestEntry.async('string'));
  if (manifest.version !== version) {
    console.error(
      `verify-platform-bundle: manifest version ${manifest.version} !== package.json ${version}`
    );
    process.exit(1);
  }
  if ((manifest.bridge_api ?? 0) < REQUIRED_BRIDGE_API) {
    console.error(
      `verify-platform-bundle: bridge_api ${manifest.bridge_api} < required ${REQUIRED_BRIDGE_API}`
    );
    process.exit(1);
  }

  const deckMetaEntry = zip.file('js/deck-meta.js');
  if (!deckMetaEntry) {
    console.error('verify-platform-bundle: js/deck-meta.js missing from zip');
    process.exit(1);
  }

  const bridgeEntry = zip.file('js/platform-bridge.js');
  if (!bridgeEntry) {
    console.error('verify-platform-bundle: js/platform-bridge.js missing from zip');
    process.exit(1);
  }

  const bridgeSource = await bridgeEntry.async('string');
  const bridgeApi = parseBridgeApiFromSource(bridgeSource);
  if (bridgeApi === null || bridgeApi < REQUIRED_BRIDGE_API) {
    console.error('verify-platform-bundle: platform-bridge.js BRIDGE_API check failed');
    process.exit(1);
  }
  if (manifest.bridge_api !== bridgeApi) {
    console.error(
      `verify-platform-bundle: manifest bridge_api ${manifest.bridge_api} !== platform-bridge.js ${bridgeApi}`
    );
    process.exit(1);
  }

  const deckMetaSource = await deckMetaEntry.async('string');
  if (!deckMetaSource.includes(`"version": "${version}"`)) {
    console.error('verify-platform-bundle: deck-meta.js version does not match package.json');
    process.exit(1);
  }
  if (!deckMetaSource.includes(`"bridge_api": ${bridgeApi}`)) {
    console.error('verify-platform-bundle: deck-meta.js bridge_api does not match platform-bridge.js');
    process.exit(1);
  }

  if (manifest.poll_definitions?.length) {
    if (!Array.isArray(manifest.poll_markers) || manifest.poll_markers.length === 0) {
      console.error('verify-platform-bundle: poll_definitions present but poll_markers missing');
      process.exit(1);
    }
    if (!deckMetaSource.includes('"poll_definitions"')) {
      console.error('verify-platform-bundle: deck-meta.js missing poll_definitions');
      process.exit(1);
    }
    for (const def of manifest.poll_definitions) {
      if (!def.poll_id || !def.question || !Array.isArray(def.options) || def.options.length < 2) {
        console.error(`verify-platform-bundle: invalid poll definition for ${def.poll_id}`);
        process.exit(1);
      }
    }
  }

  console.log(
    `verify-platform-bundle: OK (${deckId} v${version}, bridge_api=${manifest.bridge_api}, polls=${manifest.poll_definitions?.length ?? 0})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
