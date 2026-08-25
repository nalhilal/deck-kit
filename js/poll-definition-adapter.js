/**
 * Parse declarative poll markers from the deck DOM (Batch 03.3).
 */
(function () {
  var POLL_ID_RE = /^[a-zA-Z0-9_-]{1,100}$/;

  function stripText(el) {
    return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
  }

  function mapResultsModeAttr(attr) {
    if (!attr) return 'hidden_until_close';
    var value = String(attr).trim().toLowerCase();
    if (value === 'live') return 'live';
    if (value === 'hidden-until-close') return 'hidden_until_close';
    if (value === 'instructor-only') return 'instructor_only';
    return 'hidden_until_close';
  }

  function getManifestDefinitions() {
    var meta = window.__DECK_META__;
    if (!meta || !Array.isArray(meta.poll_definitions)) return [];
    return meta.poll_definitions;
  }

  function findPollSection(startEl) {
    var el = startEl;
    while (el) {
      if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute('data-poll-id')) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function parsePollSection(section, slideKey) {
    var pollId = section.getAttribute('data-poll-id');
    if (!pollId || !POLL_ID_RE.test(pollId)) {
      return null;
    }

    var questionEl = section.querySelector('[data-poll-question]');
    var optionsContainer = section.querySelector('[data-poll-options]');
    if (!questionEl || !optionsContainer) {
      return null;
    }

    var question = stripText(questionEl);
    var optionEls = optionsContainer.querySelectorAll('[data-poll-option-id]');
    var options = [];
    var seen = {};

    for (var i = 0; i < optionEls.length; i++) {
      var optionEl = optionEls[i];
      var id = optionEl.getAttribute('data-poll-option-id');
      if (!id || seen[id]) {
        return null;
      }
      seen[id] = true;
      options.push({ id: id, label: stripText(optionEl) || id });
    }

    if (options.length < 2 || !question) {
      return null;
    }

    return {
      poll_id: pollId,
      slide_key: slideKey,
      question: question,
      options: options,
      default_results_mode: mapResultsModeAttr(section.getAttribute('data-poll-results')),
    };
  }

  function lookupManifestDefinition(pollId, slideKey) {
    var defs = getManifestDefinitions();
    for (var i = 0; i < defs.length; i++) {
      var def = defs[i];
      if (def.poll_id === pollId) {
        return {
          poll_id: def.poll_id,
          slide_key: slideKey,
          question: def.question,
          options: def.options,
          default_results_mode: mapResultsModeAttr(def.default_results_mode),
          correct_option_id: def.correct_option_id,
        };
      }
    }
    return null;
  }

  function slideKeyFromReveal() {
    return PlatformRevealUtils.slideKeyFromReveal();
  }

  function getDefinitionForSlide(slideKey) {
    if (typeof Reveal === 'undefined') return null;
    var key = slideKey || slideKeyFromReveal();
    if (slideKey && slideKey !== slideKeyFromReveal()) {
      return null;
    }
    var slideEl = Reveal.getCurrentSlide();
    if (!slideEl) return null;

    var section = findPollSection(slideEl);
    if (!section) return null;

    var parsed = parsePollSection(section, key);
    if (parsed) return parsed;

    var pollId = section.getAttribute('data-poll-id');
    return pollId ? lookupManifestDefinition(pollId, key) : null;
  }

  window.PollDefinitionAdapter = {
    getDefinitionForSlide: getDefinitionForSlide,
    slideKeyFromReveal: slideKeyFromReveal,
    mapResultsModeAttr: mapResultsModeAttr,
    getManifestDefinitions: getManifestDefinitions,
  };
})();
