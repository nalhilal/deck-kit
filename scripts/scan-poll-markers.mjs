/**
 * Scan index.html for declarative poll markers (Batch 03.2).
 * Used at package time and in node tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const POLL_ID_RE = /^[a-zA-Z0-9_-]{1,100}$/;

const SECTION_WITH_POLL_RE =
  /<section\b([^>]*\bdata-poll-id\s*=\s*["']([^"']+)["'][^>]*)>([\s\S]*?)<\/section>/gi;

const RESULTS_MODE_ATTR_RE = /data-poll-results\s*=\s*["']([^"']+)["']/i;
const QUESTION_RE =
  /<(?:p|div|h\d)\b[^>]*\bdata-poll-question\b[^>]*>([\s\S]*?)<\/(?:p|div|h\d)>/i;
const OPTION_RE =
  /<li\b[^>]*\bdata-poll-option-id\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/li>/gi;
const CORRECT_OPTION_RE = /\bdata-poll-option-correct\b/i;

export function stripHtmlText(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapResultsModeAttr(attr) {
  if (!attr) return null;
  const value = attr.trim().toLowerCase();
  if (value === 'live') return 'live';
  if (value === 'hidden-until-close') return 'hidden-until-close';
  if (value === 'instructor-only') return 'instructor-only';
  return null;
}

export function mapResultsModeToApi(mode) {
  if (mode === 'hidden-until-close') return 'hidden_until_close';
  if (mode === 'instructor-only') return 'instructor_only';
  return mode;
}

function parsePollSection(attrs, pollId, innerHtml) {
  if (!POLL_ID_RE.test(pollId)) {
    throw new Error(`Invalid poll_id "${pollId}" — use [a-zA-Z0-9_-]{1,100}`);
  }

  const resultsAttr = attrs.match(RESULTS_MODE_ATTR_RE);
  const defaultResultsMode = mapResultsModeAttr(resultsAttr?.[1] ?? '') ?? undefined;

  const questionMatch = innerHtml.match(QUESTION_RE);
  if (!questionMatch) {
    throw new Error(`Poll "${pollId}" is missing data-poll-question`);
  }
  const question = stripHtmlText(questionMatch[1]);
  if (!question) {
    throw new Error(`Poll "${pollId}" has an empty question`);
  }

  const options = [];
  const seenOptionIds = new Set();
  let correctOptionId;
  let optionMatch;
  OPTION_RE.lastIndex = 0;
  while ((optionMatch = OPTION_RE.exec(innerHtml)) !== null) {
    const optionId = optionMatch[1].trim();
    const label = stripHtmlText(optionMatch[2]);
    if (!optionId) {
      throw new Error(`Poll "${pollId}" has an option without data-poll-option-id`);
    }
    if (seenOptionIds.has(optionId)) {
      throw new Error(`Poll "${pollId}" has duplicate option id "${optionId}"`);
    }
    seenOptionIds.add(optionId);
    options.push({ id: optionId, label: label || optionId });
    if (CORRECT_OPTION_RE.test(optionMatch[0])) {
      if (correctOptionId) {
        throw new Error(`Poll "${pollId}" has multiple data-poll-option-correct markers`);
      }
      correctOptionId = optionId;
    }
  }

  if (options.length < 2) {
    throw new Error(`Poll "${pollId}" needs at least two options`);
  }

  const definition = {
    poll_id: pollId,
    question,
    options,
  };
  if (defaultResultsMode) {
    definition.default_results_mode = defaultResultsMode;
  }
  if (correctOptionId) {
    definition.correct_option_id = correctOptionId;
  }
  return definition;
}

export function scanPollMarkersFromHtml(html) {
  const definitions = [];
  const seenPollIds = new Set();
  let match;

  SECTION_WITH_POLL_RE.lastIndex = 0;
  while ((match = SECTION_WITH_POLL_RE.exec(html)) !== null) {
    const attrs = match[1];
    const pollId = match[2].trim();
    const innerHtml = match[3];

    if (seenPollIds.has(pollId)) {
      throw new Error(`Duplicate data-poll-id "${pollId}" in HTML`);
    }
    seenPollIds.add(pollId);

    definitions.push(parsePollSection(attrs, pollId, innerHtml));
  }

  return {
    poll_markers: definitions.map((d) => d.poll_id),
    poll_definitions: definitions,
  };
}

export function scanPollMarkersFromFile(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  return scanPollMarkersFromHtml(html);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const { loadInjectedIndexHtml } = await import('./deck-content.mjs');
    const result = scanPollMarkersFromHtml(loadInjectedIndexHtml());
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
