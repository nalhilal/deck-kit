/**
 * Poll overlay render helpers (instructor controls, learner panel, results HUD).
 */
(function () {
  var ctx = null;

  function escapeHtml(text) {
    return PlatformDomUtils.escapeHtml(text);
  }

  function clearInstructorUiMount(mount) {
    if (mount === 'speaker') {
      var chromeControls = document.getElementById('platform-poll-controls');
      if (chromeControls) chromeControls.innerHTML = '';
      var chromeResults = document.getElementById('platform-poll-results');
      if (chromeResults) {
        chromeResults.innerHTML = '';
        chromeResults.classList.remove('visible');
      }
    } else {
      var mirrorControls = document.getElementById('platform-poll-controls-mirror');
      if (mirrorControls) mirrorControls.innerHTML = '';
      var mirrorResults = document.getElementById('platform-poll-results-mirror');
      if (mirrorResults) {
        mirrorResults.innerHTML = '';
        mirrorResults.classList.remove('visible');
      }
    }
  }

  function renderOptionRows(poll, opts) {
    var showBars = ctx.shouldShowInlineBars(poll);
    var hasVotedLocal = opts.hasVoted;
    var pollResults = ctx.getPollResults();

    return poll.options
      .map(function (opt) {
        var checked = opts.selectedId === opt.id ? ' checked' : '';
        var disabled = hasVotedLocal ? ' disabled' : '';
        var count = showBars ? pollResults.counts[opt.id] || 0 : 0;
        var pct = showBars ? pollResults.percentages[opt.id] || 0 : 0;
        var barVisibleClass = showBars ? ' platform-poll-bar-visible' : '';
        return (
          '<label class="platform-poll-option-row' +
          barVisibleClass +
          '">' +
          '<span class="platform-poll-option-select">' +
          '<input type="radio" name="platform-poll-option" value="' +
          escapeHtml(opt.id) +
          '"' +
          checked +
          disabled +
          ' />' +
          '<span class="platform-poll-option-label">' +
          escapeHtml(opt.label) +
          '</span>' +
          '</span>' +
          '<span class="platform-poll-bar-track" aria-hidden="true">' +
          '<span class="platform-poll-bar-fill" style="width:' +
          pct +
          '%"></span>' +
          '</span>' +
          '<span class="platform-poll-bar-stat">' +
          (showBars ? count + ' (' + pct + '%)' : '') +
          '</span>' +
          '</label>'
        );
      })
      .join('');
  }

  function renderResultsHud() {
    var hudPoll = ctx.getSlideContextPoll();
    var hudResults = hudPoll ? ctx.getResultsForPoll(hudPoll) : null;

    if (
      !ctx.shouldShowLivePollUi() ||
      !hudPoll ||
      !hudResults ||
      ctx.getRole() !== 'instructor'
    ) {
      ctx.hideResultsHud();
      return;
    }

    var hud = ctx.ensureResultsHud();
    var rows = hudPoll.options
      .map(function (opt) {
        var count = hudResults.counts[opt.id] || 0;
        var pct = hudResults.percentages[opt.id] || 0;
        return (
          '<div class="platform-poll-results-row">' +
          '<span class="platform-poll-results-label">' +
          escapeHtml(opt.label) +
          '</span>' +
          '<span class="platform-poll-results-bar" style="width:' +
          pct +
          '%"></span>' +
          '<span class="platform-poll-results-count">' +
          count +
          ' (' +
          pct +
          '%)</span>' +
          '</div>'
        );
      })
      .join('');

    hud.innerHTML =
      '<div class="platform-poll-results-card">' +
      '<p class="platform-poll-results-title">' +
      escapeHtml(hudPoll.question) +
      '</p>' +
      rows +
      '<p class="platform-poll-results-total">Total: ' +
      (hudResults.total || 0) +
      '</p>' +
      '</div>';
    hud.classList.add('visible');
    ctx.syncSpeakerPanel();
  }

  function renderLearnerPanel() {
    if (!ctx.shouldShowLearnerPanel()) {
      ctx.hidePanel();
      return;
    }

    var panelPoll = ctx.getPanelPoll();
    var panel = ctx.ensurePanel();
    var optionsHtml = renderOptionRows(panelPoll, {
      hasVoted: ctx.getHasVoted(),
      selectedId: ctx.getSelectedOptionId(),
    });

    var statusHtml = ctx.getHasVoted()
      ? '<p class="platform-poll-status">Vote recorded</p>'
      : '<button type="button" class="platform-poll-submit" id="platform-poll-submit">Submit vote</button>';

    panel.innerHTML =
      '<div class="platform-poll-panel-card">' +
      '<div class="platform-poll-panel-header">' +
      '<p class="platform-poll-question">' +
      escapeHtml(panelPoll.question) +
      '</p>' +
      '<button type="button" class="platform-poll-dismiss" id="platform-poll-dismiss" aria-label="Dismiss poll panel">×</button>' +
      '</div>' +
      '<div class="platform-poll-options">' +
      optionsHtml +
      '</div>' +
      statusHtml +
      '</div>';
    panel.classList.add('visible');

    var dismissBtn = document.getElementById('platform-poll-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', ctx.onDismissLearnerPanel);
    }

    if (!ctx.getHasVoted()) {
      panel.querySelectorAll('input[name="platform-poll-option"]').forEach(function (input) {
        input.addEventListener('change', function () {
          ctx.setSelectedOptionId(input.value);
        });
      });
      var submit = document.getElementById('platform-poll-submit');
      if (submit) {
        submit.addEventListener('click', ctx.onSubmitVote);
      }
    }
  }

  function renderStatusBanner() {
    var message = ctx.getControlStatusMessage();
    if (!message) return '';
    var isError = ctx.getControlStatusIsError();
    var cls = isError
      ? 'platform-poll-controls-status platform-poll-controls-status-error'
      : 'platform-poll-controls-status';
    return '<p class="' + cls + '">' + escapeHtml(message) + '</p>';
  }

  function wireControlButtons(controls) {
    var closeBtn = controls.querySelector('#platform-poll-close');
    if (closeBtn) closeBtn.addEventListener('click', ctx.onClosePoll);
    var revealBtn = controls.querySelector('#platform-poll-reveal');
    if (revealBtn) revealBtn.addEventListener('click', ctx.onShowResultsToAudience);
    var startBtn = controls.querySelector('#platform-poll-start');
    if (startBtn && !startBtn.disabled) {
      startBtn.addEventListener('click', ctx.onStartPoll);
    }
  }

  function buildResultsModeSelect(mode) {
    return (
      '<label class="platform-poll-mode-label">Results' +
      '<select id="platform-poll-results-mode" class="platform-poll-mode-select">' +
      '<option value="live"' +
      (mode === 'live' ? ' selected' : '') +
      '>Live</option>' +
      '<option value="hidden_until_close"' +
      (mode === 'hidden_until_close' ? ' selected' : '') +
      '>Hidden until close</option>' +
      '<option value="instructor_only"' +
      (mode === 'instructor_only' ? ' selected' : '') +
      '>Instructor only</option>' +
      '</select></label>'
    );
  }

  function renderInstructorControls() {
    var mount = ctx.getInstructorUiMount();
    clearInstructorUiMount(mount === 'speaker' ? 'speaker' : 'main');
    var controls = ctx.ensurePollControls();
    if (!controls) return;
    if (!ctx.shouldShowLivePollUi() || ctx.getRole() !== 'instructor') {
      controls.innerHTML = '';
      ctx.syncSpeakerPanel();
      return;
    }

    var statusBanner = renderStatusBanner();
    var definition = ctx.getCurrentSlideDefinition();

    if (!definition) {
      controls.innerHTML = statusBanner;
      ctx.syncSpeakerPanel();
      return;
    }

    var ctxPoll = ctx.getSlideContextPoll();
    var activePoll = ctx.getActivePoll();
    var otherPollOpen = activePoll && !ctx.isPollForCurrentSlide(activePoll);
    var revealHtml = ctx.shouldShowRevealButton(ctxPoll)
      ? '<button type="button" class="platform-poll-btn" id="platform-poll-reveal">Show results</button>'
      : '';

    if (otherPollOpen) {
      var blockedMode = definition.default_results_mode || 'hidden_until_close';
      controls.innerHTML =
        statusBanner +
        '<p class="platform-poll-controls-status">End the open poll on the earlier question first.</p>' +
        '<div class="platform-poll-controls-row">' +
        '<button type="button" class="platform-poll-btn platform-poll-btn-primary" id="platform-poll-start" disabled>Start voting</button>' +
        buildResultsModeSelect(blockedMode) +
        '</div>';
      ctx.syncSpeakerPanel();
      return;
    }

    if (activePoll && ctx.isPollForCurrentSlide(activePoll)) {
      controls.innerHTML =
        statusBanner +
        '<div class="platform-poll-controls-row">' +
        revealHtml +
        '<button type="button" class="platform-poll-btn platform-poll-btn-danger" id="platform-poll-close">End voting</button>' +
        '</div>';
      wireControlButtons(controls);
      ctx.syncSpeakerPanel();
      return;
    }

    var slidePollRecord = ctx.getSlidePollRecord();
    if (
      slidePollRecord &&
      slidePollRecord.status === 'closed' &&
      ctx.isPollForCurrentSlide(slidePollRecord)
    ) {
      controls.innerHTML =
        statusBanner +
        '<div class="platform-poll-controls-row">' +
        revealHtml +
        '</div>';
      wireControlButtons(controls);
      ctx.syncSpeakerPanel();
      return;
    }

    var mode = definition.default_results_mode || 'hidden_until_close';
    controls.innerHTML =
      statusBanner +
      '<div class="platform-poll-controls-row">' +
      '<button type="button" class="platform-poll-btn platform-poll-btn-primary" id="platform-poll-start">Start voting</button>' +
      buildResultsModeSelect(mode) +
      '</div>';
    wireControlButtons(controls);
    ctx.syncSpeakerPanel();
  }

  function renderPollUi() {
    renderInstructorControls();
    renderLearnerPanel();
    renderResultsHud();
  }

  function init(renderCtx) {
    ctx = renderCtx;
  }

  window.PlatformBridgePollsRender = {
    init: init,
    renderPollUi: renderPollUi,
    renderInstructorControls: renderInstructorControls,
    renderLearnerPanel: renderLearnerPanel,
    renderResultsHud: renderResultsHud,
  };
})();
