/**
 * Mirrors instructor poll controls into the Reveal speaker view window.
 * Main window owns WS state; speaker panel proxies clicks via postMessage.
 */
(function () {
  function unwrapRelayMessage(data) {
    if (
      data &&
      data.type === 'platform-present:relay' &&
      data.namespace === 'platform-poll' &&
      data.payload
    ) {
      return data.payload;
    }
    return data;
  }

  function handleMessage(event) {
    if (!window.PlatformBridgePolls) return;
    var speakerWin = PlatformBridgePolls.getSpeakerViewWindow
      ? PlatformBridgePolls.getSpeakerViewWindow()
      : null;
    var relayMode =
      PlatformBridgePolls.isSpeakerRelayMode &&
      PlatformBridgePolls.isSpeakerRelayMode();

    if (relayMode) {
      if (event.source !== window.opener) return;
    } else if (!speakerWin || event.source !== speakerWin) {
      return;
    }

    var data;
    try {
      data = JSON.parse(event.data);
    } catch (e) {
      return;
    }
    data = unwrapRelayMessage(data);
    if (!data || data.namespace !== 'platform-poll') return;
    if (data.type === 'proxy-click' && data.elementId) {
      PlatformBridgePolls.proxyInstructorClick(data.elementId);
    }
    if (data.type === 'proxy-select' && data.elementId && data.value !== undefined) {
      PlatformBridgePolls.proxyInstructorSelect(data.elementId, data.value);
    }
  }

  window.addEventListener('message', handleMessage);

  window.addEventListener('platform-speaker-view-opened', function (ev) {
    if (!ev.detail || !window.PlatformBridgePolls) return;
    if (ev.detail.mode === 'relay' && ev.detail.relayWindow) {
      PlatformBridgePolls.setSpeakerViewActive(true, ev.detail.relayWindow, {
        mode: 'relay',
      });
      return;
    }
    if (ev.detail.window) {
      PlatformBridgePolls.setSpeakerViewActive(true, ev.detail.window);
    }
  });

  window.addEventListener('platform-speaker-view-closed', function () {
    if (window.PlatformBridgePolls) {
      PlatformBridgePolls.setSpeakerViewActive(false, null);
    }
  });
})();
