/**
 * Learner forward ceiling guard and instructor position store (doc 19).
 */
(function () {
  var bridgeDeps = null;
  var instructorPos = null;
  var lastAuthorizedPosition = null;
  var bound = false;

  function learnerDeckPosition() {
    return PlatformPositionUtils.positionFromReveal();
  }

  function setInstructorPosition(payload) {
    instructorPos = PlatformPositionUtils.positionFromState(payload);
    if (bridgeDeps && typeof bridgeDeps.onInstructorPositionChange === 'function') {
      bridgeDeps.onInstructorPositionChange(instructorPos);
    }
    if (!lastAuthorizedPosition && bridgeDeps && bridgeDeps.getRole() === 'learner') {
      lastAuthorizedPosition = learnerDeckPosition();
    }
    if (window.PlatformBridgeChrome && typeof PlatformBridgeChrome.updateSyncState === 'function') {
      PlatformBridgeChrome.updateSyncState();
    }
  }

  function getInstructorPosition() {
    return instructorPos;
  }

  function getInstructorSlideKey() {
    return instructorPos ? PlatformPositionUtils.keyFromPosition(instructorPos) : null;
  }

  function isLearnerAlignedWithInstructor() {
    if (!instructorPos) return false;
    return PlatformPositionUtils.compareSlidePosition(learnerDeckPosition(), instructorPos) === 0;
  }

  function revertToAuthorized() {
    if (typeof Reveal === 'undefined') return;
    var target = lastAuthorizedPosition || instructorPos;
    if (!target) return;
    bridgeDeps.setApplyingRemote(true);
    try {
      Reveal.setState(Object.assign({}, target, { overview: false }));
    } finally {
      bridgeDeps.setApplyingRemote(false);
    }
  }

  function onLocalNav() {
    if (!bridgeDeps || !bridgeDeps.isLive() || bridgeDeps.getRole() !== 'learner') return;
    if (bridgeDeps.isReviewMode()) return;
    if (bridgeDeps.isApplyingRemote()) return;
    if (!instructorPos) {
      lastAuthorizedPosition = learnerDeckPosition();
      PlatformBridgeChrome.updateSyncState();
      return;
    }
    var current = learnerDeckPosition();
    if (PlatformPositionUtils.compareSlidePosition(current, instructorPos) > 0) {
      revertToAuthorized();
    } else {
      lastAuthorizedPosition = current;
    }
    PlatformBridgeChrome.updateSyncState();
  }

  function bindRevealListeners() {
    if (bound || typeof Reveal === 'undefined') return;
    bound = true;
    Reveal.on('slidechanged', onLocalNav);
    Reveal.on('fragmentshown', onLocalNav);
    Reveal.on('fragmenthidden', onLocalNav);
  }

  function catchUpToInstructor() {
    if (!instructorPos || typeof Reveal === 'undefined') return;
    bridgeDeps.setApplyingRemote(true);
    try {
      Reveal.setState(Object.assign({}, instructorPos, { overview: false }));
      lastAuthorizedPosition = instructorPos;
      if (
        window.PlatformBridgeDeckSync &&
        typeof PlatformBridgeDeckSync.applyDeckState === 'function'
      ) {
        PlatformBridgeDeckSync.applyDeckState(instructorPos, { force: true });
      }
    } finally {
      bridgeDeps.setApplyingRemote(false);
    }
    PlatformBridgeChrome.updateSyncState();
  }

  function applyLocalNavigationPolicy() {
    if (typeof Reveal === 'undefined') return;
    Reveal.configure({ keyboard: true, touch: true });
    var controls = document.querySelector('.reveal .controls');
    if (controls) controls.style.display = '';
  }

  function init(deps) {
    bridgeDeps = deps;
    bindRevealListeners();
  }

  window.PlatformBridgeCeiling = {
    init: init,
    setInstructorPosition: setInstructorPosition,
    getInstructorPosition: getInstructorPosition,
    getInstructorSlideKey: getInstructorSlideKey,
    isLearnerAlignedWithInstructor: isLearnerAlignedWithInstructor,
    catchUpToInstructor: catchUpToInstructor,
    applyLocalNavigationPolicy: applyLocalNavigationPolicy,
    onLocalNav: onLocalNav,
  };
})();
