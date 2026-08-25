/**
 * WebSocket connection, ping, and reconnect for platform bridge.
 */
(function () {
  var bridgeDeps = null;
  var ws = null;
  var reconnectTimer = null;
  var pingTimer = null;

  function wsSend(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function stopPing() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function startPing() {
    stopPing();
    if (
      !bridgeDeps.isLive() ||
      bridgeDeps.isReviewMode() ||
      bridgeDeps.isSessionEnded()
    ) {
      return;
    }
    pingTimer = setInterval(function () {
      wsSend({
        type: 'ping',
        session_id: bridgeDeps.getSessionId(),
        ts: Date.now(),
        payload: {},
      });
    }, 30000);
  }

  function closeConnection() {
    stopPing();
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function updateToken(newToken) {
    if (!newToken || bridgeDeps.isReviewMode() || bridgeDeps.isSessionEnded()) {
      return;
    }
    bridgeDeps.setCurrentToken(newToken);
    bridgeDeps.swapTokenInUrl(newToken);
    closeConnection();
    connect(newToken);
  }

  function connect(token) {
    if (bridgeDeps.isReviewMode() || bridgeDeps.getAccessMode() === 'review') {
      return;
    }

    var url = bridgeDeps.getWsUrl(token);
    bridgeDeps.updateChrome('Connecting…', false);

    ws = new WebSocket(url);

    ws.onopen = function () {
      if (bridgeDeps.isLive()) {
        bridgeDeps.updateChrome('Connected', true);
        startPing();
      }
    };

    ws.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        bridgeDeps.handleWsMessage(msg);
      } catch (e) {
        console.warn('[PlatformBridge] bad message', e);
      }
    };

    ws.onclose = function () {
      stopPing();
      if (bridgeDeps.isSessionEnded() || bridgeDeps.isReviewMode()) {
        bridgeDeps.updateChrome(
          bridgeDeps.isReviewMode() ? 'Review mode' : 'Session ended',
          false
        );
        return;
      }
      bridgeDeps.updateChrome('Reconnecting…', false);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(function () {
        connect(bridgeDeps.getCurrentToken() || token);
      }, 2000);
    };

    ws.onerror = function () {
      bridgeDeps.updateChrome('Connection error', false);
    };
  }

  function init(deps) {
    bridgeDeps = deps;
  }

  window.PlatformBridgeConnection = {
    init: init,
    connect: connect,
    updateToken: updateToken,
    wsSend: wsSend,
    stopPing: stopPing,
    closeConnection: closeConnection,
  };
})();
