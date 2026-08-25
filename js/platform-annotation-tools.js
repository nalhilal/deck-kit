/**
 * Action Panel Tools — annotation control state (Batch 07.6–07.7).
 */
(function () {
  var ctx = {
    slideKeyFromReveal: function () {
      return null;
    },
    isGuest: function () {
      return false;
    },
  };
  var drawingModeListeners = [];
  var unsubscribers = [];
  var armedDraw = false;

  function adapter() {
    return window.TldrevealAdapter;
  }

  function isPanelOpen() {
    return Boolean(
      window.PlatformControlPanel &&
        typeof PlatformControlPanel.isOpen === 'function' &&
        PlatformControlPanel.isOpen()
    );
  }

  function refreshTools() {
    if (typeof window.PlatformControlPanelTools !== 'undefined') {
      PlatformControlPanelTools.refresh();
    }
  }

  function isReady() {
    var a = adapter();
    return a && typeof a.isReady === 'function' && a.isReady();
  }

  function isEditingMode() {
    var a = adapter();
    if (!a || typeof a.isDrawingMode !== 'function') return false;
    return a.isDrawingMode();
  }

  function isInkVisible() {
    var a = adapter();
    if (!a || typeof a.isInkVisible !== 'function') return true;
    return a.isInkVisible();
  }

  function hasInkOnCurrentSlide() {
    var slideKey = ctx.slideKeyFromReveal();
    if (!slideKey) return false;
    var a = adapter();
    if (!a || typeof a.hasInkOnSlideKey !== 'function') return false;
    return a.hasInkOnSlideKey(slideKey);
  }

  function notifyDrawingModeChange(isOn) {
    drawingModeListeners.forEach(function (fn) {
      try {
        fn(isOn);
      } catch (e) {
        /* ignore */
      }
    });
  }

  function setDrawingMode(on, options) {
    options = options || {};
    var a = adapter();
    if (!a || typeof a.setDrawingMode !== 'function') return;

    if (on) {
      // Arm-then-draw: while the modal panel is open its backdrop intercepts
      // deck clicks, so drawing cannot happen yet. Keep the panel open, mark
      // draw as armed, and activate real editing when the panel closes
      // (see the onClose hook in init). Activating immediately would let
      // tldreveal's window-capture Escape swallow the panel's Escape-to-close
      // and would engage follow-hold before any drawing.
      if (isPanelOpen()) {
        armedDraw = true;
        refreshTools();
        return;
      }
      armedDraw = false;
      if (!isEditingMode()) a.setDrawingMode(true);
    } else {
      armedDraw = false;
      if (isEditingMode()) a.setDrawingMode(false);
      refreshTools();
    }
  }

  function activateArmedDrawOnClose() {
    if (!armedDraw) return;
    armedDraw = false;
    var a = adapter();
    if (a && typeof a.enterDrawingMode === 'function' && !isEditingMode()) {
      a.enterDrawingMode();
    }
  }

  function setInkVisible(visible) {
    var a = adapter();
    if (!a || typeof a.setInkVisible !== 'function') return;
    a.setInkVisible(visible);
  }

  function bindReveal() {
    if (typeof Reveal === 'undefined') return;
    function onSlide() {
      if (typeof window.PlatformControlPanelTools !== 'undefined') {
        PlatformControlPanelTools.refresh();
      }
    }
    Reveal.on('slidechanged', onSlide);
    Reveal.on('fragmentshown', onSlide);
    Reveal.on('fragmenthidden', onSlide);
  }

  function bindAdapterControl() {
    var a = adapter();
    if (!a || typeof a.onControlStateChange !== 'function') return;
    var wasDrawing = isEditingMode();
    unsubscribers.push(
      a.onControlStateChange(function (state) {
        if (!state) return;
        if (state.drawingMode !== wasDrawing) {
          wasDrawing = state.drawingMode;
          notifyDrawingModeChange(wasDrawing);
        }
        if (typeof window.PlatformControlPanelTools !== 'undefined') {
          PlatformControlPanelTools.refresh();
        }
      })
    );
  }

  function bindPanelClose() {
    if (
      window.PlatformControlPanel &&
      typeof PlatformControlPanel.onClose === 'function'
    ) {
      unsubscribers.push(PlatformControlPanel.onClose(activateArmedDrawOnClose));
    }
  }

  function init(options) {
    if (options) {
      if (typeof options.slideKeyFromReveal === 'function') {
        ctx.slideKeyFromReveal = options.slideKeyFromReveal;
      }
      if (typeof options.isGuest === 'function') {
        ctx.isGuest = options.isGuest;
      }
    }
    bindPanelClose();
    bindReveal();
    if (
      window.PlatformBridge &&
      typeof PlatformBridge.bindAnnotationDrawModeHold === 'function'
    ) {
      PlatformBridge.bindAnnotationDrawModeHold();
    }
    var start = Date.now();
    (function waitForAdapter() {
      if (isReady()) {
        bindAdapterControl();
        return;
      }
      if (Date.now() - start < 12000) {
        setTimeout(waitForAdapter, 200);
      }
    })();
  }

  function onDrawingModeChange(listener) {
    if (typeof listener !== 'function') return function () {};
    drawingModeListeners.push(listener);
    return function () {
      drawingModeListeners = drawingModeListeners.filter(function (fn) {
        return fn !== listener;
      });
    };
  }

  function isWhiteboardSlideActive() {
    var html = document.documentElement;
    if (html.classList.contains('fx-whiteboard-active')) return true;
    if (typeof Reveal === 'undefined') return false;
    var slide = Reveal.getCurrentSlide();
    return Boolean(slide && slide.classList && slide.classList.contains('whiteboard-slide'));
  }

  function isDrawModeArmed() {
    return armedDraw;
  }

  window.PlatformAnnotationTools = {
    init: init,
    isEditingMode: isEditingMode,
    isDrawModeArmed: isDrawModeArmed,
    isInkVisible: isInkVisible,
    hasInkOnCurrentSlide: hasInkOnCurrentSlide,
    setDrawingMode: setDrawingMode,
    setInkVisible: setInkVisible,
    isReady: isReady,
    isWhiteboardSlideActive: isWhiteboardSlideActive,
    isGuest: function () {
      return ctx.isGuest();
    },
    onDrawingModeChange: onDrawingModeChange,
  };
})();
