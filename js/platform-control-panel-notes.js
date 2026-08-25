/**
 * Action Panel Notes tab — per-slide text editor (Batch 07.5).
 */
(function () {
  var mounted = false;
  var rootEl = null;
  var contextEl = null;
  var mismatchEl = null;
  var inputEl = null;
  var saveEl = null;
  var prevBtn = null;
  var nextBtn = null;
  var currentBtn = null;
  var suppressInput = false;

  function buildMarkup() {
    return (
      '<div class="platform-control-panel-notes">' +
      '<h3 class="platform-control-panel-notes-title">Your notes</h3>' +
      '<div class="platform-control-panel-notes-header">' +
      '<p class="platform-control-panel-notes-context" id="platform-control-panel-notes-slide">Slide 0/0</p>' +
      '<div class="platform-control-panel-notes-nav">' +
      '<button type="button" class="platform-control-panel-notes-nav-btn" id="platform-control-panel-notes-prev" aria-label="Previous slide note">◀</button>' +
      '<button type="button" class="platform-control-panel-notes-nav-btn" id="platform-control-panel-notes-next" aria-label="Next slide note">▶</button>' +
      '<button type="button" class="platform-control-panel-notes-current" id="platform-control-panel-notes-current" hidden>Go to current slide</button>' +
      '</div>' +
      '</div>' +
      '<p class="platform-control-panel-notes-mismatch" id="platform-control-panel-notes-mismatch" hidden aria-live="polite"></p>' +
      '<p class="platform-control-panel-notes-ceiling-hint" id="platform-control-panel-notes-ceiling-hint" hidden>Instructor has not reached the next slide yet</p>' +
      '<label class="platform-control-panel-notes-label" for="platform-control-panel-notes-input">Your note for this slide</label>' +
      '<textarea id="platform-control-panel-notes-input" class="platform-control-panel-notes-input" rows="6" maxlength="65536" placeholder="Write a private note…"></textarea>' +
      '<p class="platform-control-panel-notes-save platform-control-panel-notes-save--idle" id="platform-control-panel-notes-save" aria-live="polite"></p>' +
      '</div>'
    );
  }

  function syncSaveIndicator(state) {
    if (!saveEl || !state) return;
    saveEl.className =
      'platform-control-panel-notes-save platform-control-panel-notes-save--' +
      (state.status || 'idle');
    saveEl.textContent = state.message || '';
  }

  function syncFromService(payload) {
    if (!inputEl || !window.PlatformSlideNotes) return;

    var editingKey = PlatformSlideNotes.getEditingSlideKey();
    if (
      payload &&
      payload.slideKey &&
      payload.body !== undefined &&
      payload.slideKey === editingKey
    ) {
      if (inputEl.value !== payload.body) {
        suppressInput = true;
        inputEl.value = payload.body;
        suppressInput = false;
        if (PlatformSlideNotes.setEditingDirty) {
          PlatformSlideNotes.setEditingDirty(false);
        }
      }
    }

    if (payload && payload.saveState) {
      syncSaveIndicator(payload.saveState);
    } else {
      syncSaveIndicator(PlatformSlideNotes.getSaveState());
    }
  }

  function syncSlideContext(ctx) {
    if (!contextEl || !ctx) return;
    contextEl.textContent = ctx.label || 'Slide';
    if (prevBtn && ctx.label) {
      prevBtn.setAttribute('aria-label', 'Previous slide note (' + ctx.label + ')');
    }
    if (nextBtn && ctx.label) {
      nextBtn.setAttribute('aria-label', 'Next slide note (' + ctx.label + ')');
    }
  }

  function syncNavState(state) {
    if (!state) return;
    if (prevBtn) prevBtn.disabled = !state.canGoPrev;
    if (nextBtn) {
      nextBtn.disabled = !state.canGoNext;
      if (!state.canGoNext && state.atCeiling) {
        nextBtn.title = 'Instructor has not reached the next slide yet';
        nextBtn.setAttribute(
          'aria-describedby',
          'platform-control-panel-notes-ceiling-hint'
        );
      } else {
        nextBtn.removeAttribute('title');
        nextBtn.removeAttribute('aria-describedby');
      }
    }
    if (currentBtn) {
      currentBtn.hidden = !state.outOfSync;
      currentBtn.textContent = 'Go to instructor slide';
    }
    if (mismatchEl) {
      if (state.outOfSync && state.instructorLearnerPosition) {
        mismatchEl.hidden = false;
        mismatchEl.textContent =
          'Instructor is on slide ' + state.instructorLearnerPosition;
      } else {
        mismatchEl.hidden = true;
        mismatchEl.textContent = '';
      }
    }
  }

  function bindEvents() {
    if (!inputEl) return;

    inputEl.addEventListener('input', function () {
      if (suppressInput || !window.PlatformSlideNotes) return;
      var slideKey = PlatformSlideNotes.getEditingSlideKey();
      if (!slideKey) return;
      PlatformSlideNotes.setBody(slideKey, inputEl.value);
    });

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        if (window.PlatformSlideNotes) {
          PlatformSlideNotes.goToAdjacentSlideNote(-1);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (window.PlatformSlideNotes) {
          PlatformSlideNotes.goToAdjacentSlideNote(1);
        }
      });
    }

    if (currentBtn) {
      currentBtn.addEventListener('click', function () {
        if (window.PlatformSlideNotes) {
          PlatformSlideNotes.goToCurrentSlideNote();
        }
      });
    }

    if (window.PlatformSlideNotes) {
      PlatformSlideNotes.onChange(syncFromService);
      PlatformSlideNotes.onSlideContext(syncSlideContext);
      if (PlatformSlideNotes.onSyncState) {
        PlatformSlideNotes.onSyncState(syncNavState);
      }
    }
  }

  function mount(panelEl) {
    if (!panelEl || mounted) return;
    mounted = true;
    rootEl = panelEl;
    panelEl.innerHTML = buildMarkup();
    contextEl = panelEl.querySelector('#platform-control-panel-notes-slide');
    mismatchEl = panelEl.querySelector('#platform-control-panel-notes-mismatch');
    inputEl = panelEl.querySelector('#platform-control-panel-notes-input');
    saveEl = panelEl.querySelector('#platform-control-panel-notes-save');
    prevBtn = panelEl.querySelector('#platform-control-panel-notes-prev');
    nextBtn = panelEl.querySelector('#platform-control-panel-notes-next');
    currentBtn = panelEl.querySelector('#platform-control-panel-notes-current');
    bindEvents();

    if (window.PlatformSlideNotes) {
      var slideKey =
        PlatformSlideNotes.getEditingSlideKey() || PlatformSlideNotes.getDeckSlideKey();
      if (slideKey) {
        syncFromService({
          slideKey: slideKey,
          body: PlatformSlideNotes.loadForSlide(slideKey),
          saveState: PlatformSlideNotes.getSaveState(),
        });
      }
      if (PlatformSlideNotes.getSyncState) {
        var state = PlatformSlideNotes.getSyncState();
        if (state.editingSlideKey) {
          syncSlideContext({
            slideKey: state.editingSlideKey,
            label: state.editingSlideLabel,
          });
        } else if (state.deckSlideKey) {
          syncSlideContext({
            slideKey: state.deckSlideKey,
            label: state.deckSlideLabel,
          });
        }
        syncNavState(state);
      }
    }
  }

  window.PlatformControlPanelNotes = {
    mount: mount,
  };
})();
