/**
 * Action Panel Tools tab UI (Batch 07.6–07.7).
 */
(function () {
  var mounted = false;
  var rootEl = null;
  var statusEl = null;
  var showInkEl = null;
  var drawModeEl = null;
  var drawHintEl = null;
  var saveEl = null;
  var whiteboardHintEl = null;
  var saveUnsub = null;
  var controlUnsub = null;

  function buildMarkup() {
    return (
      '<div class="platform-control-panel-tools">' +
      '<h3 class="platform-control-panel-tools-title">Annotations</h3>' +
      '<p class="platform-control-panel-tools-status" id="platform-control-panel-tools-ink-status" aria-live="polite">No ink on this slide</p>' +
      '<label class="platform-control-panel-tools-toggle">' +
      '<input type="checkbox" id="platform-control-panel-tools-show-ink" checked />' +
      '<span>Show ink on slide</span>' +
      '</label>' +
      '<label class="platform-control-panel-tools-toggle platform-control-panel-tools-toggle--primary">' +
      '<input type="checkbox" id="platform-control-panel-tools-draw-mode" />' +
      '<span>Draw mode</span>' +
      '</label>' +
      '<p class="platform-control-panel-tools-draw-hint" id="platform-control-panel-tools-draw-hint" aria-live="polite" hidden>Close this panel to draw on the slide.</p>' +
      '<p class="platform-control-panel-tools-save platform-control-panel-tools-save--idle" id="platform-control-panel-tools-save" aria-live="polite"></p>' +
      '<p class="platform-control-panel-tools-privacy">Your ink — only you can see this</p>' +
      '<p class="platform-control-panel-tools-hint" id="platform-control-panel-tools-whiteboard-hint" hidden>Class board slide — your private ink is separate from the facilitator board.</p>' +
      '</div>'
    );
  }

  function syncSaveIndicator(state, message) {
    if (!saveEl) return;
    var status = state || 'idle';
    saveEl.className =
      'platform-control-panel-tools-save platform-control-panel-tools-save--' + status;
    saveEl.textContent = message || '';
  }

  function refresh() {
    if (!mounted || !window.PlatformAnnotationTools) return;

    var hasInk = PlatformAnnotationTools.hasInkOnCurrentSlide();
    if (statusEl) {
      statusEl.textContent = hasInk ? 'Ink on this slide' : 'No ink on this slide';
    }

    var ready = PlatformAnnotationTools.isReady();
    var inkVisible = PlatformAnnotationTools.isInkVisible();
    var armed =
      typeof PlatformAnnotationTools.isDrawModeArmed === 'function' &&
      PlatformAnnotationTools.isDrawModeArmed();
    var drawing = armed || PlatformAnnotationTools.isEditingMode();

    if (showInkEl) {
      showInkEl.checked = inkVisible;
      showInkEl.disabled = !ready;
    }
    if (drawModeEl) {
      drawModeEl.checked = drawing;
      drawModeEl.disabled = !ready;
    }
    if (drawHintEl) {
      drawHintEl.hidden = !drawing;
    }

    if (whiteboardHintEl) {
      whiteboardHintEl.hidden = !PlatformAnnotationTools.isWhiteboardSlideActive();
    }
  }

  function mount(panelEl) {
    if (!panelEl || mounted) return;
    mounted = true;
    panelEl.innerHTML = buildMarkup();
    rootEl = panelEl.querySelector('.platform-control-panel-tools');
    statusEl = panelEl.querySelector('#platform-control-panel-tools-ink-status');
    showInkEl = panelEl.querySelector('#platform-control-panel-tools-show-ink');
    drawModeEl = panelEl.querySelector('#platform-control-panel-tools-draw-mode');
    drawHintEl = panelEl.querySelector('#platform-control-panel-tools-draw-hint');
    saveEl = panelEl.querySelector('#platform-control-panel-tools-save');
    whiteboardHintEl = panelEl.querySelector('#platform-control-panel-tools-whiteboard-hint');

    if (showInkEl) {
      showInkEl.addEventListener('change', function () {
        if (!window.PlatformAnnotationTools) return;
        // Optimistic: the checkbox already holds the requested value. The
        // control-state observer refreshes once tldreveal applies it, so a
        // synchronous refresh (stale DOM read) that reverts the box is avoided.
        PlatformAnnotationTools.setInkVisible(showInkEl.checked);
      });
    }

    if (drawModeEl) {
      drawModeEl.addEventListener('change', function () {
        if (!window.PlatformAnnotationTools) return;
        PlatformAnnotationTools.setDrawingMode(drawModeEl.checked, { source: 'tools-tab' });
      });
    }

    if (
      window.PlatformBridgeAnnotations &&
      typeof PlatformBridgeAnnotations.onSaveStateChange === 'function'
    ) {
      saveUnsub = PlatformBridgeAnnotations.onSaveStateChange(function (payload) {
        if (!payload) return;
        var msg = payload.message || '';
        if (payload.state === 'saved' && PlatformAnnotationTools.isGuest()) {
          msg = 'Saved for this session';
        }
        syncSaveIndicator(payload.state, msg);
      });
    }

    if (window.TldrevealAdapter && typeof TldrevealAdapter.onControlStateChange === 'function') {
      controlUnsub = TldrevealAdapter.onControlStateChange(function () {
        refresh();
      });
    }

    refresh();
  }

  window.PlatformControlPanelTools = {
    mount: mount,
    refresh: refresh,
  };
})();
