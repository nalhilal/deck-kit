import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scanPollMarkersFromHtml,
  mapResultsModeAttr,
  stripHtmlText,
} from './scan-poll-markers.mjs';

describe('scanPollMarkersFromHtml', () => {
  it('parses a valid poll section', () => {
    const html = `
      <section data-poll-id="myth-fact-q1" data-poll-results="hidden-until-close">
        <p data-poll-question>AI always gives the correct answer?</p>
        <ul data-poll-options>
          <li data-poll-option-id="myth">Myth</li>
          <li data-poll-option-id="fact">Fact</li>
        </ul>
      </section>
    `;
    const result = scanPollMarkersFromHtml(html);
    assert.deepEqual(result.poll_markers, ['myth-fact-q1']);
    assert.equal(result.poll_definitions[0].poll_id, 'myth-fact-q1');
    assert.equal(result.poll_definitions[0].question, 'AI always gives the correct answer?');
    assert.equal(result.poll_definitions[0].default_results_mode, 'hidden-until-close');
  });

  it('rejects duplicate poll ids', () => {
    const html = `
      <section data-poll-id="dup"><p data-poll-question>Q?</p>
        <ul data-poll-options><li data-poll-option-id="a">A</li><li data-poll-option-id="b">B</li></ul>
      </section>
      <section data-poll-id="dup"><p data-poll-question>Q2?</p>
        <ul data-poll-options><li data-poll-option-id="a">A</li><li data-poll-option-id="b">B</li></ul>
      </section>
    `;
    assert.throws(() => scanPollMarkersFromHtml(html), /Duplicate data-poll-id/);
  });

  it('rejects fewer than two options', () => {
    const html = `
      <section data-poll-id="bad"><p data-poll-question>Q?</p>
        <ul data-poll-options><li data-poll-option-id="a">A</li></ul>
      </section>
    `;
    assert.throws(() => scanPollMarkersFromHtml(html), /at least two options/);
  });
});

describe('mapResultsModeAttr', () => {
  it('maps known modes', () => {
    assert.equal(mapResultsModeAttr('hidden-until-close'), 'hidden-until-close');
    assert.equal(mapResultsModeAttr('live'), 'live');
  });
});

describe('stripHtmlText', () => {
  it('trims nested markup', () => {
    assert.equal(stripHtmlText('<span>Myth</span>'), 'Myth');
  });
});
