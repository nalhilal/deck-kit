/**
 * Resolve overlay content dir and inject slides into the deck shell index.html.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, resolveDeckPackageJson, identityFromPackageJson } from './inject-deck-meta.mjs';

export const SLIDES_MARKER = '<!-- DECK_SLIDES -->';

export function resolveContentDir(root = ROOT) {
  const env = process.env.CONTENT_DIR;
  if (env) {
    return path.resolve(env);
  }
  return path.join(root, 'content');
}

export function injectSlidesIntoIndex(indexHtml, slidesHtml) {
  if (!indexHtml.includes(SLIDES_MARKER)) {
    throw new Error('index.html missing <!-- DECK_SLIDES --> marker');
  }
  return indexHtml.replace(SLIDES_MARKER, slidesHtml);
}

export function applyDeckIdentity(html, { deck_id, title }) {
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  out = out.replace(/<div class="reveal" id="[^"]*"/, `<div class="reveal" id="${deck_id}"`);
  return out;
}

export function listOverlayCss(contentDir = resolveContentDir()) {
  const cssDir = path.join(contentDir, 'css');
  if (!fs.existsSync(cssDir)) {
    return [];
  }
  return fs
    .readdirSync(cssDir)
    .filter((name) => name.endsWith('.css'))
    .sort()
    .map((name) => ({ name, full: path.join(cssDir, name) }));
}

export function injectOverlayCssLinks(html, files) {
  if (!files.length) {
    return html;
  }
  const needle = /<link rel="stylesheet" href="css\/(?:deck|chapter-01)\.css" \/>/;
  if (!needle.test(html)) {
    throw new Error('index.html missing css/deck.css (or css/chapter-01.css) stylesheet link');
  }
  const links = files
    .map((file) => `\t\t<link rel="stylesheet" href="css/${file.name}" />`)
    .join('\n');
  return html.replace(needle, (match) => `${match}\n${links}`);
}

export function loadInjectedIndexHtml(root = ROOT) {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const contentDir = resolveContentDir(root);
  const slidesPath = path.join(contentDir, 'slides.html');
  if (!fs.existsSync(slidesPath)) {
    throw new Error(`slides.html not found at ${slidesPath}`);
  }
  const pkg = JSON.parse(fs.readFileSync(resolveDeckPackageJson(root), 'utf8'));
  const identity = identityFromPackageJson(pkg);
  let html = injectSlidesIntoIndex(indexHtml, fs.readFileSync(slidesPath, 'utf8'));
  html = injectOverlayCssLinks(html, listOverlayCss(contentDir));
  return applyDeckIdentity(html, identity);
}
