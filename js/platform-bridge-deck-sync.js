/**
 * Instructor deck state broadcast and learner deck apply.
 */
(function () {
  var DEBOUNCE_MS = 150;

  var bridgeDeps = null;
  var revealBound = false;
  var instructorBootstrapPending = false;
  var instructorBootstrapTimer = null;
  var emitDeckState = null;

  function completeInstructorBootstrap() {
    if (!instructorBootstrapPending) return;
    instructorBootstrapPending = false;
    if (instructorBootstrapTimer) {
      clearTimeout(instructorBootstrapTimer);
      instructorBootstrapTimer = null;
    }
    try {
      window.dispatchEvent(new CustomEvent('platform-bridge:bootstrap-ready'));
    } catch (e) {
      /* CustomEvent unavailable */
    }
  }

  function beginInstructorBootstrap() {
    if (
      bridgeDeps.getRole() !== 'instructor' ||
      bridgeDeps.isReviewMode() ||
      bridgeDeps.isSessionEnded()
    ) {
      return;
    }
    instructorBootstrapPending = true;
    if (instructorBootstrapTimer) {
      clearTimeout(instructorBootstrapTimer);
    }
    instructorBootstrapTimer = setTimeout(function () {
      completeInstructorBootstrap();
    }, 2000);
  }

  function isInstructorBootstrapPending() {
    return instructorBootstrapPending;
  }

  function applyDeckStateForInstructorBootstrap(payload) {
    if (!instructorBootstrapPending || typeof Reveal === 'undefined') return;
    bridgeDeps.setApplyingRemote(true);
    try {
      var state = Object.assign({}, payload, { overview: false });
      Reveal.setState(state);
    } finally {
      bridgeDeps.setApplyingRemote(false);
    }
    completeInstructorBootstrap();
  }

  function storeInstructorPosition(payload) {
    if (bridgeDeps.getRole() !== 'learner') return;
    if (window.PlatformBridgeCeiling) {
      PlatformBridgeCeiling.setInstructorPosition(payload);
    }
  }

  function bindReveal() {
    if (revealBound || typeof Reveal === 'undefined') return;
    revealBound = true;
    Reveal.on('slidechanged', emitDeckState);
    Reveal.on('fragmentshown', emitDeckState);
    Reveal.on('fragmenthidden', emitDeckState);
    Reveal.on('paused', emitDeckState);
    Reveal.on('resumed', emitDeckState);
  }

  function setFollowing(follow) {
    /* participant.follow WS dormant — ceiling model (doc 19 / ADR 010) */
    if (follow === false) return;
  }

  function applyDeckState(payload, options) {
    var force = options && options.force;
    if (!force && !bridgeDeps.shouldApplyDeckState()) return;
    if (typeof Reveal === 'undefined') return;
    bridgeDeps.setApplyingRemote(true);
    try {
      var prev = Reveal.getState();
      var state = Object.assign({}, payload, { overview: false });
      Reveal.setState(state);
      var next = Reveal.getState();
      var navigated =
        prev.indexh !== next.indexh ||
        prev.indexv !== next.indexv ||
        prev.indexf !== next.indexf;
      if (
        navigated &&
        window.PlatformBridgePolls &&
        typeof PlatformBridgePolls.onInstructorNavigationSync === 'function'
      ) {
        PlatformBridgePolls.onInstructorNavigationSync();
      }
    } finally {
      bridgeDeps.setApplyingRemote(false);
    }
    if (window.PlatformBridgeChrome && typeof PlatformBridgeChrome.updateSyncState === 'function') {
      PlatformBridgeChrome.updateSyncState();
    }
  }

  function receiveInstructorDeckState(payload) {
    var isLearner = bridgeDeps.getRole() === 'learner';
    var shouldApply = false;

    if (isLearner) {
      var previousInstructor = window.PlatformBridgeCeiling
        ? PlatformBridgeCeiling.getInstructorPosition()
        : null;
      var learnerPos = PlatformPositionUtils.positionFromReveal();
      shouldApply = PlatformPositionUtils.shouldApplyIncomingDeckState(
        learnerPos,
        previousInstructor
      );
      storeInstructorPosition(payload);

      if (bridgeDeps.isAnnotationEditingMode()) {
        bridgeDeps.setPendingInstructorDeckState(payload);
        return;
      }
      if (shouldApply) {
        applyDeckState(payload, { force: true });
      }
      return;
    }

    if (bridgeDeps.getRole() === 'instructor' && instructorBootstrapPending) {
      applyDeckStateForInstructorBootstrap(payload);
      return;
    }
    applyDeckState(payload);
  }

  function init(deps) {
    bridgeDeps = deps;
    emitDeckState = bridgeDeps.debounce(function () {
      if (
        !bridgeDeps.isCompatible() ||
        !bridgeDeps.isLive() ||
        bridgeDeps.getRole() !== 'instructor' ||
        bridgeDeps.isApplyingRemote()
      ) {
        return;
      }
      if (instructorBootstrapPending) return;
      if (!bridgeDeps.isTopLevelDeckWindow() || bridgeDeps.isReceiverFrame()) return;
      if (typeof Reveal === 'undefined') return;
      var state = Reveal.getState();
      if (state.overview) state.overview = false;
      bridgeDeps.wsSend({
        type: 'deck.state',
        session_id: bridgeDeps.getSessionId(),
        ts: Date.now(),
        payload: state,
      });
    }, DEBOUNCE_MS);
  }

  window.PlatformBridgeDeckSync = {
    init: init,
    bindReveal: bindReveal,
    setFollowing: setFollowing,
    beginInstructorBootstrap: beginInstructorBootstrap,
    isInstructorBootstrapPending: isInstructorBootstrapPending,
    receiveInstructorDeckState: receiveInstructorDeckState,
    emitDeckState: function () {
      if (emitDeckState) emitDeckState();
    },
    applyDeckState: applyDeckState,
  };
})();
