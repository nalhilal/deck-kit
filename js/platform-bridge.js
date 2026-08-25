/**
 * Platform session bridge — Layer 2 connector (lobby, slide sync, review mode, progress).
 * Activates when ?session= and ?token= query params are present.
 */
(function () {
  var BRIDGE_API = 3;
  var followInstructor = true;
  var navigationLocked = false;
  var role = 'learner';
  var sessionId = '';
  var accessMode = 'live';
  var reviewMode = false;
  var isLive = false;
  var isCompatible = true;
  var compatMessage = '';
  var applyingRemote = false;
  var sessionEnded = false;
  var sessionStartsAt = null;
  var lastJoinCode = '';
  var currentToken = '';
  var platformAuth = {
    checked: false,
    isAuthenticated: false,
    isGuest: false,
    hasUser: false,
    displayName: '',
  };
  var pendingInstructorDeckState = null;

  function decodeTokenClaims(token) {
    return PlatformTokenUtils.decodeTokenClaims(token);
  }

  function slideKeyFromReveal() {
    return PlatformRevealUtils.slideKeyFromReveal();
  }

  function teardownLiveModules() {
    if (window.PlatformBridgePolls && typeof PlatformBridgePolls.teardownLivePollUi === 'function') {
      PlatformBridgePolls.teardownLivePollUi();
    }
    if (
      window.PlatformBridgeAnnotations &&
      typeof PlatformBridgeAnnotations.teardown === 'function'
    ) {
      PlatformBridgeAnnotations.teardown();
    }
    if (
      window.PlatformBridgeWhiteboard &&
      typeof PlatformBridgeWhiteboard.teardown === 'function'
    ) {
      PlatformBridgeWhiteboard.teardown();
    }
  }

  function getParams() {
    return new URLSearchParams(window.location.search);
  }

  function isShellEmbed() {
    return getParams().get('shell') === '1';
  }

  function isAudienceScreen() {
    return getParams().get('audience') === '1';
  }

  function showAudienceProjectorHint() {
    PlatformBridgeHints.showAudienceProjectorHint();
  }

  function notifyShellParent(status, connected) {
    if (!isShellEmbed() || window.parent === window) return;
    try {
      window.parent.postMessage(
        {
          type: 'platform-bridge:connection',
          status: status,
          connected: connected,
        },
        window.location.origin
      );
    } catch (e) {
      /* cross-origin parent */
    }
  }

  function getApiBase() {
    var p = getParams();
    if (p.has('api')) {
      return p.get('api').replace(/\/$/, '');
    }
    return '/api/v1';
  }

  function applySlideKey(key) {
    if (typeof Reveal === 'undefined' || !key) return;
    var match = /^(\d+)\/(\d+)$/.exec(key);
    if (!match) return;
    var h = parseInt(match[1], 10);
    var v = parseInt(match[2], 10);
    applyingRemote = true;
    try {
      var state = Reveal.getState();
      Reveal.setState(
        Object.assign({}, state, {
          indexh: h,
          indexv: v,
          indexf: 0,
          overview: false,
        })
      );
    } finally {
      applyingRemote = false;
    }
  }

  function purgeLegacyWhiteboardStorage() {
    if (
      window.cp2077WhiteboardStorage &&
      typeof window.cp2077WhiteboardStorage.clearLegacy === 'function'
    ) {
      window.cp2077WhiteboardStorage.clearLegacy();
    }
  }

  function clearWhiteboardStorageForSession(id) {
    if (
      window.cp2077WhiteboardStorage &&
      typeof window.cp2077WhiteboardStorage.clearSession === 'function'
    ) {
      window.cp2077WhiteboardStorage.clearSession(id);
    }
  }

  function flushGuestArtifactsToServer() {
    return PlatformBridgeInstall.flushGuestArtifactsToServer();
  }

  function initSlideNotes() {
    PlatformBridgeInstall.initSlideNotes();
  }

  function installSlideNotes() {
    return PlatformBridgeInstall.installSlideNotes();
  }

  function initFxPreferences() {
    PlatformBridgeInstall.initFxPreferences();
  }

  function reloadFxPreferences() {
    return PlatformBridgeInstall.reloadFxPreferences();
  }

  function installWhiteboard() {
    return PlatformBridgeInstall.installWhiteboard();
  }

  function installAnnotations(readOnly) {
    return PlatformBridgeInstall.installAnnotations(readOnly);
  }

  function installPollReplay() {
    return PlatformBridgeInstall.installPollReplay();
  }

  function installLiveModules() {
    return PlatformBridgeInstall.installLiveModules();
  }

  function swapTokenInUrl(newToken) {
    var p = getParams();
    p.set('token', newToken);
    var newUrl = window.location.pathname + '?' + p.toString();
    history.replaceState(null, '', newUrl);
  }

  function fetchPlatformAuth() {
    return fetch('/api/v1/auth/me', { credentials: 'include' })
      .then(function (res) {
        platformAuth.checked = true;
        if (!res.ok) {
          platformAuth.isAuthenticated = false;
          platformAuth.isGuest = false;
          platformAuth.hasUser = false;
          platformAuth.displayName = '';
          return;
        }
        return res.json().then(function (body) {
          var user = body && body.data && body.data.user;
          platformAuth.hasUser = Boolean(user);
          platformAuth.isGuest = Boolean(user && user.is_guest);
          platformAuth.isAuthenticated = Boolean(user && !user.is_guest);
          platformAuth.displayName =
            (user && (user.display_name || user.email)) || '';
          if (
            window.PlatformBridgeAnnotations &&
            typeof PlatformBridgeAnnotations.reloadFromServer === 'function'
          ) {
            PlatformBridgeAnnotations.reloadFromServer();
          }
        });
      })
      .catch(function () {
        platformAuth.checked = true;
        platformAuth.isAuthenticated = false;
        platformAuth.isGuest = false;
        platformAuth.hasUser = false;
        platformAuth.displayName = '';
      });
  }

  function isReceiverFrame() {
    return /\breceiver\b/i.test(window.location.search);
  }

  function isTopLevelDeckWindow() {
    try {
      return window.self === window.top;
    } catch (e) {
      return false;
    }
  }

  function shouldActivate() {
    if (isReceiverFrame()) return false;
    var p = getParams();
    return p.has('session') && p.has('token');
  }

  function getWsUrl(token) {
    var p = getParams();
    var base;
    if (p.has('ws')) {
      base = p.get('ws');
    } else {
      var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      base = proto + '//' + window.location.host + '/v1/realtime';
    }
    return base + '?token=' + encodeURIComponent(token);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(self, args);
      }, ms);
    };
  }

  function updateChrome(status, connected) {
    PlatformBridgeChrome.updateChrome(status, connected);
  }

  function restoreLiveConnectionStatus() {
    if (!isLive || sessionEnded || reviewMode) return;
    if (role === 'learner') {
      PlatformBridgeChrome.updateSyncState();
      return;
    }
    PlatformBridgeChrome.updateChrome('Connected', true);
  }

  function onInstructorPositionChange() {
    if (
      window.PlatformSlideNotes &&
      typeof PlatformSlideNotes.setInstructorSlideKey === 'function'
    ) {
      PlatformSlideNotes.setInstructorSlideKey(PlatformBridgeCeiling.getInstructorSlideKey());
    }
  }

  function enterReviewMode() {
    return PlatformBridgeSession.enterReviewMode();
  }

  function handleSessionEnded(endedPayload) {
    PlatformBridgeSession.handleSessionEnded(endedPayload);
  }

  function isNavigationLocked() {
    return navigationLocked;
  }

  function isAnnotationEditingMode() {
    return PlatformBridgeAnnotationHold.isAnnotationEditingMode();
  }

  function shouldApplyDeckState() {
    return PlatformBridgeAnnotationHold.shouldApplyDeckState();
  }

  function bindAnnotationDrawModeHold() {
    PlatformBridgeAnnotationHold.bindAnnotationDrawModeHold();
  }

  function resyncInstructorDeckAfterDrawExit() {
    PlatformBridgeAnnotationHold.resyncInstructorDeckAfterDrawExit();
  }

  function shouldMirrorInstructorContent() {
    return PlatformBridgeCeiling.isLearnerAlignedWithInstructor();
  }

  function applyLocalNavigationPolicy() {
    PlatformBridgeCeiling.applyLocalNavigationPolicy();
  }

  function setNavigationLocked(locked) {
    navigationLocked = !!locked;
    applyLocalNavigationPolicy();
  }

  function wsSend(msg) {
    PlatformBridgeConnection.wsSend(msg);
  }

  function bindReveal() {
    PlatformBridgeDeckSync.bindReveal();
  }

  function setFollowing(follow) {
    followInstructor = follow !== false;
    PlatformBridgeDeckSync.setFollowing(follow);
  }

  function receiveInstructorDeckState(payload) {
    PlatformBridgeDeckSync.receiveInstructorDeckState(payload);
  }

  function handleWsMessage(msg) {
    PlatformBridgeSession.handleWsMessage(msg);
  }

  function connect(token) {
    PlatformBridgeConnection.connect(token);
  }

  function updateToken(newToken) {
    PlatformBridgeConnection.updateToken(newToken);
  }

  function initBridgeModules() {
    PlatformBridgeModules.init({
      getBridgeApi: function () {
        return BRIDGE_API;
      },
      isAudienceScreen: isAudienceScreen,
      notifyShellParent: notifyShellParent,
      isLive: function () {
        return isLive;
      },
      getRole: function () {
        return role;
      },
      isReviewMode: function () {
        return reviewMode;
      },
      isApplyingRemote: function () {
        return applyingRemote;
      },
      setApplyingRemote: function (value) {
        applyingRemote = value;
      },
      onInstructorPositionChange: onInstructorPositionChange,
      getPendingInstructorDeckState: function () {
        return pendingInstructorDeckState;
      },
      setPendingInstructorDeckState: function (payload) {
        pendingInstructorDeckState = payload;
      },
      shouldApplyDeckState: shouldApplyDeckState,
      isAnnotationEditingMode: isAnnotationEditingMode,
      isFollowing: function () {
        return followInstructor;
      },
      debounce: debounce,
      getSessionId: function () {
        return sessionId;
      },
      wsSend: wsSend,
      isSessionEnded: function () {
        return sessionEnded;
      },
      isCompatible: function () {
        return isCompatible;
      },
      isTopLevelDeckWindow: isTopLevelDeckWindow,
      isReceiverFrame: isReceiverFrame,
      getApiBase: getApiBase,
      getPlatformAuth: function () {
        return platformAuth;
      },
      shouldActivate: shouldActivate,
      slideKeyFromReveal: slideKeyFromReveal,
      shouldMirrorInstructorContent: shouldMirrorInstructorContent,
      restoreLiveConnectionStatus: restoreLiveConnectionStatus,
      fetchPlatformAuth: fetchPlatformAuth,
      setLive: function (value) {
        isLive = value;
      },
      getSessionStartsAt: function () {
        return sessionStartsAt;
      },
      getLastJoinCode: function () {
        return lastJoinCode;
      },
      setLastJoinCode: function (code) {
        lastJoinCode = code;
      },
      setSessionEnded: function (value) {
        sessionEnded = value;
      },
      getFollowInstructor: function () {
        return followInstructor;
      },
      setFollowInstructor: function (value) {
        followInstructor = value;
      },
      applySlideKey: applySlideKey,
      getWsUrl: getWsUrl,
      getAccessMode: function () {
        return accessMode;
      },
      getCurrentToken: function () {
        return currentToken;
      },
      setCurrentToken: function (token) {
        currentToken = token;
      },
      swapTokenInUrl: swapTokenInUrl,
      handleWsMessage: handleWsMessage,
      setReviewMode: function (value) {
        reviewMode = value;
      },
      setAccessMode: function (value) {
        accessMode = value;
      },
      setNavigationLocked: setNavigationLocked,
      teardownLiveModules: teardownLiveModules,
      bindReveal: bindReveal,
      applyLocalNavigationPolicy: applyLocalNavigationPolicy,
      flushGuestArtifactsToServer: flushGuestArtifactsToServer,
      installPollReplay: installPollReplay,
      installAnnotations: installAnnotations,
      installSlideNotes: installSlideNotes,
      setSessionStartsAt: function (value) {
        sessionStartsAt = value;
      },
      clearWhiteboardStorageForSession: clearWhiteboardStorageForSession,
      purgeLegacyWhiteboardStorage: purgeLegacyWhiteboardStorage,
      setRole: function (value) {
        role = value;
      },
      evaluateCompatibility: PlatformBridgeCompat.evaluateCompatibility,
      setCompatible: function (value) {
        isCompatible = value;
      },
      setCompatMessage: function (message) {
        compatMessage = message;
      },
      showCompatWarning: PlatformBridgeCompat.showCompatWarning,
      hideCompatWarning: PlatformBridgeCompat.hideCompatWarning,
      beginInstructorBootstrap: function () {
        PlatformBridgeDeckSync.beginInstructorBootstrap();
      },
      isInstructorBootstrapPending: function () {
        return PlatformBridgeDeckSync.isInstructorBootstrapPending();
      },
      installLiveModules: installLiveModules,
      emitDeckState: function () {
        PlatformBridgeDeckSync.emitDeckState();
      },
      showAudienceProjectorHint: showAudienceProjectorHint,
      receiveInstructorDeckState: receiveInstructorDeckState,
    });
  }

  function init() {
    if (!shouldActivate()) return;

    initBridgeModules();

    var p = getParams();
    sessionId = p.get('session');
    var token = p.get('token');
    currentToken = token || '';
    if (isShellEmbed()) {
      document.documentElement.classList.add('platform-shell-embed');
    }
    var claims = decodeTokenClaims(token);
    accessMode = claims.access_mode === 'review' || claims.access_mode === 'preview'
      ? claims.access_mode
      : 'live';
    if (claims.role === 'instructor' || claims.role === 'learner') {
      role = claims.role;
    }

    updateChrome('Initializing…', false);
    initFxPreferences();
    initSlideNotes();
    fetchPlatformAuth()
      .then(function () {
        return reloadFxPreferences();
      })
      .then(function () {
        if (accessMode === 'review' || accessMode === 'preview') {
          PlatformBridgeSession.enterReviewMode();
          return;
        }
        connect(token);
      });
  }

  window.PlatformBridge = {
    init: init,
    bindAnnotationDrawModeHold: bindAnnotationDrawModeHold,
    shouldActivate: shouldActivate,
    getApiBase: getApiBase,
    isAuthenticated: function () {
      return platformAuth.isAuthenticated;
    },
    isGuest: function () {
      return platformAuth.isGuest;
    },
    slideKeyFromReveal: slideKeyFromReveal,
    getRole: function () {
      return role;
    },
    getSessionId: function () {
      return sessionId;
    },
    isLive: function () {
      return isLive;
    },
    isReviewMode: function () {
      return reviewMode;
    },
    isFollowing: function () {
      return followInstructor;
    },
    isNavigationLocked: isNavigationLocked,
    setNavigationLocked: setNavigationLocked,
    setFollowing: setFollowing,
    getInstructorPosition: function () {
      return PlatformBridgeCeiling.getInstructorPosition();
    },
    getInstructorSlideKey: function () {
      return PlatformBridgeCeiling.getInstructorSlideKey();
    },
    catchUpToInstructor: function () {
      PlatformBridgeCeiling.catchUpToInstructor();
    },
    enterLiveMode: function () {
      PlatformBridgeSession.enterLiveMode();
    },
    receiveInstructorDeckState: receiveInstructorDeckState,
    resyncInstructorDeckAfterDrawExit: resyncInstructorDeckAfterDrawExit,
    polls: {
      getDefinitionForSlide: function (slideKey) {
        return window.PlatformBridgePolls
          ? PlatformBridgePolls.getDefinitionForSlide(slideKey)
          : null;
      },
      openPoll: function (definition) {
        if (window.PlatformBridgePolls) PlatformBridgePolls.openPoll(definition);
      },
      closePoll: function () {
        if (window.PlatformBridgePolls) PlatformBridgePolls.closePoll();
      },
      getMyResponse: function (pollId) {
        return window.PlatformBridgePollReplay &&
          typeof PlatformBridgePollReplay.getMyResponse === 'function'
          ? PlatformBridgePollReplay.getMyResponse(pollId)
          : null;
      },
      getParticipationSummary: function () {
        return window.PlatformBridgePollReplay &&
          typeof PlatformBridgePollReplay.getParticipationSummary === 'function'
          ? PlatformBridgePollReplay.getParticipationSummary()
          : { answered: 0, inDeck: 0 };
      },
    },
    annotations: {
      flush: function () {
        return window.PlatformBridgeAnnotations &&
          typeof PlatformBridgeAnnotations.flush === 'function'
          ? PlatformBridgeAnnotations.flush()
          : Promise.resolve();
      },
    },
    destroy: function () {
      PlatformBridgeConnection.stopPing();
      if (
        window.PlatformBridgeAnnotations &&
        typeof PlatformBridgeAnnotations.teardown === 'function'
      ) {
        PlatformBridgeAnnotations.teardown();
      }
      if (
        window.PlatformBridgeWhiteboard &&
        typeof PlatformBridgeWhiteboard.teardown === 'function'
      ) {
        PlatformBridgeWhiteboard.teardown();
      }
      if (
        window.PlatformBridgePollReplay &&
        typeof PlatformBridgePollReplay.teardown === 'function'
      ) {
        PlatformBridgePollReplay.teardown();
      }
      sessionEnded = true;
      reviewMode = false;
      accessMode = 'live';
      PlatformBridgeConnection.closeConnection();
      isLive = false;
      PlatformBridgeLobby.hideLobby();
      PlatformBridgeLobby.clearEndedOverlay();
      sessionEnded = false;
    },
    updateToken: updateToken,
  };

  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) return;
    if (
      event.data &&
      event.data.type === 'platform-bridge:update-token' &&
      event.data.token
    ) {
      updateToken(event.data.token);
    }
  });
})();
