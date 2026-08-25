/**
 * Guest progress stash and server sync for platform bridge.
 */
(function () {
  var PROGRESS_DEBOUNCE_MS = 300;

  var bridgeDeps = null;
  var progressHandlersBound = false;
  var progressSaveTimer = null;
  var saveProgressDebounced = null;

  function progressStashKey() {
    return 'platform-progress-' + bridgeDeps.getSessionId();
  }

  function buildSavedState() {
    return {
      follow_instructor: bridgeDeps.getFollowInstructor(),
      deck_preferences: {},
    };
  }

  function stashGuestProgress() {
    var sessionId = bridgeDeps.getSessionId();
    if (!sessionId) return;
    PlatformGuestStorage.setItem(
      progressStashKey(),
      JSON.stringify({
        slide_key: bridgeDeps.slideKeyFromReveal(),
        saved_state: buildSavedState(),
      })
    );
  }

  function readGuestProgressStash() {
    var sessionId = bridgeDeps.getSessionId();
    if (!sessionId) return null;
    var raw = PlatformGuestStorage.getItem(progressStashKey());
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearGuestProgressStash() {
    var sessionId = bridgeDeps.getSessionId();
    if (!sessionId) return;
    PlatformGuestStorage.removeItem(progressStashKey());
  }

  function patchProgressToServer(payload) {
    var sessionId = bridgeDeps.getSessionId();
    var auth = bridgeDeps.getPlatformAuth();
    if (!sessionId || !auth.isAuthenticated) {
      return Promise.resolve();
    }
    var body = payload || {
      slide_key: bridgeDeps.slideKeyFromReveal(),
      saved_state: buildSavedState(),
    };
    return fetch(
      bridgeDeps.getApiBase() +
        '/sessions/' +
        encodeURIComponent(sessionId) +
        '/participants/me/progress',
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    ).catch(function () {});
  }

  function flushGuestStashToServer() {
    var stash = readGuestProgressStash();
    var auth = bridgeDeps.getPlatformAuth();
    if (!stash || !auth.isAuthenticated) {
      return Promise.resolve();
    }
    return patchProgressToServer(stash).then(function () {
      clearGuestProgressStash();
    });
  }

  function fetchProgress() {
    var sessionId = bridgeDeps.getSessionId();
    var auth = bridgeDeps.getPlatformAuth();
    if (!sessionId || !auth.isAuthenticated) {
      return Promise.resolve(null);
    }
    return fetch(
      bridgeDeps.getApiBase() +
        '/sessions/' +
        encodeURIComponent(sessionId) +
        '/participants/me/progress',
      { credentials: 'include' }
    )
      .then(function (res) {
        if (!res.ok) return null;
        return res.json().then(function (body) {
          return body && body.data && body.data.progress;
        });
      })
      .catch(function () {
        return null;
      });
  }

  function applyProgress(progress) {
    if (!progress) return;
    if (
      progress.saved_state &&
      typeof progress.saved_state.follow_instructor === 'boolean'
    ) {
      bridgeDeps.setFollowInstructor(progress.saved_state.follow_instructor);
    }
    if (progress.slide_key) {
      bridgeDeps.applySlideKey(progress.slide_key);
    }
  }

  function saveProgressNow() {
    if (progressSaveTimer) {
      clearTimeout(progressSaveTimer);
      progressSaveTimer = null;
    }
    var auth = bridgeDeps.getPlatformAuth();
    if (auth.isAuthenticated) {
      return patchProgressToServer();
    }
    stashGuestProgress();
    return Promise.resolve();
  }

  function restoreProgressDeferred(data) {
    setTimeout(function () {
      if (typeof Reveal !== 'undefined') {
        Reveal.layout();
      }
      applyProgress(data);
    }, 0);
  }

  function flushProgress() {
    return saveProgressNow();
  }

  function bindProgressHandlers() {
    if (progressHandlersBound || typeof Reveal === 'undefined') return;
    progressHandlersBound = true;
    var onSlide = function () {
      if (bridgeDeps.isLive() || bridgeDeps.isReviewMode()) {
        saveProgressDebounced();
      }
    };
    Reveal.on('slidechanged', onSlide);
    Reveal.on('fragmentshown', onSlide);
    Reveal.on('fragmenthidden', onSlide);
  }

  function init(deps) {
    bridgeDeps = deps;
    saveProgressDebounced = bridgeDeps.debounce(function () {
      saveProgressNow();
    }, PROGRESS_DEBOUNCE_MS);
  }

  window.PlatformBridgeProgress = {
    init: init,
    stashGuestProgress: stashGuestProgress,
    readGuestProgressStash: readGuestProgressStash,
    clearGuestProgressStash: clearGuestProgressStash,
    flushGuestStashToServer: flushGuestStashToServer,
    fetchProgress: fetchProgress,
    applyProgress: applyProgress,
    saveProgressNow: saveProgressNow,
    restoreProgressDeferred: restoreProgressDeferred,
    flushProgress: flushProgress,
    bindProgressHandlers: bindProgressHandlers,
  };
})();
