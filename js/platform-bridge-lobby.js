/**
 * Lobby and session-ended overlays for platform bridge.
 */
(function () {
  var bridgeDeps = null;
  var lobbyData = null;

  function escapeHtml(text) {
    return PlatformDomUtils.escapeHtml(text);
  }

  function ensureLobby() {
    var el = document.getElementById('platform-lobby-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'platform-lobby-overlay';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    return el;
  }

  function formatScheduledAt(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch (e) {
      return '';
    }
  }

  function buildLinksHtml(links) {
    if (!links || !links.length) return '';
    var items = links
      .map(function (link) {
        return (
          '<li><a class="platform-lobby-link" href="' +
          escapeHtml(link.url) +
          '" target="_blank" rel="noopener noreferrer">' +
          escapeHtml(link.label) +
          '</a></li>'
        );
      })
      .join('');
    return '<ul class="platform-lobby-links">' + items + '</ul>';
  }

  function qrImageUrl(joinCode, joinUrl) {
    var base = joinUrl ? new URL(joinUrl).origin : window.location.origin;
    return base + '/join/' + encodeURIComponent(joinCode) + '/qr';
  }

  function buildLearnerAuthUrl(path, joinCode) {
    var origin = window.location.origin;
    var payload = {
      session_id: bridgeDeps.getSessionId(),
      join_code: joinCode || '',
      intent: 'live',
    };
    return (
      origin +
      path +
      '?return_to=' +
      encodeURIComponent(JSON.stringify(payload))
    );
  }

  function buildLearnerSignedInHtml() {
    var auth = bridgeDeps.getPlatformAuth();
    var name = auth.displayName || 'your account';
    return (
      '<div class="platform-lobby-auth platform-lobby-signed-in">' +
      '<p class="platform-lobby-auth-label">Signed in as ' +
      escapeHtml(name) +
      '</p>' +
      '<p class="platform-lobby-signed-in-link">' +
      '<a class="platform-lobby-link" href="' +
      escapeHtml(window.location.origin + '/my/sessions') +
      '">My sessions</a>' +
      '</p>' +
      '</div>'
    );
  }

  function buildLearnerAccountSection(joinCode) {
    var auth = bridgeDeps.getPlatformAuth();
    if (auth.isAuthenticated) {
      return buildLearnerSignedInHtml();
    }
    return buildLearnerAuthCtas(joinCode);
  }

  function buildLearnerAuthCtas(joinCode) {
    var signupUrl = buildLearnerAuthUrl('/join/signup', joinCode);
    var loginUrl = buildLearnerAuthUrl('/join/login', joinCode);
    return (
      '<div class="platform-lobby-auth">' +
      '<p class="platform-lobby-auth-label">Save your progress across devices</p>' +
      '<div class="platform-lobby-auth-actions">' +
      '<a class="platform-lobby-auth-btn platform-lobby-auth-btn-primary" href="' +
      escapeHtml(signupUrl) +
      '">Sign up</a>' +
      '<a class="platform-lobby-auth-btn" href="' +
      escapeHtml(loginUrl) +
      '">Log in</a>' +
      '</div>' +
      '</div>'
    );
  }

  function showLobby(payload) {
    if (!bridgeDeps.isCompatible()) return;
    lobbyData = payload;
    bridgeDeps.setLive(false);
    document.documentElement.classList.add('platform-lobby-active');

    var overlay = ensureLobby();
    var lobby = payload.lobby || {};
    var title = lobby.title || payload.session_title || 'Session';
    var message = lobby.message || '';
    var linksHtml = buildLinksHtml(lobby.links);
    var scheduledHtml = payload.scheduled_at
      ? '<p class="platform-lobby-scheduled">Planned start: ' +
        escapeHtml(formatScheduledAt(payload.scheduled_at)) +
        '</p>'
      : '';
    var role = bridgeDeps.getRole();

    if (role === 'instructor') {
      var joinCode = payload.join_code || '';
      var joinUrl = payload.join_url || '';
      overlay.innerHTML =
        '<div class="platform-lobby-card platform-lobby-instructor">' +
        '<p class="platform-lobby-eyebrow">Join session</p>' +
        '<h1 class="platform-lobby-title">' +
        escapeHtml(title) +
        '</h1>' +
        scheduledHtml +
        '<p class="platform-lobby-message">' +
        escapeHtml(message) +
        '</p>' +
        '<div class="platform-lobby-join">' +
        (joinCode
          ? '<img class="platform-lobby-qr" src="' +
            escapeHtml(qrImageUrl(joinCode, joinUrl)) +
            '" alt="Join QR code" width="280" height="280" />' +
            '<p class="platform-lobby-code-label">Join code</p>' +
            '<p class="platform-lobby-code">' +
            escapeHtml(joinCode) +
            '</p>'
          : '') +
        (joinUrl
          ? '<p class="platform-lobby-url">' + escapeHtml(joinUrl) + '</p>'
          : '') +
        '</div>' +
        linksHtml +
        '<p class="platform-lobby-hint">Start the session from admin when everyone has joined.</p>' +
        '</div>';
    } else {
      var learnerJoinCode = payload.join_code || '';
      bridgeDeps.setLastJoinCode(learnerJoinCode);
      overlay.innerHTML =
        '<div class="platform-lobby-card platform-lobby-learner">' +
        '<p class="platform-lobby-eyebrow">Please wait</p>' +
        '<h1 class="platform-lobby-title">' +
        escapeHtml(title) +
        '</h1>' +
        scheduledHtml +
        '<p class="platform-lobby-message platform-lobby-waiting">' +
        escapeHtml(message) +
        '</p>' +
        '<p class="platform-lobby-status">Waiting for the instructor to start the session…</p>' +
        linksHtml +
        buildLearnerAccountSection(learnerJoinCode) +
        '</div>';
    }

    bridgeDeps.updateChrome('Waiting for session', true);
  }

  function hideLobby() {
    document.documentElement.classList.remove('platform-lobby-active');
    var overlay = document.getElementById('platform-lobby-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  function ensureSessionEndedOverlay() {
    var el = document.getElementById('platform-session-ended-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'platform-session-ended-overlay';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    return el;
  }

  function isSessionCancelled(endedPayload) {
    if (endedPayload && endedPayload.starts_at != null) {
      return false;
    }
    if (endedPayload && endedPayload.starts_at === null) {
      return true;
    }
    if (bridgeDeps.isLive()) {
      return false;
    }
    return !bridgeDeps.getSessionStartsAt();
  }

  function renderSessionEndedOverlay(cancelled) {
    var overlay = ensureSessionEndedOverlay();
    var title = cancelled ? 'Session cancelled' : 'Session ended';
    var message = cancelled
      ? 'This session was cancelled before it started.'
      : 'This session has ended.';
    var joinUrl = window.location.origin + '/join';
    var role = bridgeDeps.getRole();
    var learnerAuthHtml =
      role === 'learner'
        ? buildLearnerAccountSection(bridgeDeps.getLastJoinCode())
        : '';

    overlay.innerHTML =
      '<div class="platform-lobby-card platform-session-ended-card">' +
      '<h1 class="platform-lobby-title">' +
      escapeHtml(title) +
      '</h1>' +
      '<p class="platform-lobby-message platform-lobby-waiting">' +
      escapeHtml(message) +
      '</p>' +
      learnerAuthHtml +
      '<p class="platform-lobby-signed-in-link">' +
      '<a class="platform-lobby-link" href="' +
      escapeHtml(joinUrl) +
      '">Join another session</a>' +
      '</p>' +
      '</div>';
  }

  function showSessionEndedOverlay(cancelled) {
    bridgeDeps.setSessionEnded(true);
    document.documentElement.classList.add('platform-lobby-active');
    document.documentElement.classList.add('platform-session-ended-active');

    var lobbyEl = document.getElementById('platform-lobby-overlay');
    if (lobbyEl) {
      lobbyEl.remove();
    }

    bridgeDeps.fetchPlatformAuth().then(function () {
      renderSessionEndedOverlay(cancelled);
    });
  }

  function clearEndedOverlay() {
    document.documentElement.classList.remove('platform-session-ended-active');
    document.documentElement.classList.remove('platform-lobby-active');
    var ended = document.getElementById('platform-session-ended-overlay');
    if (ended) ended.remove();
  }

  function mergeLobbyData(payload) {
    lobbyData = Object.assign({}, lobbyData || {}, payload);
    return lobbyData;
  }

  function getLobbyData() {
    return lobbyData;
  }

  function init(deps) {
    bridgeDeps = deps;
  }

  window.PlatformBridgeLobby = {
    init: init,
    showLobby: showLobby,
    hideLobby: hideLobby,
    showSessionEndedOverlay: showSessionEndedOverlay,
    clearEndedOverlay: clearEndedOverlay,
    isSessionCancelled: isSessionCancelled,
    mergeLobbyData: mergeLobbyData,
    getLobbyData: getLobbyData,
  };
})();
