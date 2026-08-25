import assert from 'node:assert/strict';
import test from 'node:test';
import { scanBoardMarkersFromHtml, BOARD_ID_RE } from './scan-board-markers.mjs';

test('BOARD_ID_RE accepts chapter board ids', () => {
  assert.equal(BOARD_ID_RE.test('ch1-slide-03-board'), true);
});

test('scanBoardMarkersFromHtml finds board ids', () => {
  const html = `
    <section class="whiteboard-slide" data-whiteboard-id="ch1-slide-03-board"></section>
    <section data-whiteboard-id="other-board"></section>
  `;
  const result = scanBoardMarkersFromHtml(html);
  assert.deepEqual(result.board_ids, ['ch1-slide-03-board', 'other-board']);
});

test('scanBoardMarkersFromHtml rejects duplicate board ids', () => {
  const html = `
    <section data-whiteboard-id="dup-board"></section>
    <section data-whiteboard-id="dup-board"></section>
  `;
  assert.throws(() => scanBoardMarkersFromHtml(html), /Duplicate data-whiteboard-id/);
});
