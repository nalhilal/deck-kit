import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertKebabId, parseArgs } from './init-deck.mjs';

describe('assertKebabId', () => {
  it('accepts kebab-case ids', () => {
    assert.doesNotThrow(() => assertKebabId('my-course'));
  });

  it('rejects uppercase or spaces', () => {
    assert.throws(() => assertKebabId('My Course'), /kebab-case/);
  });
});

describe('parseArgs', () => {
  it('reads --id and --title', () => {
    const out = parseArgs(['--id', 'example-deck', '--title', 'Example Deck']);
    assert.equal(out.id, 'example-deck');
    assert.equal(out.title, 'Example Deck');
  });
});
