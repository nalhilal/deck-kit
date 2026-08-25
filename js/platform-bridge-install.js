/**
 * Live-module install helpers for platform bridge.
 */
(function () {
  var bridgeDeps = null;

  function initSlideNotes() {
    if (!window.PlatformSlideNotes || typeof PlatformSlideNotes.init !== 'function') {
      return;
    }
    PlatformSlideNotes.init({
      getSessionId: function () {
        return bridgeDeps.getSessionId();
      },
      getApiBase: bridgeDeps.getApiBase,
      isAuthenticated: function () {
        return bridgeDeps.getPlatformAuth().isAuthenticated;
      },
      isSessionDeck: bridgeDeps.shouldActivate,
      slideKeyFromReveal: bridgeDeps.slideKeyFromReveal,
      isReviewMode: bridgeDeps.isReviewMode,
      isLive: bridgeDeps.isLive,
      getInstructorSlideKey: bridgeDeps.getInstructorSlideKey,
    });
  }

  function installSlideNotes() {
    initSlideNotes();
    if (
      !window.PlatformSlideNotes ||
      typeof PlatformSlideNotes.loadAndSync !== 'function'
    ) {
      return Promise.resolve();
    }
    return PlatformSlideNotes.loadAndSync().then(function () {
      if (typeof PlatformSlideNotes.bindSlideHandlers === 'function') {
        PlatformSlideNotes.bindSlideHandlers();
      }
    });
  }

  function initFxPreferences() {
    if (!window.PlatformFxPreferences || typeof PlatformFxPreferences.init !== 'function') {
      return;
    }
    PlatformFxPreferences.init({
      getSessionId: function () {
        return bridgeDeps.getSessionId();
      },
      getApiBase: bridgeDeps.getApiBase,
      isAuthenticated: function () {
        return bridgeDeps.getPlatformAuth().isAuthenticated;
      },
      isSessionDeck: bridgeDeps.shouldActivate,
    });
  }

  function reloadFxPreferences() {
    if (
      !window.PlatformFxPreferences ||
      typeof PlatformFxPreferences.loadAndApply !== 'function'
    ) {
      return Promise.resolve();
    }
    return PlatformFxPreferences.loadAndApply();
  }

  function flushGuestArtifactsToServer() {
    var promises = [PlatformBridgeProgress.flushGuestStashToServer()];
    if (
      window.PlatformFxPreferences &&
      typeof PlatformFxPreferences.flushGuestFxToClaim === 'function'
    ) {
      promises.push(PlatformFxPreferences.flushGuestFxToClaim());
    }
    if (
      window.PlatformSlideNotes &&
      typeof PlatformSlideNotes.flushGuestNotesToServer === 'function'
    ) {
      promises.push(PlatformSlideNotes.flushGuestNotesToServer());
    }
    if (
      window.PlatformBridgeAnnotations &&
      typeof PlatformBridgeAnnotations.flushGuestAnnotationsToServer === 'function'
    ) {
      promises.push(PlatformBridgeAnnotations.flushGuestAnnotationsToServer());
    }
    return Promise.all(promises);
  }

  function installWhiteboard() {
    if (
      !window.PlatformBridgeWhiteboard ||
      typeof PlatformBridgeWhiteboard.install !== 'function'
    ) {
      return Promise.resolve();
    }
    return PlatformBridgeWhiteboard.install({
      getSessionId: function () {
        return bridgeDeps.getSessionId();
      },
      getRole: bridgeDeps.getRole,
      isLive: bridgeDeps.isLive,
      isReviewMode: bridgeDeps.isReviewMode,
      shouldMirrorInstructorContent: bridgeDeps.shouldMirrorInstructorContent,
      isNavigationLocked: bridgeDeps.isNavigationLocked,
      wsSend: bridgeDeps.wsSend,
      restoreConnectionStatus: bridgeDeps.restoreLiveConnectionStatus,
    });
  }

  function installAnnotations(readOnly) {
    if (
      !window.PlatformBridgeAnnotations ||
      typeof PlatformBridgeAnnotations.install !== 'function'
    ) {
      return Promise.resolve();
    }
    var auth = bridgeDeps.getPlatformAuth();
    return PlatformBridgeAnnotations.install({
      getSessionId: function () {
        return bridgeDeps.getSessionId();
      },
      getRole: bridgeDeps.getRole,
      getApiBase: bridgeDeps.getApiBase,
      isLive: bridgeDeps.isLive,
      isReviewMode: bridgeDeps.isReviewMode,
      isAuthenticated: function () {
        return auth.isAuthenticated;
      },
      isGuest: function () {
        return auth.isGuest;
      },
      isEnrolled: function () {
        return bridgeDeps.getRole() === 'learner';
      },
      slideKeyFromReveal: bridgeDeps.slideKeyFromReveal,
      readOnly: Boolean(readOnly),
    });
  }

  function installPollReplay() {
    if (
      !window.PlatformBridgePollReplay ||
      typeof PlatformBridgePollReplay.install !== 'function'
    ) {
      return Promise.resolve();
    }
    var auth = bridgeDeps.getPlatformAuth();
    return PlatformBridgePollReplay.install({
      getSessionId: function () {
        return bridgeDeps.getSessionId();
      },
      getApiBase: bridgeDeps.getApiBase,
      isReviewMode: bridgeDeps.isReviewMode,
      getRole: bridgeDeps.getRole,
      isAuthenticated: function () {
        return auth.isAuthenticated;
      },
    });
  }

  function installLiveModules() {
    if (window.PlatformBridgePolls) {
      PlatformBridgePolls.install({
        getSessionId: function () {
          return bridgeDeps.getSessionId();
        },
        getRole: bridgeDeps.getRole,
        isLive: bridgeDeps.isLive,
        isReviewMode: bridgeDeps.isReviewMode,
        getApiBase: bridgeDeps.getApiBase,
      });
    }
    var whiteboardPromise = installWhiteboard();
    return bridgeDeps.fetchPlatformAuth().then(function () {
      initFxPreferences();
      return Promise.all([
        whiteboardPromise,
        installAnnotations(false),
        flushGuestArtifactsToServer(),
        reloadFxPreferences(),
        installSlideNotes(),
      ]);
    });
  }

  function init(deps) {
    bridgeDeps = deps;
  }

  window.PlatformBridgeInstall = {
    init: init,
    initSlideNotes: initSlideNotes,
    installSlideNotes: installSlideNotes,
    initFxPreferences: initFxPreferences,
    reloadFxPreferences: reloadFxPreferences,
    flushGuestArtifactsToServer: flushGuestArtifactsToServer,
    installAnnotations: installAnnotations,
    installPollReplay: installPollReplay,
    installLiveModules: installLiveModules,
  };
})();
