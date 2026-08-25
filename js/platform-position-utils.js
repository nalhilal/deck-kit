/**
 * Canonical slide position helpers (doc 18 / doc 19).
 */
(function () {
  function normalizeKey(h, v) {
    return h + '/' + (v || 0);
  }

  function positionFromState(state) {
    if (!state) return { indexh: 0, indexv: 0, indexf: 0 };
    return {
      indexh: state.indexh || 0,
      indexv: state.indexv || 0,
      indexf: state.indexf || 0,
    };
  }

  function keyFromPosition(pos) {
    if (!pos) return '0/0';
    if (typeof pos === 'string') return pos;
    return normalizeKey(pos.indexh, pos.indexv);
  }

  function enumerateSlideKeys() {
    if (typeof Reveal === 'undefined' || typeof Reveal.getSlides !== 'function') {
      return ['0/0'];
    }
    var slides = Reveal.getSlides();
    var keys = slides.map(function (slide) {
      var indices = Reveal.getIndices(slide);
      return normalizeKey(indices.h, indices.v);
    });
    return keys.length ? keys : ['0/0'];
  }

  function compareSlidePosition(a, b, orderedKeys) {
    var keys = orderedKeys && orderedKeys.length ? orderedKeys : enumerateSlideKeys();
    var keyA = keyFromPosition(a);
    var keyB = keyFromPosition(b);
    var idxA = keys.indexOf(keyA);
    var idxB = keys.indexOf(keyB);
    if (idxA < 0) idxA = 0;
    if (idxB < 0) idxB = 0;
    if (idxA !== idxB) return idxA < idxB ? -1 : 1;
    var fA = typeof a === 'string' ? 0 : a.indexf || 0;
    var fB = typeof b === 'string' ? 0 : b.indexf || 0;
    if (fA === fB) return 0;
    return fA < fB ? -1 : 1;
  }

  function canNavigateForward(learnerPos, instructorPos, orderedKeys) {
    return compareSlidePosition(learnerPos, instructorPos, orderedKeys) < 0;
  }

  function canNavigateNotesForward(editingKey, instructorKey, orderedKeys) {
    if (!editingKey || !instructorKey) return true;
    var keys = orderedKeys && orderedKeys.length ? orderedKeys : enumerateSlideKeys();
    var index = keys.indexOf(editingKey);
    if (index < 0 || index >= keys.length - 1) return false;
    var nextKey = keys[index + 1];
    return compareSlidePosition(nextKey, instructorKey, keys) <= 0;
  }

  function shouldApplyIncomingDeckState(learnerPos, previousInstructorPos, orderedKeys) {
    if (!previousInstructorPos) return true;
    return compareSlidePosition(learnerPos, previousInstructorPos, orderedKeys) === 0;
  }

  function positionFromReveal() {
    if (typeof Reveal === 'undefined') return { indexh: 0, indexv: 0, indexf: 0 };
    return positionFromState(Reveal.getState());
  }

  function slideElementForKey(slideKey) {
    if (typeof Reveal === 'undefined' || typeof Reveal.getSlides !== 'function') {
      return null;
    }
    var match = /^(\d+)\/(\d+)$/.exec(slideKey || '');
    if (!match) return null;
    var targetH = parseInt(match[1], 10);
    var targetV = parseInt(match[2], 10);
    var slides = Reveal.getSlides();
    for (var i = 0; i < slides.length; i++) {
      var indices = Reveal.getIndices(slides[i]);
      if (indices.h === targetH && (indices.v || 0) === targetV) {
        return slides[i];
      }
    }
    return null;
  }

  function learnerSlidePosition(slideKey) {
    var slide = slideElementForKey(slideKey);
    if (!slide || typeof Reveal === 'undefined') return '';
    if (
      typeof Reveal.getSlidePastCount !== 'function' ||
      typeof Reveal.getTotalSlides !== 'function'
    ) {
      return '';
    }
    var past = Reveal.getSlidePastCount(slide);
    var total = Reveal.getTotalSlides();
    var uncounted = slide.dataset && slide.dataset.visibility === 'uncounted';
    var current = past + (uncounted ? 0 : 1);
    return current + '/' + total;
  }

  function learnerSlideLabel(slideKey) {
    var position = learnerSlidePosition(slideKey);
    var label = position ? 'Slide ' + position : 'Slide';
    try {
      var slide = slideElementForKey(slideKey);
      if (!slide) return label;
      var heading = slide.querySelector('h2, h1');
      if (heading && heading.textContent) {
        var text = heading.textContent.trim();
        if (text) return label + ' — ' + text;
      }
    } catch (e) {
      /* ignore */
    }
    return label;
  }

  window.PlatformPositionUtils = {
    normalizeKey: normalizeKey,
    positionFromState: positionFromState,
    keyFromPosition: keyFromPosition,
    enumerateSlideKeys: enumerateSlideKeys,
    compareSlidePosition: compareSlidePosition,
    canNavigateForward: canNavigateForward,
    canNavigateNotesForward: canNavigateNotesForward,
    shouldApplyIncomingDeckState: shouldApplyIncomingDeckState,
    positionFromReveal: positionFromReveal,
    learnerSlidePosition: learnerSlidePosition,
    learnerSlideLabel: learnerSlideLabel,
  };
})();
