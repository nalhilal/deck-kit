/**
 * Bridge module wiring — extracted from platform-bridge.js for file-size cap.
 */
(function () {
  function initBridgeModules(ctx) {
    PlatformBridgeCeiling.init({
      isLive: ctx.isLive,
      getRole: ctx.getRole,
      isReviewMode: ctx.isReviewMode,
      isApplyingRemote: ctx.isApplyingRemote,
      setApplyingRemote: ctx.setApplyingRemote,
      onInstructorPositionChange: ctx.onInstructorPositionChange,
    });

    PlatformBridgeAnnotationHold.init({
      isLive: ctx.isLive,
      getRole: ctx.getRole,
      isReviewMode: ctx.isReviewMode,
      getLearnerDeckPosition: function () {
        return PlatformPositionUtils.positionFromReveal();
      },
      getInstructorPosition: function () {
        return PlatformBridgeCeiling.getInstructorPosition();
      },
      getPendingInstructorDeckState: ctx.getPendingInstructorDeckState,
      setPendingInstructorDeckState: ctx.setPendingInstructorDeckState,
    });

    PlatformBridgeHints.init({
      isAudienceScreen: ctx.isAudienceScreen,
      getRole: ctx.getRole,
    });

    PlatformBridgeCompat.init({
      getBridgeApi: ctx.getBridgeApi,
    });

    PlatformBridgeChrome.init({
      notifyShellParent: ctx.notifyShellParent,
      isLive: ctx.isLive,
      getRole: ctx.getRole,
      isReviewMode: ctx.isReviewMode,
      getInstructorPosition: function () {
        return PlatformBridgeCeiling.getInstructorPosition();
      },
      catchUpToInstructor: function () {
        PlatformBridgeCeiling.catchUpToInstructor();
      },
    });

    PlatformBridgeDeckSync.init({
      debounce: ctx.debounce,
      getSessionId: ctx.getSessionId,
      wsSend: ctx.wsSend,
      getRole: ctx.getRole,
      isReviewMode: ctx.isReviewMode,
      isSessionEnded: ctx.isSessionEnded,
      setApplyingRemote: ctx.setApplyingRemote,
      isApplyingRemote: ctx.isApplyingRemote,
      shouldApplyDeckState: ctx.shouldApplyDeckState,
      isAnnotationEditingMode: ctx.isAnnotationEditingMode,
      setPendingInstructorDeckState: ctx.setPendingInstructorDeckState,
      isCompatible: ctx.isCompatible,
      isLive: ctx.isLive,
      isTopLevelDeckWindow: ctx.isTopLevelDeckWindow,
      isReceiverFrame: ctx.isReceiverFrame,
    });

    PlatformBridgeInstall.init({
      getSessionId: ctx.getSessionId,
      getApiBase: ctx.getApiBase,
      getPlatformAuth: ctx.getPlatformAuth,
      shouldActivate: ctx.shouldActivate,
      slideKeyFromReveal: ctx.slideKeyFromReveal,
      isReviewMode: ctx.isReviewMode,
      isLive: ctx.isLive,
      getRole: ctx.getRole,
      shouldMirrorInstructorContent: ctx.shouldMirrorInstructorContent,
      wsSend: ctx.wsSend,
      restoreLiveConnectionStatus: ctx.restoreLiveConnectionStatus,
      fetchPlatformAuth: ctx.fetchPlatformAuth,
      getInstructorSlideKey: function () {
        return PlatformBridgeCeiling.getInstructorSlideKey();
      },
    });

    PlatformBridgeLobby.init({
      getSessionId: ctx.getSessionId,
      getRole: ctx.getRole,
      isCompatible: ctx.isCompatible,
      isLive: ctx.isLive,
      setLive: ctx.setLive,
      getSessionStartsAt: ctx.getSessionStartsAt,
      getLastJoinCode: ctx.getLastJoinCode,
      setLastJoinCode: ctx.setLastJoinCode,
      getPlatformAuth: ctx.getPlatformAuth,
      fetchPlatformAuth: ctx.fetchPlatformAuth,
      updateChrome: PlatformBridgeChrome.updateChrome,
      isSessionEnded: ctx.isSessionEnded,
      setSessionEnded: ctx.setSessionEnded,
    });

    PlatformBridgeProgress.init({
      getSessionId: ctx.getSessionId,
      getApiBase: ctx.getApiBase,
      getPlatformAuth: ctx.getPlatformAuth,
      slideKeyFromReveal: ctx.slideKeyFromReveal,
      getFollowInstructor: ctx.getFollowInstructor,
      setFollowInstructor: ctx.setFollowInstructor,
      applySlideKey: ctx.applySlideKey,
      isLive: ctx.isLive,
      isReviewMode: ctx.isReviewMode,
      debounce: ctx.debounce,
    });

    PlatformBridgeConnection.init({
      getSessionId: ctx.getSessionId,
      getWsUrl: ctx.getWsUrl,
      updateChrome: PlatformBridgeChrome.updateChrome,
      isLive: ctx.isLive,
      isReviewMode: ctx.isReviewMode,
      isSessionEnded: ctx.isSessionEnded,
      getAccessMode: ctx.getAccessMode,
      getCurrentToken: ctx.getCurrentToken,
      setCurrentToken: ctx.setCurrentToken,
      swapTokenInUrl: ctx.swapTokenInUrl,
      handleWsMessage: ctx.handleWsMessage,
    });

    PlatformBridgeSession.init({
      setReviewMode: ctx.setReviewMode,
      setAccessMode: ctx.setAccessMode,
      setLive: ctx.setLive,
      setSessionEnded: ctx.setSessionEnded,
      isSessionEnded: ctx.isSessionEnded,
      isReviewMode: ctx.isReviewMode,
      setNavigationLocked: ctx.setNavigationLocked,
      teardownLiveModules: ctx.teardownLiveModules,
      bindReveal: ctx.bindReveal,
      applyLocalNavigationPolicy: ctx.applyLocalNavigationPolicy,
      flushGuestArtifactsToServer: ctx.flushGuestArtifactsToServer,
      installPollReplay: ctx.installPollReplay,
      installAnnotations: ctx.installAnnotations,
      installSlideNotes: ctx.installSlideNotes,
      getApiBase: ctx.getApiBase,
      getSessionId: ctx.getSessionId,
      swapTokenInUrl: ctx.swapTokenInUrl,
      setSessionStartsAt: ctx.setSessionStartsAt,
      getSessionStartsAt: ctx.getSessionStartsAt,
      clearWhiteboardStorageForSession: ctx.clearWhiteboardStorageForSession,
      getPlatformAuth: ctx.getPlatformAuth,
      fetchPlatformAuth: ctx.fetchPlatformAuth,
      purgeLegacyWhiteboardStorage: ctx.purgeLegacyWhiteboardStorage,
      isCompatible: ctx.isCompatible,
      setRole: ctx.setRole,
      getRole: ctx.getRole,
      setFollowInstructor: ctx.setFollowInstructor,
      setLastJoinCode: ctx.setLastJoinCode,
      evaluateCompatibility: ctx.evaluateCompatibility,
      setCompatible: ctx.setCompatible,
      setCompatMessage: ctx.setCompatMessage,
      showCompatWarning: ctx.showCompatWarning,
      hideCompatWarning: ctx.hideCompatWarning,
      beginInstructorBootstrap: ctx.beginInstructorBootstrap,
      isInstructorBootstrapPending: ctx.isInstructorBootstrapPending,
      installLiveModules: ctx.installLiveModules,
      emitDeckState: ctx.emitDeckState,
      showAudienceProjectorHint: ctx.showAudienceProjectorHint,
      receiveInstructorDeckState: ctx.receiveInstructorDeckState,
    });
  }

  window.PlatformBridgeModules = {
    init: initBridgeModules,
  };
})();
