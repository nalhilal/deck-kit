/**
 * Personal ink persistence (Batch 04) — REST sync per slide_key.
 */
(function () {
  var DEBOUNCE_MS = 750;
  var MAX_SCENE_BYTES = 1048576;
  var RETRY_BASE_MS = 1000;
  var RETRY_MAX_MS = 30000;
  var SAVED_CLEAR_MS = 2000;

  var bridgeDeps = null;
  var annotationCache = {};
  var currentSlideKey = null;
  var saveTimer = null;
  var changeUnsubscribe = null;
  var pageActivatedUnsubscribe = null;
  var readOnly = false;
  var retryAttempt = 0;
  var retryTimer = null;
  var savedClearTimer = null;
  var suppressEmptySave = true;
  var saveStateListeners = [];
  var serverPersistBlocked = false;

  function hasInkShapes(sceneJson) {
    return window.PlatformInkUtils && window.PlatformInkUtils.hasInkShapes(sceneJson);
  }

  function hasAnnotationsCapability() {
    var meta = window.__DECK_META__;
    if (!meta || !Array.isArray(meta.capabilities)) return true;
    return meta.capabilities.indexOf('annotations') !== -1;
  }

  function shouldActivate() {
    if (!bridgeDeps || !hasAnnotationsCapability()) return false;
    if (bridgeDeps.getRole() === 'instructor') return false;
    if (bridgeDeps.getRole() !== 'learner') return false;
    return true;
  }

  function notifySaveState(state, message) {
    saveStateListeners.forEach(function (fn) {
      try {
        fn({ state: state, message: message || '' });
      } catch (e) {
        /* ignore */
      }
    });
  }

  function storageKey(sessionId, slideKey) {
    return 'platform-annotate:' + sessionId + ':' + slideKey;
  }

  function readSessionFallback(sessionId, slideKey) {
    try {
      return sessionStorage.getItem(storageKey(sessionId, slideKey));
    } catch (e) {
      return null;
    }
  }

  function writeSessionFallback(sessionId, slideKey, sceneJson) {
    try {
      sessionStorage.setItem(storageKey(sessionId, slideKey), sceneJson);
    } catch (e) {
      /* ignore */
    }
  }

  function setSaveIndicator(state, message) {
    notifySaveState(state, message);
  }

  function clearSavedIndicatorLater() {
    if (savedClearTimer) clearTimeout(savedClearTimer);
    savedClearTimer = setTimeout(function () {
      savedClearTimer = null;
      setSaveIndicator('idle', '');
    }, SAVED_CLEAR_MS);
  }

  function readGuestAnnotationStorage(sessionId) {
    var prefix = storageKey(sessionId, '');
    var out = {};
    try {
      for (var i = 0; i < sessionStorage.length; i++) {
        var key = sessionStorage.key(i);
        if (!key || key.indexOf(prefix) !== 0) continue;
        var slideKey = key.slice(prefix.length);
        var value = sessionStorage.getItem(key);
        if (slideKey && value) out[slideKey] = value;
      }
    } catch (e) {
      /* ignore */
    }
    return out;
  }

  function clearGuestAnnotationStorage(sessionId) {
    var prefix = storageKey(sessionId, '');
    try {
      var keys = [];
      for (var i = 0; i < sessionStorage.length; i++) {
        var key = sessionStorage.key(i);
        if (key && key.indexOf(prefix) === 0) keys.push(key);
      }
      keys.forEach(function (key) {
        sessionStorage.removeItem(key);
      });
    } catch (e) {
      /* ignore */
    }
  }

  function loadSceneForSlide(slideKey) {
    if (!window.TldrevealAdapter || !TldrevealAdapter.isReady()) return;

    suppressEmptySave = true;

    var scene =
      annotationCache[slideKey] ||
      readSessionFallback(bridgeDeps.getSessionId(), slideKey);

    if (typeof TldrevealAdapter.loadSceneForSlideKey === 'function') {
      TldrevealAdapter.loadSceneForSlideKey(slideKey, scene);
    } else if (scene) {
      TldrevealAdapter.loadScene(scene);
    } else {
      TldrevealAdapter.loadScene(null);
    }

    setTimeout(function () {
      suppressEmptySave = false;
    }, 200);
  }

  function handlePageActivated(pageName) {
    if (!bridgeDeps || !window.TldrevealAdapter) return;
    var slideKey =
      typeof TldrevealAdapter.pageNameToSlideKey === 'function'
        ? TldrevealAdapter.pageNameToSlideKey(pageName)
        : null;
    if (!slideKey || slideKey !== currentSlideKey) return;
    loadSceneForSlide(slideKey);
  }

  function onSlideChanged(slideKey) {
    var leaving = currentSlideKey;
    if (leaving && leaving !== slideKey) {
      flushSaveForSlide(leaving);
    }
    currentSlideKey = slideKey;
  }

  function exportSceneForSlide(slideKey) {
    if (!window.TldrevealAdapter || !TldrevealAdapter.isReady()) return null;
    if (typeof TldrevealAdapter.exportSceneForSlideKey === 'function') {
      return TldrevealAdapter.exportSceneForSlideKey(slideKey);
    }
    return TldrevealAdapter.exportScene();
  }

  function scheduleSave(slideKey) {
    if (readOnly || !shouldActivate()) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      persistSlide(slideKey);
    }, DEBOUNCE_MS);
  }

  function persistSlide(slideKey) {
    if (!window.TldrevealAdapter || !TldrevealAdapter.isReady()) return Promise.resolve();
    if (readOnly || !shouldActivate()) return Promise.resolve();

    var sceneJson = exportSceneForSlide(slideKey);
    if (!sceneJson) {
      setSaveIndicator('idle', '');
      return Promise.resolve();
    }

    if (suppressEmptySave || !hasInkShapes(sceneJson)) {
      setSaveIndicator('idle', '');
      return Promise.resolve();
    }

    if (sceneJson.length > MAX_SCENE_BYTES) {
      setSaveIndicator('error', 'Drawing too large to save');
      return Promise.resolve();
    }

    setSaveIndicator('saving', 'Saving…');

    var sessionId = bridgeDeps.getSessionId();
    annotationCache[slideKey] = sceneJson;
    writeSessionFallback(sessionId, slideKey, sceneJson);

    return fetch(
      bridgeDeps.getApiBase() +
        '/sessions/' +
        encodeURIComponent(sessionId) +
        '/annotations',
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slide_key: slideKey,
          scene_json: sceneJson,
        }),
      }
    )
      .then(function (res) {
        if (res.ok) {
          retryAttempt = 0;
          serverPersistBlocked = false;
          setSaveIndicator('saved', 'Saved');
          clearSavedIndicatorLater();
          return;
        }
        if (res.status === 409) {
          setSaveIndicator('readonly', 'Session ended');
          readOnly = true;
          return;
        }
        if (res.status === 401 || res.status === 403) {
          // Not authenticated / not enrolled for server persistence. The scene
          // is safely kept in sessionStorage. This is not a connectivity
          // problem, so do NOT show "Offline" or start a retry loop — every
          // retry would fail identically. Re-auth is handled by
          // reloadFromServer()/flushGuestAnnotationsToServer().
          serverPersistBlocked = true;
          retryAttempt = 0;
          setSaveIndicator('saved', 'Saved on this device');
          clearSavedIndicatorLater();
          return;
        }
        throw new Error('save failed');
      })
      .catch(function () {
        setSaveIndicator('offline', 'Offline — retrying…');
        scheduleRetry(slideKey);
      });
  }

  function scheduleRetry(slideKey) {
    if (retryTimer) return;
    var delay = Math.min(RETRY_BASE_MS * Math.pow(2, retryAttempt), RETRY_MAX_MS);
    retryAttempt += 1;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      persistSlide(slideKey);
    }, delay);
  }

  function flushSaveForSlide(slideKey) {
    if (!slideKey || readOnly || !shouldActivate()) return Promise.resolve();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    return persistSlide(slideKey);
  }

  function fetchBulkCache() {
    var sessionId = bridgeDeps.getSessionId();
    return fetch(
      bridgeDeps.getApiBase() +
        '/sessions/' +
        encodeURIComponent(sessionId) +
        '/annotations',
      { credentials: 'include' }
    )
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (body) {
        var list =
          body && body.data && Array.isArray(body.data.annotations)
            ? body.data.annotations
            : [];
        list.forEach(function (row) {
          if (row && row.slide_key && row.scene_json) {
            annotationCache[row.slide_key] = row.scene_json;
          }
        });
      })
      .catch(function () {
        /* use sessionStorage fallback only */
      });
  }

  function bindReveal() {
    if (typeof Reveal === 'undefined') return;

    function handleSlideChanged() {
      onSlideChanged(bridgeDeps.slideKeyFromReveal());
    }

    Reveal.on('slidechanged', handleSlideChanged);
    handleSlideChanged();
  }

  function bindPageActivated() {
    if (!window.TldrevealAdapter || typeof TldrevealAdapter.onPageActivated !== 'function') {
      return;
    }
    if (pageActivatedUnsubscribe) {
      pageActivatedUnsubscribe();
      pageActivatedUnsubscribe = null;
    }
    pageActivatedUnsubscribe = TldrevealAdapter.onPageActivated(handlePageActivated);
  }

  function bindEditorChanges() {
    if (!window.TldrevealAdapter || typeof TldrevealAdapter.onChange !== 'function') {
      return;
    }
    if (changeUnsubscribe) {
      changeUnsubscribe();
      changeUnsubscribe = null;
    }
    changeUnsubscribe = TldrevealAdapter.onChange(function () {
      if (!currentSlideKey) return;
      scheduleSave(currentSlideKey);
    });
  }

  function syncCurrentPageLoad() {
    if (!window.TldrevealAdapter || !TldrevealAdapter.isReady() || !currentSlideKey) return;
    var pageName =
      typeof TldrevealAdapter.getCurrentPageName === 'function'
        ? TldrevealAdapter.getCurrentPageName()
        : null;
    if (pageName) {
      handlePageActivated(pageName);
    }
  }

  function waitForEditor(maxMs) {
    var start = Date.now();
    return new Promise(function (resolve) {
      function tick() {
        if (window.TldrevealAdapter && TldrevealAdapter.isReady()) {
          resolve();
          return;
        }
        if (Date.now() - start >= maxMs) {
          resolve();
          return;
        }
        setTimeout(tick, 100);
      }
      tick();
    });
  }

  function install(deps) {
    bridgeDeps = deps;
    readOnly = Boolean(deps.readOnly);

    if (!shouldActivate()) {
      return Promise.resolve();
    }

    if (!readOnly) {
      setSaveIndicator('idle', '');
    }

    return fetchBulkCache()
      .then(function () {
        bindPageActivated();
        return waitForEditor(8000);
      })
      .then(function () {
        bindEditorChanges();
        bindReveal();
        syncCurrentPageLoad();
      });
  }

  function teardown() {
    if (currentSlideKey && !readOnly) {
      flushSaveForSlide(currentSlideKey);
    }
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (savedClearTimer) {
      clearTimeout(savedClearTimer);
      savedClearTimer = null;
    }
    if (changeUnsubscribe) {
      changeUnsubscribe();
      changeUnsubscribe = null;
    }
    if (pageActivatedUnsubscribe) {
      pageActivatedUnsubscribe();
      pageActivatedUnsubscribe = null;
    }
    bridgeDeps = null;
    annotationCache = {};
    currentSlideKey = null;
    readOnly = false;
    retryAttempt = 0;
    serverPersistBlocked = false;
  }

  function flush() {
    if (!currentSlideKey) return Promise.resolve();
    return flushSaveForSlide(currentSlideKey);
  }

  function reloadFromServer() {
    if (!shouldActivate() || !bridgeDeps) return Promise.resolve();
    serverPersistBlocked = false;
    return fetchBulkCache().then(function () {
      if (currentSlideKey) {
        loadSceneForSlide(currentSlideKey);
      }
      if (typeof window.PlatformControlPanelTools !== 'undefined') {
        PlatformControlPanelTools.refresh();
      }
    });
  }

  function flushGuestAnnotationsToServer() {
    if (!bridgeDeps || !shouldActivate()) return Promise.resolve();
    if (
      typeof bridgeDeps.isAuthenticated === 'function' &&
      !bridgeDeps.isAuthenticated()
    ) {
      return Promise.resolve();
    }

    var sessionId = bridgeDeps.getSessionId();
    var guestScenes = readGuestAnnotationStorage(sessionId);
    var merged = Object.assign({}, guestScenes, annotationCache);
    var entries = Object.keys(merged).filter(function (slideKey) {
      var scene = merged[slideKey];
      return typeof scene === 'string' && hasInkShapes(scene);
    });

    if (entries.length === 0) {
      clearGuestAnnotationStorage(sessionId);
      return Promise.resolve();
    }

    return Promise.all(
      entries.map(function (slideKey) {
        return fetch(
          bridgeDeps.getApiBase() +
            '/sessions/' +
            encodeURIComponent(sessionId) +
            '/annotations',
          {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slide_key: slideKey,
              scene_json: merged[slideKey],
            }),
          }
        ).catch(function () {
          /* keep sessionStorage for retry */
        });
      })
    ).then(function () {
      clearGuestAnnotationStorage(sessionId);
    });
  }

  window.PlatformBridgeAnnotations = {
    install: install,
    teardown: teardown,
    flush: flush,
    reloadFromServer: reloadFromServer,
    flushGuestAnnotationsToServer: flushGuestAnnotationsToServer,
    onSaveStateChange: function (listener) {
      if (typeof listener !== 'function') return function () {};
      saveStateListeners.push(listener);
      return function () {
        saveStateListeners = saveStateListeners.filter(function (fn) {
          return fn !== listener;
        });
      };
    },
  };
})();
