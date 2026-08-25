import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareSlidePosition,
  canNavigateForward,
  canNavigateNotesForward,
  normalizeKey,
  shouldApplyIncomingDeckState,
} from './platform-position-utils-core.mjs';

var HORIZONTAL_KEYS = ['0/0', '1/0', '2/0', '3/0'];
var VERTICAL_KEYS = ['0/0', '1/0', '1/1', '1/2', '2/0'];

describe('compareSlidePosition', () => {
  it('orders horizontal slides before / equal / after', () => {
    assert.equal(compareSlidePosition('0/0', '1/0', HORIZONTAL_KEYS), -1);
    assert.equal(compareSlidePosition('1/0', '1/0', HORIZONTAL_KEYS), 0);
    assert.equal(compareSlidePosition('2/0', '1/0', HORIZONTAL_KEYS), 1);
  });

  it('orders vertical stack slides', () => {
    assert.equal(compareSlidePosition('1/0', '1/1', VERTICAL_KEYS), -1);
    assert.equal(compareSlidePosition('1/1', '1/0', VERTICAL_KEYS), 1);
    assert.equal(compareSlidePosition('1/2', '2/0', VERTICAL_KEYS), -1);
  });

  it('compares indexf on the same slide', () => {
    var slide = { indexh: 1, indexv: 0, indexf: 0 };
    var frag1 = { indexh: 1, indexv: 0, indexf: 1 };
    var frag2 = { indexh: 1, indexv: 0, indexf: 2 };
    assert.equal(compareSlidePosition(slide, frag1, HORIZONTAL_KEYS), -1);
    assert.equal(compareSlidePosition(frag2, frag1, HORIZONTAL_KEYS), 1);
    assert.equal(compareSlidePosition(frag1, frag1, HORIZONTAL_KEYS), 0);
  });
});

describe('canNavigateForward', () => {
  it('allows forward only when strictly before instructor', () => {
    assert.equal(canNavigateForward('0/0', '2/0', HORIZONTAL_KEYS), true);
    assert.equal(canNavigateForward('2/0', '2/0', HORIZONTAL_KEYS), false);
    assert.equal(canNavigateForward('3/0', '2/0', HORIZONTAL_KEYS), false);
  });
});

describe('canNavigateNotesForward', () => {
  it('blocks next when it would pass instructor ceiling', () => {
    assert.equal(canNavigateNotesForward('0/0', '1/0', HORIZONTAL_KEYS), true);
    assert.equal(canNavigateNotesForward('1/0', '1/0', HORIZONTAL_KEYS), false);
    assert.equal(canNavigateNotesForward('0/0', '0/0', HORIZONTAL_KEYS), false);
  });

  it('respects vertical stack ceiling', () => {
    assert.equal(canNavigateNotesForward('1/0', '1/1', VERTICAL_KEYS), true);
    assert.equal(canNavigateNotesForward('1/1', '1/1', VERTICAL_KEYS), false);
  });
});

describe('normalizeKey', () => {
  it('normalizes vertical index', () => {
    assert.equal(normalizeKey(1, 0), '1/0');
    assert.equal(normalizeKey(1, undefined), '1/0');
  });
});

describe('shouldApplyIncomingDeckState', () => {
  it('applies first authoritative state on connect replay', () => {
    assert.equal(
      shouldApplyIncomingDeckState({ indexh: 0, indexv: 0, indexf: 0 }, null, HORIZONTAL_KEYS),
      true
    );
  });

  it('applies when learner was synced before instructor advance', () => {
    var atZero = { indexh: 0, indexv: 0, indexf: 0 };
    assert.equal(shouldApplyIncomingDeckState(atZero, atZero, HORIZONTAL_KEYS), true);
  });

  it('does not apply when learner is behind previous instructor position', () => {
    var learner = { indexh: 0, indexv: 0, indexf: 0 };
    var instructor = { indexh: 2, indexv: 0, indexf: 0 };
    assert.equal(shouldApplyIncomingDeckState(learner, instructor, HORIZONTAL_KEYS), false);
  });
});
