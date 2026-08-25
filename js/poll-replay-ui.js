/**
 * Review-mode poll replay badges (Batch 03.6).
 */
(function () {
  'use strict';

  var deps = null;
  var responseCache = {};
  var responsesList = [];
  var inDeckCount = 0;
  var slideHandler = null;
  var badgeEl = null;
  var participationEl = null;

  function shouldActivate() {
    return (
      deps &&
      typeof deps.isReviewMode === 'function' &&
      deps.isReviewMode() &&
      typeof deps.getRole === 'function' &&
      deps.getRole() === 'learner'
    );
  }

  function getInDeckCount() {
    if (
      !window.PollDefinitionAdapter ||
      typeof PollDefinitionAdapter.getManifestDefinitions !== 'function'
    ) {
      return 0;
    }
    var defs = PollDefinitionAdapter.getManifestDefinitions();
    return Array.isArray(defs) ? defs.length : 0;
  }

  function cacheResponses(responses) {
    responseCache = {};
    responsesList = Array.isArray(responses) ? responses : [];
    for (var i = 0; i < responsesList.length; i++) {
      var row = responsesList[i];
      if (row && row.poll_id) {
        responseCache[row.poll_id] = row;
      }
    }
  }

  function fetchMyResponses() {
    if (!shouldActivate()) {
      return Promise.resolve([]);
    }
    if (!deps.isAuthenticated || !deps.isAuthenticated()) {
      return Promise.resolve([]);
    }
    var sessionId = deps.getSessionId();
    if (!sessionId) {
      return Promise.resolve([]);
    }

    return fetch(
      deps.getApiBase() +
        '/sessions/' +
        encodeURIComponent(sessionId) +
        '/polls/my-responses',
      { credentials: 'include' }
    )
      .then(function (res) {
        if (!res.ok) return [];
        return res.json().then(function (body) {
          return body && body.data && Array.isArray(body.data.responses)
            ? body.data.responses
            : [];
        });
      })
      .catch(function () {
        return [];
      })
      .then(function (responses) {
        cacheResponses(responses);
        return responses;
      });
  }

  function ensureBadge() {
    if (!badgeEl) {
      badgeEl = document.createElement('div');
      badgeEl.id = 'platform-poll-replay';
      badgeEl.setAttribute('role', 'status');
      badgeEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(badgeEl);
    }
    return badgeEl;
  }

  function hideBadge() {
    if (badgeEl) {
      badgeEl.classList.remove('visible');
      badgeEl.textContent = '';
    }
  }

  function ensureParticipation() {
    if (participationEl) return participationEl;
    var chrome = document.getElementById('platform-bridge-chrome');
    if (!chrome) return null;
    participationEl = document.createElement('div');
    participationEl.id = 'platform-poll-participation';
    participationEl.className = 'platform-poll-participation';
    chrome.appendChild(participationEl);
    return participationEl;
  }

  function renderParticipation() {
    if (!shouldActivate()) return;
    var el = ensureParticipation();
    if (!el) return;
    var answered = responsesList.length;
    if (!inDeckCount) {
      el.textContent = '';
      el.classList.remove('visible');
      return;
    }
    el.textContent = 'Polls answered: ' + answered + ' / ' + inDeckCount;
    el.classList.add('visible');
  }

  function refreshForSlide() {
    if (!shouldActivate()) {
      hideBadge();
      return;
    }

    var definition =
      window.PollDefinitionAdapter &&
      typeof PollDefinitionAdapter.getDefinitionForSlide === 'function'
        ? PollDefinitionAdapter.getDefinitionForSlide()
        : null;

    if (!definition || !definition.poll_id) {
      hideBadge();
      return;
    }

    var response = responseCache[definition.poll_id];
    var badge = ensureBadge();

    if (response) {
      var label = response.option_label || response.option_id || 'your choice';
      badge.textContent = 'You chose: ' + label;
      badge.classList.add('visible');
      badge.classList.remove('muted');
      return;
    }

    badge.textContent = 'No vote recorded';
    badge.classList.add('visible', 'muted');
  }

  function install(installDeps) {
    deps = installDeps || null;
    if (!shouldActivate()) {
      return Promise.resolve();
    }

    inDeckCount = getInDeckCount();

    slideHandler = function () {
      refreshForSlide();
    };
    if (typeof Reveal !== 'undefined') {
      Reveal.on('slidechanged', slideHandler);
    }

    return fetchMyResponses().then(function () {
      renderParticipation();
      refreshForSlide();
    });
  }

  function teardown() {
    if (slideHandler && typeof Reveal !== 'undefined') {
      Reveal.off('slidechanged', slideHandler);
    }
    slideHandler = null;
    hideBadge();
    if (badgeEl) {
      badgeEl.remove();
      badgeEl = null;
    }
    if (participationEl) {
      participationEl.remove();
      participationEl = null;
    }
    responseCache = {};
    responsesList = [];
    inDeckCount = 0;
    deps = null;
  }

  function getMyResponse(pollId) {
    return responseCache[pollId] || null;
  }

  function getParticipationSummary() {
    return {
      answered: responsesList.length,
      inDeck: inDeckCount,
    };
  }

  window.PlatformBridgePollReplay = {
    install: install,
    teardown: teardown,
    refreshForSlide: refreshForSlide,
    getMyResponse: getMyResponse,
    getParticipationSummary: getParticipationSummary,
  };
})();
