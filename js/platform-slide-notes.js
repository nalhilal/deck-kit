/**
 * Session slide notes — REST sync per slide_key (Batch 07.5).
 */
(function () {
  var SAVE_DEBOUNCE_MS = 400;
  var RETRY_BASE_MS = 1000;
  var RETRY_MAX_MS = 30000;
  var MAX_BODY_BYTES = 65536;

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
    slideKeyFromReveal: function () {
      return '0/0';
    },
    isReviewMode: function () {
      return false;
    },
    isLive: function () {
      return false;
    },
    getInstructorSlideKey: function () {
      return null;
    },
  };

  var noteCache = {};
  var instructorSlideKey = null;
  var deckSlideKey = null;
  var editingSlideKey = null;
  var editingFocused = false;
  var editingDirty = false;
  var saveTimer = null;
  var retryTimer = null;
  var retryAttempt = 0;
  var readOnly = false;
  var saveState = { status: 'idle', message: '' };
  var changeListeners = [];
  var slideContextListeners = [];
  var syncStateListeners = [];
  var slideHandlersBound = false;
  var loadPromise = null;

  function storageKey() {
    var sessionId = ctx.getSessionId();
    return sessionId ? 'platform-notes-' + sessionId : null;
  }

  function readGuestStorage() {
    var key = storageKey();
    if (!key) return {};
    var raw = PlatformGuestStorage.getItem(key);
    if (!raw) return {};
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeGuestStorage(cache) {
    var key = storageKey();
    if (!key) return;
    PlatformGuestStorage.setItem(key, JSON.stringify(cache));
  }

  function clearGuestStorage() {
    var key = storageKey();
    if (!key) return;
    PlatformGuestStorage.removeItem(key);
  }

  function slideKeyFromIndices(indices) {
    if (!indices) return '0/0';
    return indices.h + '/' + (indices.v || 0);
  }

  function isLearnerControllingNotes() {
    return (
      window.PlatformControlPanel &&
      typeof PlatformControlPanel.isOpen === 'function' &&
      PlatformControlPanel.isOpen()
    );
  }

  function enumerateSlideKeys() {
    if (window.PlatformPositionUtils && typeof PlatformPositionUtils.enumerateSlideKeys === 'function') {
      return PlatformPositionUtils.enumerateSlideKeys();
    }
    if (typeof Reveal === 'undefined' || typeof Reveal.getSlides !== 'function') {
      return ['0/0'];
    }
    var slides = Reveal.getSlides();
    var keys = slides.map(function (slide) {
      return slideKeyFromIndices(Reveal.getIndices(slide));
    });
    return keys.length ? keys : ['0/0'];
  }

  function slideKeyFromElement(slide) {
    if (!slide || typeof Reveal === 'undefined' || typeof Reveal.getIndices !== 'function') {
      return null;
    }
    var indices = Reveal.getIndices(slide);
    return slideKeyFromIndices(indices);
  }

  function slideElementForKey(slideKey) {
    if (typeof Reveal === 'undefined' || typeof Reveal.getSlides !== 'function') {
      return null;
    }
    var match = /^(\d+)\/(\d+)$/.exec(slideKey || '');
    if (!match) return null;
    var targetH = parseInt(match[1], 10);
    var targetV = parseInt(match[2], 10);
    var slides = Reveal.getSlides();
    for (var i = 0; i < slides.length; i++) {
      var indices = Reveal.getIndices(slides[i]);
      if (indices.h === targetH && (indices.v || 0) === targetV) {
        return slides[i];
      }
    }
    return null;
  }

  function learnerSlidePosition(slideKey) {
    var slide = slideElementForKey(slideKey);
    if (!slide || typeof Reveal === 'undefined') return '';
    if (typeof Reveal.getSlidePastCount !== 'function' || typeof Reveal.getTotalSlides !== 'function') {
      return '';
    }
    var past = Reveal.getSlidePastCount(slide);
    var total = Reveal.getTotalSlides();
    var uncounted = slide.dataset && slide.dataset.visibility === 'uncounted';
    var current = past + (uncounted ? 0 : 1);
    return current + '/' + total;
  }

  function learnerSlideLabel(slideKey) {
    var position = learnerSlidePosition(slideKey);
    var label = position ? 'Slide ' + position : 'Slide';
    try {
      var slide = slideElementForKey(slideKey);
      if (!slide) return label;
      var heading = slide.querySelector('h2, h1');
      if (heading && heading.textContent) {
        var text = heading.textContent.trim();
        if (text) return label + ' — ' + text;
      }
    } catch (e) {
      /* ignore */
    }
    return label;
  }

  function slideContextLabel(slideKey) {
    return learnerSlideLabel(slideKey);
  }

  function resolveKeyIndex(keys, primaryKey, fallbackKey) {
    if (primaryKey) {
      var index = keys.indexOf(primaryKey);
      if (index >= 0) return index;
    }
    if (fallbackKey) return keys.indexOf(fallbackKey);
    return -1;
  }

  function resolveInstructorSlideKey() {
    if (instructorSlideKey) return instructorSlideKey;
    if (typeof ctx.getInstructorSlideKey === 'function') {
      return ctx.getInstructorSlideKey();
    }
    return null;
  }

  function canGoNextAtCeiling(keys, index) {
    if (index < 0 || index >= keys.length - 1) return false;
    if (!ctx.isLive() || ctx.isReviewMode()) return true;
    var instructorKey = resolveInstructorSlideKey();
    if (!instructorKey || !editingSlideKey) return index < keys.length - 1;
    return PlatformPositionUtils.canNavigateNotesForward(
      editingSlideKey,
      instructorKey,
      keys
    );
  }

  function getSyncState() {
    var keys = enumerateSlideKeys();
    var index = resolveKeyIndex(keys, editingSlideKey, deckSlideKey);
    var instructorKey = resolveInstructorSlideKey();
    var positionKey = instructorKey || deckSlideKey;
    var instructorLearnerPosition = positionKey ? learnerSlidePosition(positionKey) : '';
    var outOfSync =
      instructorKey && editingSlideKey
        ? editingSlideKey !== instructorKey
        : !!(deckSlideKey && editingSlideKey && deckSlideKey !== editingSlideKey);
    return {
      outOfSync: outOfSync,
      deckSlideKey: deckSlideKey,
      editingSlideKey: editingSlideKey,
      instructorSlideKey: instructorKey,
      deckSlideLabel: deckSlideKey ? learnerSlideLabel(deckSlideKey) : '',
      editingSlideLabel: editingSlideKey ? learnerSlideLabel(editingSlideKey) : '',
      deckLearnerPosition: deckSlideKey ? learnerSlidePosition(deckSlideKey) : '',
      editingLearnerPosition: editingSlideKey ? learnerSlidePosition(editingSlideKey) : '',
      instructorLearnerPosition: instructorLearnerPosition,
      canGoPrev: index > 0,
      canGoNext: canGoNextAtCeiling(keys, index),
      atCeiling:
        ctx.isLive() &&
        !ctx.isReviewMode() &&
        instructorKey &&
        editingSlideKey === instructorKey,
    };
  }

  function notifySyncState() {
    var state = getSyncState();
    syncStateListeners.forEach(function (fn) {
      try {
        fn(state);
      } catch (e) {
        /* listener error */
      }
    });
  }

  function setSaveState(status, message) {
    saveState = { status: status, message: message || '' };
    notifyChange();
  }

  function notifyChange() {
    changeListeners.forEach(function (fn) {
      try {
        fn({
          slideKey: editingSlideKey,
          body: editingSlideKey ? noteCache[editingSlideKey] || '' : '',
          saveState: saveState,
        });
      } catch (e) {
        /* listener error */
      }
    });
  }

  function notifySlideContext(slideKey, label) {
    slideContextListeners.forEach(function (fn) {
      try {
        fn({ slideKey: slideKey, label: label });
      } catch (e) {
        /* listener error */
      }
    });
  }

  function loadEditingSlide(slideKey, clearDirty) {
    if (!slideKey) return;
    editingSlideKey = slideKey;
    if (clearDirty) editingDirty = false;
    notifySlideContext(slideKey, slideContextLabel(slideKey));
    notifyChange();
    notifySyncState();
  }

  function persistRegistered(slideKey, body) {
    var sessionId = ctx.getSessionId();
    if (!sessionId) return Promise.resolve();

    setSaveState('saving', 'Saving…');

    return fetch(
      ctx.getApiBase() +
        '/sessions/' +
        encodeURIComponent(sessionId) +
        '/notes',
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slide_key: slideKey, body: body }),
      }
    )
      .then(function (res) {
        if (res.ok) {
          retryAttempt = 0;
          setSaveState('saved', 'Saved');
          setTimeout(function () {
            if (saveState.status === 'saved') {
              setSaveState('idle', '');
            }
          }, 2000);
          return;
        }
        if (res.status === 409) {
          readOnly = true;
          return res.json().then(function (payload) {
            var code =
              payload && payload.error && payload.error.code
                ? payload.error.code
                : 'SESSION_ENDED';
            if (code === 'SESSION_NOT_LIVE') {
              setSaveState('readonly', 'Session not started');
            } else if (code === 'SESSION_CANCELLED') {
              setSaveState('readonly', 'Session was cancelled');
            } else {
              setSaveState('readonly', 'Session has ended');
            }
          });
        }
        if (res.status === 413) {
          setSaveState('error', 'Note too long (max 64 KB)');
          return;
        }
        throw new Error('save failed');
      })
      .catch(function () {
        setSaveState('offline', 'Offline — retrying…');
        scheduleRetry(slideKey, body);
      });
  }

  function scheduleRetry(slideKey, body) {
    if (retryTimer) return;
    var delay = Math.min(RETRY_BASE_MS * Math.pow(2, retryAttempt), RETRY_MAX_MS);
    retryAttempt += 1;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      persistRegistered(slideKey, body);
    }, delay);
  }

  function persistSlide(slideKey, body) {
    if (!ctx.isSessionDeck() || readOnly) return Promise.resolve();

    noteCache[slideKey] = body;

    if (ctx.isAuthenticated()) {
      return persistRegistered(slideKey, body);
    }

    writeGuestStorage(noteCache);
    setSaveState('idle', '');
    return Promise.resolve();
  }

  function scheduleSave(slideKey, body) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      persistSlide(slideKey, body);
    }, SAVE_DEBOUNCE_MS);
  }

  function fetchBulkCache() {
    if (!ctx.isSessionDeck()) return Promise.resolve();

    if (!ctx.isAuthenticated()) {
      noteCache = readGuestStorage();
      return Promise.resolve();
    }

    var sessionId = ctx.getSessionId();
    return fetch(
      ctx.getApiBase() +
        '/sessions/' +
        encodeURIComponent(sessionId) +
        '/notes',
      { credentials: 'include' }
    )
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (body) {
        var list =
          body && body.data && Array.isArray(body.data.notes) ? body.data.notes : [];
        list.forEach(function (row) {
          if (row && row.slide_key) {
            noteCache[row.slide_key] = typeof row.body === 'string' ? row.body : '';
          }
        });
      })
      .catch(function () {
        /* use sessionStorage fallback only for guests */
      });
  }

  function loadAndSync() {
    if (!ctx.isSessionDeck()) return Promise.resolve();
    if (loadPromise) return loadPromise;

    loadPromise = fetchBulkCache()
      .then(function () {
        if (!deckSlideKey) {
          deckSlideKey = ctx.slideKeyFromReveal();
        }
        if (!editingSlideKey) {
          editingSlideKey = deckSlideKey;
        }
        notifySlideContext(editingSlideKey, slideContextLabel(editingSlideKey));
        notifyChange();
        notifySyncState();
      })
      .finally(function () {
        loadPromise = null;
      });

    return loadPromise;
  }

  function onDeckSlideChanged(slideKey) {
    if (!slideKey) return;

    if (editingSlideKey && editingSlideKey !== slideKey) {
      flushPendingForSlide(editingSlideKey);
    }

    deckSlideKey = slideKey;

    if (!isLearnerControllingNotes()) {
      loadEditingSlide(slideKey, true);
    } else {
      notifySyncState();
    }
  }

  function flushPendingForSlide(slideKey) {
    if (!slideKey) return Promise.resolve();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    var body = noteCache[slideKey];
    if (body === undefined) return Promise.resolve();
    return persistSlide(slideKey, body);
  }

  function bindSlideHandlers() {
    if (slideHandlersBound || typeof Reveal === 'undefined') return;
    slideHandlersBound = true;

    function handleSlide() {
      if (!ctx.isSessionDeck()) return;
      if (!ctx.isLive() && !ctx.isReviewMode()) return;
      onDeckSlideChanged(ctx.slideKeyFromReveal());
    }

    Reveal.on('slidechanged', handleSlide);
    Reveal.on('fragmentshown', handleSlide);
    Reveal.on('fragmenthidden', handleSlide);
    handleSlide();
  }

  function init(options) {
    if (options) {
      if (typeof options.getSessionId === 'function') ctx.getSessionId = options.getSessionId;
      if (typeof options.getApiBase === 'function') ctx.getApiBase = options.getApiBase;
      if (typeof options.isAuthenticated === 'function') {
        ctx.isAuthenticated = options.isAuthenticated;
      }
      if (typeof options.isSessionDeck === 'function') ctx.isSessionDeck = options.isSessionDeck;
      if (typeof options.slideKeyFromReveal === 'function') {
        ctx.slideKeyFromReveal = options.slideKeyFromReveal;
      }
      if (typeof options.isReviewMode === 'function') ctx.isReviewMode = options.isReviewMode;
      if (typeof options.isLive === 'function') ctx.isLive = options.isLive;
      if (typeof options.getInstructorSlideKey === 'function') {
        ctx.getInstructorSlideKey = options.getInstructorSlideKey;
      }
    }
  }

  function setInstructorSlideKey(key) {
    instructorSlideKey = key || null;
    notifySyncState();
  }

  function byteLengthUtf8(str) {
    return PlatformDomUtils.byteLengthUtf8(str);
  }

  function goToCurrentSlideNote() {
    var targetKey = resolveInstructorSlideKey() || deckSlideKey;
    if (!targetKey) return;
    loadEditingSlide(targetKey, true);
  }

  function syncEditingToDeck() {
    if (!deckSlideKey) {
      deckSlideKey = ctx.slideKeyFromReveal();
    }
    if (deckSlideKey) {
      loadEditingSlide(deckSlideKey, true);
    }
  }

  function goToAdjacentSlideNote(delta) {
    if (!delta) return;
    var keys = enumerateSlideKeys();
    var index = resolveKeyIndex(keys, editingSlideKey, deckSlideKey);
    if (index < 0) return;
    var next = index + delta;
    if (next < 0 || next >= keys.length) return;
    if (delta > 0 && ctx.isLive() && !ctx.isReviewMode()) {
      var instructorKey = resolveInstructorSlideKey();
      if (
        instructorKey &&
        !PlatformPositionUtils.canNavigateNotesForward(
          editingSlideKey,
          instructorKey,
          keys
        )
      ) {
        return;
      }
    }
    loadEditingSlide(keys[next], true);
  }

  window.PlatformSlideNotes = {
    init: init,
    loadAndSync: loadAndSync,
    bindSlideHandlers: bindSlideHandlers,
    loadForSlide: function (slideKey) {
      return noteCache[slideKey] || '';
    },
    getDeckSlideKey: function () {
      return deckSlideKey;
    },
    getEditingSlideKey: function () {
      return editingSlideKey;
    },
    getCurrentSlideKey: function () {
      return editingSlideKey;
    },
    isOutOfSync: function () {
      return !!(deckSlideKey && editingSlideKey && deckSlideKey !== editingSlideKey);
    },
    goToCurrentSlideNote: goToCurrentSlideNote,
    goToAdjacentSlideNote: goToAdjacentSlideNote,
    syncEditingToDeck: syncEditingToDeck,
    setEditingPinned: function (pinned) {
      editingFocused = !!pinned;
      notifySyncState();
    },
    setEditingDirty: function (dirty) {
      editingDirty = !!dirty;
      notifySyncState();
    },
    getSyncState: getSyncState,
    refreshSyncState: notifySyncState,
    setBody: function (slideKey, body) {
      if (readOnly || !ctx.isSessionDeck()) return;
      if (typeof body !== 'string') return;
      if (byteLengthUtf8(body) > MAX_BODY_BYTES) {
        setSaveState('error', 'Note too long (max 64 KB)');
        return;
      }
      var key = slideKey || editingSlideKey;
      if (!key) return;
      noteCache[key] = body;
      editingDirty = true;
      scheduleSave(key, body);
      notifyChange();
      notifySyncState();
    },
    flushPending: function () {
      if (!editingSlideKey) return Promise.resolve();
      return flushPendingForSlide(editingSlideKey);
    },
    flushGuestNotesToServer: function () {
      if (!ctx.isSessionDeck() || !ctx.isAuthenticated()) {
        return Promise.resolve();
      }

      var guestNotes = readGuestStorage();
      var merged = Object.assign({}, guestNotes, noteCache);
      var entries = Object.keys(merged).filter(function (key) {
        return typeof merged[key] === 'string' && merged[key].length > 0;
      });

      if (entries.length === 0) {
        clearGuestStorage();
        return Promise.resolve();
      }

      var sessionId = ctx.getSessionId();
      return Promise.all(
        entries.map(function (slideKey) {
          return fetch(
            ctx.getApiBase() +
              '/sessions/' +
              encodeURIComponent(sessionId) +
              '/notes',
            {
              method: 'PUT',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slide_key: slideKey, body: merged[slideKey] }),
            }
          );
        })
      ).then(function () {
        clearGuestStorage();
        return loadAndSync();
      });
    },
    getSaveState: function () {
      return saveState;
    },
    onChange: function (listener) {
      if (typeof listener === 'function') changeListeners.push(listener);
    },
    onSlideContext: function (listener) {
      if (typeof listener === 'function') slideContextListeners.push(listener);
    },
    onSyncState: function (listener) {
      if (typeof listener === 'function') syncStateListeners.push(listener);
    },
    onSlideChanged: onDeckSlideChanged,
    setInstructorSlideKey: setInstructorSlideKey,
    setInstructorSlideKeyForTest: setInstructorSlideKey,
  };
})();
