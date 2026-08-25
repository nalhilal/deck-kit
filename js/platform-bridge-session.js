/**
 * Session lifecycle: review mode, live entry, ended handling, WS dispatch.
 */
(function () {
  var bridgeDeps = null;

  function enterReviewMode() {
    bridgeDeps.setReviewMode(true);
    bridgeDeps.setAccessMode('review');
    bridgeDeps.setLive(false);
    bridgeDeps.setSessionEnded(false);
    bridgeDeps.setNavigationLocked(false);
    bridgeDeps.teardownLiveModules();
    PlatformBridgeLobby.clearEndedOverlay();
    PlatformBridgeLobby.hideLobby();
    bridgeDeps.bindReveal();
    PlatformBridgeProgress.bindProgressHandlers();
    bridgeDeps.applyLocalNavigationPolicy();
    PlatformBridgeChrome.updateChrome('Review mode', false);

    var pendingStash = PlatformBridgeProgress.readGuestProgressStash();

    return bridgeDeps.flushGuestArtifactsToServer().then(function () {
      return Promise.all([
        PlatformBridgeProgress.fetchProgress(),
        bridgeDeps.installPollReplay(),
        bridgeDeps.installAnnotations(true),
        bridgeDeps.installSlideNotes(),
      ]);
    }).then(function (results) {
      var progress = results[0];
      PlatformBridgeProgress.restoreProgressDeferred(progress || pendingStash);
    });
  }

  function fetchReviewLaunchAndEnter() {
    return fetch(
      bridgeDeps.getApiBase() +
        '/sessions/' +
        encodeURIComponent(bridgeDeps.getSessionId()) +
        '/review-launch',
      {
        method: 'POST',
        credentials: 'include',
      }
    )
      .then(function (res) {
        if (!res.ok) throw new Error('review-launch failed');
        return res.json();
      })
      .then(function (body) {
        var launch = body && body.data && body.data.launch;
        if (!launch || !launch.query || !launch.query.token) {
          throw new Error('bad launch payload');
        }
        bridgeDeps.swapTokenInUrl(launch.query.token);
        return enterReviewMode();
      });
  }

  function handleSessionEnded(endedPayload) {
    if (bridgeDeps.isSessionEnded() || bridgeDeps.isReviewMode()) return;
    if (endedPayload && endedPayload.starts_at !== undefined) {
      bridgeDeps.setSessionStartsAt(endedPayload.starts_at);
    }
    var cancelled = PlatformBridgeLobby.isSessionCancelled(endedPayload);

    bridgeDeps.teardownLiveModules();
    bridgeDeps.clearWhiteboardStorageForSession(bridgeDeps.getSessionId());

    if (!bridgeDeps.getPlatformAuth().isAuthenticated) {
      PlatformBridgeProgress.stashGuestProgress();
    }

    PlatformBridgeConnection.closeConnection();

    PlatformBridgeProgress.flushProgress()
      .then(function () {
        bridgeDeps.setLive(false);
        return bridgeDeps.fetchPlatformAuth();
      })
      .then(function () {
        if (
          !cancelled &&
          bridgeDeps.getPlatformAuth().isAuthenticated &&
          bridgeDeps.getRole() === 'learner'
        ) {
          return fetchReviewLaunchAndEnter().catch(function () {
            PlatformBridgeLobby.showSessionEndedOverlay(cancelled);
            PlatformBridgeChrome.updateChrome(
              cancelled ? 'Session cancelled' : 'Session ended',
              false
            );
          });
        }
        PlatformBridgeLobby.showSessionEndedOverlay(cancelled);
        PlatformBridgeChrome.updateChrome(
          cancelled ? 'Session cancelled' : 'Session ended',
          false
        );
      });
  }

  function enterLiveMode() {
    if (!bridgeDeps.isCompatible()) return;
    bridgeDeps.setLive(true);
    bridgeDeps.purgeLegacyWhiteboardStorage();
    PlatformBridgeLobby.hideLobby();
    bridgeDeps.bindReveal();
    PlatformBridgeProgress.bindProgressHandlers();
    PlatformBridgeChrome.updateChrome('Connected', true);
    bridgeDeps.applyLocalNavigationPolicy();
    if (bridgeDeps.getRole() === 'instructor' && !bridgeDeps.isInstructorBootstrapPending()) {
      bridgeDeps.emitDeckState();
      bridgeDeps.showAudienceProjectorHint();
    } else if (bridgeDeps.getRole() === 'instructor') {
      bridgeDeps.showAudienceProjectorHint();
    }
  }

  function handleConnectionAck(payload) {
    bridgeDeps.setRole(payload.participant.role);
    bridgeDeps.setFollowInstructor(payload.participant.follow_instructor);
    bridgeDeps.setNavigationLocked(!!payload.learner_navigation_locked);
    bridgeDeps.setSessionStartsAt(payload.starts_at || null);
    if (payload.join_code) {
      bridgeDeps.setLastJoinCode(payload.join_code);
    }

    var compat = bridgeDeps.evaluateCompatibility(payload);
    bridgeDeps.setCompatible(compat.ok);
    bridgeDeps.setCompatMessage(compat.message);
    if (!compat.ok) {
      PlatformBridgeLobby.hideLobby();
      bridgeDeps.showCompatWarning(compat.message);
      PlatformBridgeChrome.updateChrome('Deck update required', false);
      return;
    }
    bridgeDeps.hideCompatWarning();

    if (payload.session_status === 'scheduled') {
      bridgeDeps.fetchPlatformAuth().then(function () {
        PlatformBridgeLobby.showLobby(payload);
      });
      return;
    }

    if (payload.session_status === 'live') {
      if (payload.participant.role === 'instructor') {
        bridgeDeps.beginInstructorBootstrap();
      }
      enterLiveMode();
      bridgeDeps.installLiveModules();
      return;
    }

    if (payload.session_status === 'ended') {
      handleSessionEnded(payload);
    }
  }

  function handleWsMessage(msg) {
    if (msg.type === 'connection.ack') {
      handleConnectionAck(msg.payload);
    } else if (msg.type === 'session.started') {
      if (bridgeDeps.isCompatible()) {
        if (!bridgeDeps.getSessionStartsAt()) {
          bridgeDeps.setSessionStartsAt(new Date().toISOString());
        }
        enterLiveMode();
        bridgeDeps.installLiveModules();
      }
    } else if (msg.type === 'session.lobby_updated') {
      if (
        !bridgeDeps.isLive() &&
        bridgeDeps.isCompatible() &&
        !bridgeDeps.isSessionEnded() &&
        !bridgeDeps.isReviewMode()
      ) {
        var lobbyData = PlatformBridgeLobby.mergeLobbyData(msg.payload);
        bridgeDeps.fetchPlatformAuth().then(function () {
          PlatformBridgeLobby.showLobby(lobbyData);
        });
      }
    } else if (msg.type === 'session.navigation_lock') {
      bridgeDeps.setNavigationLocked(!!(msg.payload && msg.payload.locked));
    } else if (msg.type === 'deck.state') {
      bridgeDeps.receiveInstructorDeckState(msg.payload);
    } else if (msg.type === 'session.ended') {
      handleSessionEnded(msg.payload);
    } else if (msg.type === 'poll.open' && window.PlatformBridgePolls) {
      PlatformBridgePolls.handlePollOpen(msg.payload);
    } else if (msg.type === 'poll.close' && window.PlatformBridgePolls) {
      PlatformBridgePolls.handlePollClose(msg.payload);
    } else if (msg.type === 'poll.results' && window.PlatformBridgePolls) {
      PlatformBridgePolls.handlePollResults(msg.payload);
    } else if (msg.type === 'whiteboard.scene' && window.PlatformBridgeWhiteboard) {
      PlatformBridgeWhiteboard.handleRemoteScene(msg.payload);
    } else if (msg.type === 'error') {
      if (msg.payload && msg.payload.code === 'SESSION_ENDED') {
        handleSessionEnded(msg.payload);
        return;
      }
      if (!bridgeDeps.isLive() && msg.payload && msg.payload.code === 'FORBIDDEN') {
        return;
      }
      if (
        msg.payload &&
        msg.payload.code === 'BAD_REQUEST' &&
        window.PlatformBridgeWhiteboard &&
        typeof PlatformBridgeWhiteboard.handleServerError === 'function' &&
        PlatformBridgeWhiteboard.handleServerError(msg.payload.message)
      ) {
        return;
      }
      PlatformBridgeChrome.updateChrome(msg.payload.message || 'Error', false);
    }
  }

  function init(deps) {
    bridgeDeps = deps;
  }

  window.PlatformBridgeSession = {
    init: init,
    enterReviewMode: enterReviewMode,
    handleSessionEnded: handleSessionEnded,
    enterLiveMode: enterLiveMode,
    handleConnectionAck: handleConnectionAck,
    handleWsMessage: handleWsMessage,
  };
})();
