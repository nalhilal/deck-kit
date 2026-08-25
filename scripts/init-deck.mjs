/**
 * Rewrite package.json deck identity and sample marker prefixes in content/slides.html.
 * Usage: node scripts/init-deck.mjs --id my-course --title "My Course"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export function parseArgs(argv) {
  const out = { id: null, title: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--id') {
      out.id = argv[++i];
    } else if (argv[i] === '--title') {
      out.title = argv[++i];
    }
  }
  return out;
}

export function assertKebabId(id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 100) {
    throw new Error(`--id must be kebab-case [a-z0-9-] (got ${id})`);
  }
}

function main() {
  const { id, title } = parseArgs(process.argv.slice(2));
  if (!id || !title) {
    console.error('Usage: npm run init -- --id my-course --title "My Course"');
    process.exit(1);
  }
  assertKebabId(id);

  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.name = `${id}-deck`;
  pkg.deck = pkg.deck || {};
  pkg.deck.id = id;
  pkg.deck.title = title;
  pkg.description = `${title} — training platform compatible Reveal deck.`;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, '\t')}\n`, 'utf8');

  const slidesPath = path.join(ROOT, 'content/slides.html');
  let slides = fs.readFileSync(slidesPath, 'utf8');
  slides = slides.replaceAll('example-deck', id);
  slides = slides.replaceAll('ex-board-1', `${id}-board-1`);
  slides = slides.replaceAll('ex-poll-1', `${id}-poll-1`);
  fs.writeFileSync(slidesPath, slides, 'utf8');

  const indexPath = path.join(ROOT, 'index.html');
  let index = fs.readFileSync(indexPath, 'utf8');
  index = index.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  index = index.replace(/id="example-deck"/, `id="${id}"`);
  fs.writeFileSync(indexPath, index, 'utf8');

  console.log(`init-deck: deck.id=${id} title=${JSON.stringify(title)}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
