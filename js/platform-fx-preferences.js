/**
 * Platform FX preferences — API, guest sessionStorage, claim-guest flush (Batch 07.3).
 */
(function () {
  var SAVE_DEBOUNCE_MS = 400;
  var LAYER_IDS = [
    'scanlines',
    'grille',
    'vignette',
    'bezelMask',
    'barrel',
    'phosphorGlow',
    'noise',
    'flicker',
    'movingBeam',
    'glitch',
    'chromatic',
    'hud',
    'cursor',
    'pulseBorder',
  ];

  var ctx = {
    getSessionId: function () {
      return null;
    },
    getApiBase: function () {
      return '/api/v1';
    },
    isAuthenticated: function () {
      return false;
    },
    isSessionDeck: function () {
      return false;
    },
  };

  var currentFx = null;
  var saveTimer = null;
  var changeListeners = [];
  var loadPromise = null;

  function clampIntensity(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.max(0, Math.min(1, n));
  }

  function storageKey() {
    var sessionId = ctx.getSessionId();
    return sessionId ? 'platform-fx-' + sessionId : null;
  }

  function readGuestStorage() {
    var key = storageKey();
    if (!key) return null;
    var raw = PlatformGuestStorage.getItem(key);
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      return parsed && parsed.fx ? parsed.fx : null;
    } catch (e) {
      return null;
    }
  }

  function writeGuestStorage(fx) {
    var key = storageKey();
    if (!key) return;
    PlatformGuestStorage.setItem(key, JSON.stringify({ fx: fx }));
  }

  function clearGuestStorage() {
    var key = storageKey();
    if (!key) return;
    PlatformGuestStorage.removeItem(key);
  }

  function captureCurrentFx() {
    var layers = {};
    if (typeof cp2077FxGetLayers === 'function') {
      layers = cp2077FxGetLayers();
    }
    var cfg = (window.CP2077_CONFIG && window.CP2077_CONFIG.fx) || {};
    return {
      preset: cfg.preset || 'custom',
      intensity: clampIntensity(cfg.intensity != null ? cfg.intensity : 1),
      layers: layers,
    };
  }

  function notifyChange() {
    changeListeners.forEach(function (fn) {
      try {
        fn(currentFx);
      } catch (e) {
        /* listener error */
      }
    });
  }

  function applyFxToDeck(fx) {
    if (!fx) return;
    var cfg = window.CP2077_CONFIG && window.CP2077_CONFIG.fx;
    if (!cfg) return;

    if (fx.intensity != null && typeof cp2077SetCrtIntensity === 'function') {
      cp2077SetCrtIntensity(clampIntensity(fx.intensity));
    }

    if (fx.preset && fx.preset !== 'custom' && typeof cp2077FxPreset === 'function') {
      cp2077FxPreset(fx.preset);
    } else if (fx.layers && typeof cp2077FxApply === 'function') {
      cfg.preset = 'custom';
      cfg.useConfigDefaults = true;
      cp2077FxApply(fx.layers);
      if (fx.preset === 'custom') {
        cfg.preset = 'custom';
      }
    } else if (fx.preset && typeof cp2077FxPreset === 'function') {
      cp2077FxPreset(fx.preset);
    }

    currentFx = captureCurrentFx();
    notifyChange();
  }

  function fetchRegisteredPreferences() {
    if (!ctx.isAuthenticated()) {
      return Promise.resolve(null);
    }
    return fetch(ctx.getApiBase() + '/users/me/preferences', { credentials: 'include' })
      .then(function (res) {
        if (res.status === 404) return null;
        if (!res.ok) return null;
        return res.json().then(function (body) {
          var prefs = body && body.data && body.data.preferences;
          return prefs && prefs.fx ? prefs.fx : null;
        });
      })
      .catch(function () {
        return null;
      });
  }

  function patchRegisteredPreferences(fxPatch) {
    if (!ctx.isAuthenticated()) {
      return Promise.resolve();
    }
    return fetch(ctx.getApiBase() + '/users/me/preferences', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: { fx: fxPatch } }),
    }).catch(function () {});
  }

  function scheduleSave(fx) {
    if (!ctx.isSessionDeck()) return;
    currentFx = fx;

    if (ctx.isAuthenticated()) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        saveTimer = null;
        patchRegisteredPreferences(fx);
      }, SAVE_DEBOUNCE_MS);
      return;
    }

    writeGuestStorage(fx);
  }

  function loadAndApply() {
    if (!ctx.isSessionDeck()) {
      return Promise.resolve();
    }

    if (loadPromise) return loadPromise;

    loadPromise = Promise.resolve()
      .then(function () {
        if (ctx.isAuthenticated()) {
          return fetchRegisteredPreferences();
        }
        return readGuestStorage();
      })
      .then(function (fx) {
        if (fx) {
          applyFxToDeck(fx);
        } else {
          currentFx = captureCurrentFx();
          notifyChange();
        }
      })
      .finally(function () {
        loadPromise = null;
      });

    return loadPromise;
  }

  function saveFx(fxPatch) {
    if (!ctx.isSessionDeck()) return;
    var next = Object.assign({}, currentFx || captureCurrentFx(), fxPatch || {});
    if (fxPatch && fxPatch.layers) {
      next.layers = Object.assign({}, (currentFx && currentFx.layers) || captureCurrentFx().layers, fxPatch.layers);
    }
    next.intensity = clampIntensity(next.intensity);
    scheduleSave(next);
    notifyChange();
  }

  function flushGuestFxToClaim() {
    if (!ctx.isSessionDeck() || !ctx.isAuthenticated()) {
      return Promise.resolve();
    }
    var guestFx = readGuestStorage();
    if (!guestFx) {
      return Promise.resolve();
    }

    return fetch(ctx.getApiBase() + '/auth/claim-guest', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: { fx: guestFx } }),
    })
      .then(function (res) {
        if (res.ok) {
          clearGuestStorage();
          return loadAndApply();
        }
      })
      .catch(function () {});
  }

  function init(options) {
    if (options) {
      if (typeof options.getSessionId === 'function') ctx.getSessionId = options.getSessionId;
      if (typeof options.getApiBase === 'function') ctx.getApiBase = options.getApiBase;
      if (typeof options.isAuthenticated === 'function') ctx.isAuthenticated = options.isAuthenticated;
      if (typeof options.isSessionDeck === 'function') ctx.isSessionDeck = options.isSessionDeck;
    }
  }

  window.PlatformFxPreferences = {
    init: init,
    loadAndApply: loadAndApply,
    getState: function () {
      return currentFx || captureCurrentFx();
    },
    saveFx: saveFx,
    flushGuestFxToClaim: flushGuestFxToClaim,
    applyFxToDeck: applyFxToDeck,
    captureCurrentFx: captureCurrentFx,
    onChange: function (listener) {
      if (typeof listener === 'function') {
        changeListeners.push(listener);
      }
    },
    LAYER_IDS: LAYER_IDS,
  };
})();
