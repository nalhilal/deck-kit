/**
 * Facilitator whiteboard scene sync (Batch 05.3).
 */
(function () {
  var THROTTLE_MS = 200;
  var APPLY_DELAY_MS = 150;
  /** Must match backend/apps/web/lib/ws/gateway.ts WHITEBOARD_SCENE_MAX_BYTES */
  var SCENE_MAX_BYTES = 512000;
  var TOAST_CLEAR_MS = 6000;

  var bridgeDeps = null;
  var sceneCache = {};
  var lastRevision = {};
  var localRevision = {};
  var throttleTimers = {};
  var pendingScenes = {};
  var slideListenerBound = false;
  var toastEl = null;
  var toastClearTimer = null;

  function hasWhiteboardCapability() {
    var meta = window.__DECK_META__;
    if (!meta || !Array.isArray(meta.capabilities)) return true;
    return meta.capabilities.indexOf('whiteboard') !== -1;
  }

  function shouldActivate() {
    if (!bridgeDeps || !hasWhiteboardCapability()) return false;
    if (!bridgeDeps.isLive()) return false;
    if (bridgeDeps.isReviewMode()) return false;
    return true;
  }

  function sceneByteLength(sceneJson) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(sceneJson).length;
    }
    return unescape(encodeURIComponent(sceneJson)).length;
  }

  function isSceneWithinLimit(sceneJson) {
    return sceneByteLength(sceneJson) <= SCENE_MAX_BYTES;
  }

  function ensureToast() {
    var chrome = document.getElementById('platform-bridge-chrome');
    if (!chrome) return null;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'platform-whiteboard-toast';
      toastEl.className = 'platform-whiteboard-toast';
      toastEl.setAttribute('aria-live', 'polite');
      chrome.appendChild(toastEl);
    }
    return toastEl;
  }

  function clearToast() {
    if (toastClearTimer) {
      clearTimeout(toastClearTimer);
      toastClearTimer = null;
    }
    if (toastEl) {
      toastEl.textContent = '';
      toastEl.className = 'platform-whiteboard-toast platform-whiteboard-toast--hidden';
    }
  }

  function showToast(message, isError) {
    var el = ensureToast();
    if (!el) return;
    el.textContent = message;
    el.className =
      'platform-whiteboard-toast ' +
      (isError ? 'platform-whiteboard-toast--error' : 'platform-whiteboard-toast--info');
    if (toastClearTimer) clearTimeout(toastClearTimer);
    toastClearTimer = setTimeout(function () {
      toastClearTimer = null;
      clearToast();
    }, TOAST_CLEAR_MS);
  }

  function restoreConnectionStatus() {
    if (!bridgeDeps || typeof bridgeDeps.restoreConnectionStatus !== 'function') return;
    bridgeDeps.restoreConnectionStatus();
  }

  function isOnBoardSlide(boardId) {
    if (typeof Reveal === 'undefined' || !Reveal.getCurrentSlide) return false;
    var slide = Reveal.getCurrentSlide();
    return slide && slide.getAttribute('data-whiteboard-id') === boardId;
  }

  function getBoardMountContainer() {
    var layer = document.getElementById('cp2077-whiteboard-layer');
    if (!layer || !layer.classList.contains('is-active')) return null;
    return layer.querySelector('.cp2077-whiteboard-mount');
  }

  function applyCachedSceneToBoard(boardId, attempt) {
    if (attempt === undefined) attempt = 0;
    if (!window.CP2077Whiteboard || typeof CP2077Whiteboard.applyScene !== 'function') {
      return false;
    }
    var cached = sceneCache[boardId];
    if (!cached) return false;
    if (!isOnBoardSlide(boardId)) return false;
    if (cached.revision <= (lastRevision[boardId] || 0)) return false;

    var container = getBoardMountContainer();
    if (!container) {
      if (attempt < 30) {
        setTimeout(function () {
          applyCachedSceneToBoard(boardId, attempt + 1);
        }, 100);
      }
      return false;
    }

    CP2077Whiteboard.applyScene(container, cached.scene_json, {
      suppressPersist: true,
      applyAppState: false,
    });
    lastRevision[boardId] = cached.revision;
    return true;
  }

  function handleRemoteScene(payload) {
    if (!shouldActivate()) return;
    if (!payload || !payload.board_id) return;
    if (bridgeDeps.getRole() !== 'learner') return;

    var boardId = payload.board_id;
    sceneCache[boardId] = {
      scene_json: payload.scene_json,
      revision: payload.revision,
    };

    if (!bridgeDeps.shouldMirrorInstructorContent()) return;
    if (payload.revision <= (lastRevision[boardId] || 0)) return;

    if (isOnBoardSlide(boardId)) {
      applyCachedSceneToBoard(boardId);
    }
  }

  function handleServerError(message) {
    if (!message || message.indexOf('scene_json') === -1) return false;
    showToast(message, true);
    restoreConnectionStatus();
    return true;
  }

  function flushEmit(boardId) {
    var sceneJson = pendingScenes[boardId];
    if (!sceneJson || !bridgeDeps) return;
    pendingScenes[boardId] = null;

    if (!isSceneWithinLimit(sceneJson)) {
      showToast(
        'Whiteboard scene too large to sync (500 KB max). Remove embedded images or simplify strokes.',
        true
      );
      restoreConnectionStatus();
      return;
    }

    localRevision[boardId] = (localRevision[boardId] || 0) + 1;
    var revision = localRevision[boardId];

    bridgeDeps.wsSend({
      type: 'whiteboard.scene',
      session_id: bridgeDeps.getSessionId(),
      ts: Date.now(),
      payload: {
        board_id: boardId,
        scene_json: sceneJson,
        revision: revision,
      },
    });
    clearToast();
    restoreConnectionStatus();
  }

  function scheduleEmit(boardId, sceneJson) {
    pendingScenes[boardId] = sceneJson;
    if (throttleTimers[boardId]) return;
    throttleTimers[boardId] = setTimeout(function () {
      throttleTimers[boardId] = null;
      flushEmit(boardId);
    }, THROTTLE_MS);
  }

  function onLocalPersist(boardId, sceneJson) {
    if (!shouldActivate()) return;
    if (bridgeDeps.getRole() !== 'instructor') return;
    scheduleEmit(boardId, sceneJson);
  }

  function onBoardMounted(boardId) {
    if (!shouldActivate()) return;
    if (bridgeDeps.getRole() !== 'learner' || !bridgeDeps.shouldMirrorInstructorContent()) return;
    setTimeout(function () {
      applyCachedSceneToBoard(boardId, 0);
    }, 0);
  }

  function onSlideTransitionEnd() {
    if (!shouldActivate()) return;
    if (bridgeDeps.getRole() !== 'learner' || !bridgeDeps.shouldMirrorInstructorContent()) return;
    if (typeof Reveal === 'undefined' || !Reveal.getCurrentSlide) return;

    var slide = Reveal.getCurrentSlide();
    if (!slide || !slide.classList.contains('whiteboard-slide')) return;

    var boardId = slide.getAttribute('data-whiteboard-id');
    if (!boardId) return;

    setTimeout(function () {
      applyCachedSceneToBoard(boardId);
    }, APPLY_DELAY_MS);
  }

  function bindReveal() {
    if (slideListenerBound || typeof Reveal === 'undefined') return;
    slideListenerBound = true;
    Reveal.on('slidetransitionend', onSlideTransitionEnd);
  }

  function clearTimers() {
    Object.keys(throttleTimers).forEach(function (boardId) {
      if (throttleTimers[boardId]) {
        clearTimeout(throttleTimers[boardId]);
      }
    });
    throttleTimers = {};
    pendingScenes = {};
    clearToast();
  }

  function install(deps) {
    bridgeDeps = deps;
    bindReveal();
    return Promise.resolve();
  }

  function teardown() {
    clearTimers();
    if (toastEl && toastEl.parentNode) {
      toastEl.parentNode.removeChild(toastEl);
    }
    toastEl = null;
    bridgeDeps = null;
    sceneCache = {};
    lastRevision = {};
    localRevision = {};
    slideListenerBound = false;
  }

  window.PlatformBridgeWhiteboard = {
    install: install,
    teardown: teardown,
    onLocalPersist: onLocalPersist,
    onBoardMounted: onBoardMounted,
    handleRemoteScene: handleRemoteScene,
    handleServerError: handleServerError,
    SCENE_MAX_BYTES: SCENE_MAX_BYTES,
    sceneByteLength: sceneByteLength,
    isSceneWithinLimit: isSceneWithinLimit,
  };
})();
