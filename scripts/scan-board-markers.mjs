/**
 * Scan index.html for facilitator whiteboard markers (Batch 05.3).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BOARD_ID_RE = /^[a-zA-Z0-9_-]{1,100}$/;

const SECTION_WITH_BOARD_RE =
  /<section\b([^>]*\bdata-whiteboard-id\s*=\s*["']([^"']+)["'][^>]*)>/gi;

export function scanBoardMarkersFromHtml(html) {
  const boardIds = [];
  const seen = new Set();
  let match;

  SECTION_WITH_BOARD_RE.lastIndex = 0;
  while ((match = SECTION_WITH_BOARD_RE.exec(html)) !== null) {
    const boardId = match[2].trim();
    if (!BOARD_ID_RE.test(boardId)) {
      throw new Error(`Invalid data-whiteboard-id "${boardId}" — use [a-zA-Z0-9_-]{1,100}`);
    }
    if (seen.has(boardId)) {
      throw new Error(`Duplicate data-whiteboard-id "${boardId}" in HTML`);
    }
    seen.add(boardId);
    boardIds.push(boardId);
  }

  return { board_ids: boardIds };
}

export function scanBoardMarkersFromFile(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  return scanBoardMarkersFromHtml(html);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const { loadInjectedIndexHtml } = await import('./deck-content.mjs');
    const result = scanBoardMarkersFromHtml(loadInjectedIndexHtml());
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
