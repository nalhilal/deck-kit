import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  injectSlidesIntoIndex,
  applyDeckIdentity,
  injectOverlayCssLinks,
  SLIDES_MARKER,
} from './deck-content.mjs';

describe('injectSlidesIntoIndex', () => {
  it('replaces the marker with slide HTML', () => {
    const shell = `<div class="slides">\n${SLIDES_MARKER}\n</div>`;
    const out = injectSlidesIntoIndex(shell, '<section>Hi</section>');
    assert.match(out, /<section>Hi<\/section>/);
    assert.equal(out.includes(SLIDES_MARKER), false);
  });

  it('throws when the marker is missing', () => {
    assert.throws(() => injectSlidesIntoIndex('<div></div>', '<section></section>'), /DECK_SLIDES/);
  });
});

describe('applyDeckIdentity', () => {
  it('sets title and reveal id from package identity', () => {
    const shell =
      '<title>Example Deck</title><div class="reveal" id="example-deck"><div class="slides"></div></div>';
    const out = applyDeckIdentity(shell, { deck_id: 'chapter-01', title: 'Chapter 1 — What is AI?' });
    assert.match(out, /<title>Chapter 1 — What is AI\?<\/title>/);
    assert.match(out, /id="chapter-01"/);
    assert.equal(out.includes('id="example-deck"'), false);
  });
});

describe('injectOverlayCssLinks', () => {
  it('inserts overlay stylesheets after deck.css', () => {
    const html = '<link rel="stylesheet" href="css/deck.css" />';
    const out = injectOverlayCssLinks(html, [{ name: 'chapter-01.css', full: '/tmp/x' }]);
    assert.match(out, /css\/deck\.css/);
    assert.match(out, /css\/chapter-01\.css/);
  });
});
