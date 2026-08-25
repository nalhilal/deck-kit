import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  identityFromPackageJson,
  buildDeckMetaJs,
  parseBridgeApiFromSource,
  buildPlatformManifest,
} from './inject-deck-meta.mjs';

describe('identityFromPackageJson', () => {
  const base = {
    version: '1.2.3',
    deck: { id: 'example-deck', title: 'Example Deck' },
    revealVersion: '6.0.1',
  };

  it('reads deck.id and deck.title', () => {
    const id = identityFromPackageJson(base);
    assert.equal(id.deck_id, 'example-deck');
    assert.equal(id.title, 'Example Deck');
    assert.equal(id.version, '1.2.3');
    assert.equal(id.revealVersion, '6.0.1');
  });

  it('rejects missing deck.id', () => {
    assert.throws(
      () => identityFromPackageJson({ version: '1.0.0', deck: { title: 'T' } }),
      /deck.id is required/
    );
  });

  it('rejects missing deck.title', () => {
    assert.throws(
      () => identityFromPackageJson({ version: '1.0.0', deck: { id: 'x' } }),
      /deck.title is required/
    );
  });

  it('does not default deck.id to chapter-01', () => {
    assert.throws(() => identityFromPackageJson({ version: '1.0.0' }), /deck.id is required/);
  });
});

describe('buildDeckMetaJs', () => {
  it('includes title from package identity', () => {
    const js = buildDeckMetaJs({
      version: '2.0.0',
      bridge_api: 3,
      deck_id: 'my-course',
      title: 'My Course',
    });
    assert.match(js, /"deck_id": "my-course"/);
    assert.match(js, /"title": "My Course"/);
    assert.doesNotMatch(js, /chapter-01/);
  });
});

describe('parseBridgeApiFromSource', () => {
  it('parses BRIDGE_API', () => {
    assert.equal(parseBridgeApiFromSource('const BRIDGE_API = 3;'), 3);
  });
});

describe('buildPlatformManifest', () => {
  it('uses meta.title instead of a hard-coded Chapter 1 string', () => {
    const manifest = buildPlatformManifest(
      {
        deck_id: 'example-deck',
        version: '1.0.0',
        bridge_api: 3,
        title: 'Example Deck',
        revealVersion: '6.0.1',
      },
      { poll_definitions: [], poll_markers: [] },
      { board_ids: [] }
    );
    assert.equal(manifest.title, 'Example Deck');
    assert.equal(manifest.deck_id, 'example-deck');
    assert.notEqual(manifest.title, 'Chapter 1 — What is AI?');
  });

  it('rejects missing title', () => {
    assert.throws(
      () =>
        buildPlatformManifest(
          { deck_id: 'x', version: '1.0.0', bridge_api: 3 },
          { poll_definitions: [], poll_markers: [] },
          { board_ids: [] }
        ),
      /deck.title is required/
    );
  });
});
