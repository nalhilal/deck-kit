/**
 * Annotation draw-mode hold: buffer instructor deck state while drawing.
 */
(function () {
  var bridgeDeps = null;
  var annotationDrawModeUnsub = null;

  var alignedWhenDrawStarted = false;

  function isAnnotationEditingMode() {
    return (
      window.PlatformAnnotationTools &&
      typeof PlatformAnnotationTools.isEditingMode === 'function' &&
      PlatformAnnotationTools.isEditingMode()
    );
  }

  function isAlignedWithInstructor() {
    var instructorPos = bridgeDeps.getInstructorPosition();
    if (!instructorPos) return false;
    return (
      PlatformPositionUtils.compareSlidePosition(
        bridgeDeps.getLearnerDeckPosition(),
        instructorPos
      ) === 0
    );
  }

  function shouldApplyDeckState() {
    if (!bridgeDeps.isLive() || bridgeDeps.getRole() !== 'learner') return false;
    if (bridgeDeps.isReviewMode()) return false;
    if (isAnnotationEditingMode()) return false;
    return isAlignedWithInstructor();
  }

  function shouldResyncOnDrawExit() {
    if (bridgeDeps.isFollowing && !bridgeDeps.isFollowing()) {
      return false;
    }
    return alignedWhenDrawStarted || !!bridgeDeps.getPendingInstructorDeckState();
  }

  function onAnnotationDrawingModeChange(isOn) {
    if (isOn) {
      alignedWhenDrawStarted = isAlignedWithInstructor();
      return;
    }
    var pending = bridgeDeps.getPendingInstructorDeckState();
    if (shouldResyncOnDrawExit() && pending) {
      PlatformBridgeDeckSync.applyDeckState(pending, { force: true });
      bridgeDeps.setPendingInstructorDeckState(null);
    }
    alignedWhenDrawStarted = false;
  }

  function resyncInstructorDeckAfterDrawExit() {
    onAnnotationDrawingModeChange(false);
  }

  function bindAnnotationDrawModeHold() {
    if (annotationDrawModeUnsub) {
      annotationDrawModeUnsub();
      annotationDrawModeUnsub = null;
    }
    if (
      !window.PlatformAnnotationTools ||
      typeof PlatformAnnotationTools.onDrawingModeChange !== 'function'
    ) {
      return;
    }
    annotationDrawModeUnsub = PlatformAnnotationTools.onDrawingModeChange(
      onAnnotationDrawingModeChange
    );
  }

  function init(deps) {
    bridgeDeps = deps;
  }

  window.PlatformBridgeAnnotationHold = {
    init: init,
    isAnnotationEditingMode: isAnnotationEditingMode,
    shouldApplyDeckState: shouldApplyDeckState,
    bindAnnotationDrawModeHold: bindAnnotationDrawModeHold,
    resyncInstructorDeckAfterDrawExit: resyncInstructorDeckAfterDrawExit,
  };
})();
