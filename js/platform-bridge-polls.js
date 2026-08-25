/**
 * Live poll overlays and instructor controls (Batch 03.3–03.5b, 03.5c UX).
 */
(function () {
  var activePoll = null;
  var displayPoll = null;
  var pollResults = null;
  var hasVoted = false;
  var selectedOptionId = null;
  var learnerResultsRevealed = false;
  var panelDismissed = false;
  var slidePollRecord = null;
  var slidePollResults = null;
  var learnerPollCache = {};
  var controlStatusMessage = null;
  var controlStatusIsError = false;
  var bridgeDeps = null;
  var speakerViewWindow = null;
  var speakerRelayMode = false;
  var instructorUiMount = 'main';

  function getCurrentSlideDefinition() {
    return window.PollDefinitionAdapter && PollDefinitionAdapter.getDefinitionForSlide
      ? PollDefinitionAdapter.getDefinitionForSlide()
      : null;
  }

  function normalizePollRecord(payload) {
    return {
      poll_uuid: payload.poll_uuid || payload.id,
      poll_id: payload.poll_id,
      slide_key: payload.slide_key,
      question: payload.question,
      options: payload.options,
      results_mode: payload.results_mode,
      status: payload.status || 'open',
    };
  }

  function cachePollRecord(poll) {
    if (!poll || !poll.poll_id) return;
    learnerPollCache[poll.poll_id] = poll;
  }

  function isPollForCurrentSlide(poll) {
    if (!poll) return false;
    var def = getCurrentSlideDefinition();
    return Boolean(def && def.poll_id === poll.poll_id);
  }

  function getSlideContextPoll() {
    if (activePoll && isPollForCurrentSlide(activePoll)) return activePoll;
    if (slidePollRecord && isPollForCurrentSlide(slidePollRecord)) return slidePollRecord;
    return null;
  }

  function getPanelPoll() {
    return displayPoll || activePoll;
  }

  function getResultsForPoll(poll) {
    if (!poll) return null;
    if (pollResults && pollResults.poll_uuid === poll.poll_uuid) {
      return pollResults;
    }
    if (slidePollResults && slidePollRecord && slidePollRecord.poll_uuid === poll.poll_uuid) {
      return slidePollResults;
    }
    return null;
  }

  function shouldShowInlineBars(poll) {
    if (!poll || !pollResults) return false;
    if (poll.results_mode === 'instructor_only') return learnerResultsRevealed;
    if (poll.results_mode === 'hidden_until_close') {
      return !activePoll || learnerResultsRevealed;
    }
    return true;
  }

  function shouldShowRevealButton(poll) {
    if (!poll) return false;
    var results = getResultsForPoll(poll);
    return Boolean(results && results.total > 0);
  }

  function ensureLearnerDisplayFromResults(payload) {
    if (!payload || !payload.poll_id) return;
    var existing = getPanelPoll();
    if (existing && existing.poll_uuid === payload.poll_uuid) return;

    var cached = learnerPollCache[payload.poll_id];
    if (cached) {
      displayPoll = {
        poll_uuid: cached.poll_uuid,
        poll_id: cached.poll_id,
        slide_key: cached.slide_key,
        question: cached.question,
        options: cached.options,
        results_mode: cached.results_mode,
        status: 'closed',
      };
      panelDismissed = false;
      return;
    }

    var def = getCurrentSlideDefinition();
    if (def && def.poll_id === payload.poll_id) {
      displayPoll = {
        poll_uuid: payload.poll_uuid,
        poll_id: payload.poll_id,
        slide_key: def.slide_key,
        question: def.question,
        options: def.options,
        results_mode: def.default_results_mode || 'hidden_until_close',
        status: 'closed',
      };
      panelDismissed = false;
    }
  }

  function setControlStatus(message, isError) {
    controlStatusMessage = message || null;
    controlStatusIsError = Boolean(isError);
    PlatformBridgePollsRender.renderInstructorControls();
  }

  function clearControlStatus() {
    controlStatusMessage = null;
    controlStatusIsError = false;
  }

  function ensurePanel() {
    var el = document.getElementById('platform-poll-panel');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'platform-poll-panel';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    return el;
  }

  function ensureResultsHud() {
    return getInstructorResultsEl();
  }

  function ensureMirrorResultsHud() {
    var el = document.getElementById('platform-poll-results-mirror');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'platform-poll-results-mirror';
    el.setAttribute('aria-hidden', 'true');
    el.className = 'platform-poll-results-mirror';
    document.body.appendChild(el);
    return el;
  }

  function getInstructorResultsEl() {
    if (instructorUiMount === 'speaker') {
      return ensureMirrorResultsHud();
    }
    var chrome = document.getElementById('platform-bridge-chrome');
    var el = document.getElementById('platform-poll-results');
    if (el && chrome && el.parentElement !== chrome) {
      chrome.appendChild(el);
    }
    if (el) return el;
    el = document.createElement('div');
    el.id = 'platform-poll-results';
    el.setAttribute('aria-live', 'polite');
    if (chrome) {
      chrome.appendChild(el);
    } else {
      document.body.appendChild(el);
    }
    return el;
  }

  function ensurePollControls() {
    return getInstructorControlsEl();
  }

  function ensureMirrorControls() {
    var el = document.getElementById('platform-poll-controls-mirror');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'platform-poll-controls-mirror';
    el.setAttribute('aria-hidden', 'true');
    el.className = 'platform-poll-controls-mirror';
    document.body.appendChild(el);
    return el;
  }

  function getInstructorControlsEl() {
    if (instructorUiMount === 'speaker') {
      return ensureMirrorControls();
    }
    var el = document.getElementById('platform-poll-controls');
    if (el) return el;
    var chrome = document.getElementById('platform-bridge-chrome');
    if (!chrome) return null;
    el = document.createElement('div');
    el.id = 'platform-poll-controls';
    chrome.appendChild(el);
    return el;
  }

  function syncSpeakerPanel() {
    if (instructorUiMount !== 'speaker' || !speakerViewWindow) {
      return;
    }
    if (!speakerRelayMode && speakerViewWindow.closed) {
      return;
    }
    var controls = document.getElementById('platform-poll-controls-mirror');
    var results = document.getElementById('platform-poll-results-mirror');
    var payload = {
      namespace: 'platform-poll',
      type: 'panel-html',
      controlsHtml: controls ? controls.innerHTML : '',
      resultsHtml: results ? results.innerHTML : '',
      resultsVisible: Boolean(results && results.classList.contains('visible')),
    };
    if (speakerRelayMode && window.opener) {
      window.opener.postMessage(
        JSON.stringify({
          type: 'platform-present:relay',
          namespace: 'platform-poll',
          payload: payload,
        }),
        '*'
      );
      return;
    }
    speakerViewWindow.postMessage(JSON.stringify(payload), '*');
  }

  function setSpeakerViewActive(active, win, options) {
    speakerRelayMode = Boolean(options && options.mode === 'relay');
    if (speakerRelayMode) {
      speakerViewWindow = active ? win : null;
    } else {
      speakerViewWindow = active && win && !win.closed ? win : null;
    }
    instructorUiMount = speakerViewWindow ? 'speaker' : 'main';
    if (instructorUiMount === 'speaker') {
      document.documentElement.classList.add('platform-instructor-speaker-active');
    } else {
      document.documentElement.classList.remove('platform-instructor-speaker-active');
      if (speakerViewWindow && !speakerRelayMode && !speakerViewWindow.closed) {
        speakerViewWindow.postMessage(
          JSON.stringify({ namespace: 'platform-poll', type: 'panel-clear' }),
          '*'
        );
      } else if (speakerRelayMode && window.opener) {
        window.opener.postMessage(
          JSON.stringify({
            type: 'platform-present:relay',
            namespace: 'platform-poll',
            payload: { namespace: 'platform-poll', type: 'panel-clear' },
          }),
          '*'
        );
      }
    }
    resolveSlidePollContext();
  }

  function proxyInstructorClick(elementId) {
    var root =
      instructorUiMount === 'speaker'
        ? document.getElementById('platform-poll-controls-mirror')
        : document.getElementById('platform-poll-controls');
    if (!root) return;
    var el = root.querySelector('#' + elementId);
    if (el) el.click();
  }

  function proxyInstructorSelect(elementId, value) {
    var root =
      instructorUiMount === 'speaker'
        ? document.getElementById('platform-poll-controls-mirror')
        : document.getElementById('platform-poll-controls');
    if (!root) return;
    var el = root.querySelector('#' + elementId);
    if (el) el.value = value;
  }

  function onInstructorNavigationSync() {
    if (!bridgeDeps || bridgeDeps.getRole() !== 'learner') return;
    var panel = document.getElementById('platform-poll-panel');
    if (!panel || !panel.classList.contains('visible')) return;
    if (activePoll && activePoll.status === 'open') {
      var def = getCurrentSlideDefinition();
      if (def && activePoll.slide_key === def.slide_key) return;
    }
    panelDismissed = true;
    hidePanel();
  }

  function hidePanel() {
    displayPoll = null;
    var panel = document.getElementById('platform-poll-panel');
    if (panel) {
      panel.innerHTML = '';
      panel.classList.remove('visible');
    }
  }

  function hideResultsHud() {
    var hud = document.getElementById('platform-poll-results');
    if (hud) {
      hud.innerHTML = '';
      hud.classList.remove('visible');
    }
    var mirror = document.getElementById('platform-poll-results-mirror');
    if (mirror) {
      mirror.innerHTML = '';
      mirror.classList.remove('visible');
    }
    syncSpeakerPanel();
  }

  function shouldShowLivePollUi() {
    return bridgeDeps && bridgeDeps.isLive() && !bridgeDeps.isReviewMode();
  }

  function shouldShowLearnerPanel() {
    return (
      shouldShowLivePollUi() &&
      !panelDismissed &&
      Boolean(getPanelPoll()) &&
      bridgeDeps.getRole() === 'learner'
    );
  }

  function teardownLivePollUi() {
    activePoll = null;
    displayPoll = null;
    pollResults = null;
    hasVoted = false;
    selectedOptionId = null;
    learnerResultsRevealed = false;
    panelDismissed = false;
    slidePollRecord = null;
    slidePollResults = null;
    learnerPollCache = {};
    clearControlStatus();
    hidePanel();
    hideResultsHud();
    var controls = document.getElementById('platform-poll-controls');
    if (controls) {
      controls.innerHTML = '';
    }
    var mirrorControls = document.getElementById('platform-poll-controls-mirror');
    if (mirrorControls) {
      mirrorControls.innerHTML = '';
    }
    var mirrorResults = document.getElementById('platform-poll-results-mirror');
    if (mirrorResults) {
      mirrorResults.innerHTML = '';
      mirrorResults.classList.remove('visible');
    }
    setSpeakerViewActive(false, null);
  }

  function dismissLearnerPanel() {
    panelDismissed = true;
    hidePanel();
  }

  function submitVote() {
    if (!activePoll || !selectedOptionId || hasVoted) return;
    fetch(
      bridgeDeps.getApiBase() + '/polls/' + encodeURIComponent(activePoll.poll_uuid) + '/responses',
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_id: selectedOptionId }),
      }
    )
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        if (result.ok) {
          hasVoted = true;
          PlatformBridgePollsRender.renderLearnerPanel();
          return;
        }
        var code = result.body && result.body.error && result.body.error.code;
        if (code === 'ALREADY_VOTED') {
          hasVoted = true;
          PlatformBridgePollsRender.renderLearnerPanel();
        }
      })
      .catch(function () {
        /* network error — panel stays open for retry */
      });
  }

  function parseApiResult(res) {
    return res.json().then(function (body) {
      return { ok: res.ok, status: res.status, body: body };
    });
  }

  function openPoll(definition) {
    clearControlStatus();
    var controlsRoot = getInstructorControlsEl();
    var modeSelect = controlsRoot
      ? controlsRoot.querySelector('#platform-poll-results-mode')
      : null;
    var resultsMode = modeSelect ? modeSelect.value : definition.default_results_mode;
    var hadActivePoll = Boolean(activePoll);

    fetch(
      bridgeDeps.getApiBase() +
        '/sessions/' +
        encodeURIComponent(bridgeDeps.getSessionId()) +
        '/polls',
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poll_id: definition.poll_id,
          slide_key: definition.slide_key,
          question: definition.question,
          options: definition.options,
          results_mode: resultsMode,
        }),
      }
    )
      .then(parseApiResult)
      .then(function (result) {
        if (result.ok) {
          if (!hadActivePoll) {
            setTimeout(function () {
              if (!activePoll) {
                hydratePollState();
              }
            }, 2000);
          }
          return;
        }
        var code = result.body && result.body.error && result.body.error.code;
        var message =
          (result.body && result.body.error && result.body.error.message) ||
          'Could not open poll';
        if (code === 'CONFLICT') {
          hydratePollState().then(function () {
            setControlStatus('A poll is already open — end it on that question first', true);
          });
          return;
        }
        setControlStatus(message, true);
      })
      .catch(function () {
        setControlStatus('Network error — could not open poll', true);
      });
  }

  function closePoll() {
    if (!activePoll || !isPollForCurrentSlide(activePoll)) return;
    clearControlStatus();
    fetch(
      bridgeDeps.getApiBase() + '/polls/' + encodeURIComponent(activePoll.poll_uuid) + '/close',
      {
        method: 'POST',
        credentials: 'include',
      }
    )
      .then(parseApiResult)
      .then(function (result) {
        if (result.ok) return;
        var message =
          (result.body && result.body.error && result.body.error.message) ||
          'Could not end poll';
        setControlStatus(message, true);
      })
      .catch(function () {
        setControlStatus('Network error — could not end poll', true);
      });
  }

  function getRevealPollUuid() {
    var ctxPoll = getSlideContextPoll();
    return ctxPoll ? ctxPoll.poll_uuid : null;
  }

  function showResultsToAudience() {
    var pollUuid = getRevealPollUuid();
    if (!pollUuid) return;
    clearControlStatus();
    fetch(
      bridgeDeps.getApiBase() +
        '/polls/' +
        encodeURIComponent(pollUuid) +
        '/reveal-results',
      {
        method: 'POST',
        credentials: 'include',
      }
    )
      .then(parseApiResult)
      .then(function (result) {
        if (result.ok) return;
        var message =
          (result.body && result.body.error && result.body.error.message) ||
          'Could not show results';
        setControlStatus(message, true);
      })
      .catch(function () {
        setControlStatus('Network error — could not show results', true);
      });
  }

  function resolveSlidePollContext() {
    return PlatformBridgePollsHydrate.resolveSlidePollContext();
  }

  function applyPollPayload(payload, opts) {
    var isNewPoll =
      !activePoll || activePoll.poll_uuid !== (payload.poll_uuid || payload.id);
    activePoll = normalizePollRecord(payload);
    displayPoll = null;
    cachePollRecord(activePoll);

    if (isNewPoll) {
      panelDismissed = false;
      learnerResultsRevealed = false;
    }

    if (isPollForCurrentSlide(activePoll)) {
      slidePollRecord = activePoll;
    }

    if (!opts || !opts.fromHydration) {
      if (isNewPoll) {
        pollResults = null;
        slidePollResults = null;
        hasVoted = false;
        selectedOptionId = null;
      }
    } else if (payload.my_response) {
      hasVoted = true;
      selectedOptionId = payload.my_response.option_id;
    } else if (isNewPoll) {
      hasVoted = false;
      selectedOptionId = null;
    }

    PlatformBridgePollsRender.renderPollUi();
    if (bridgeDeps.getRole() === 'instructor') {
      resolveSlidePollContext();
    }
  }

  function handlePollOpen(payload, opts) {
    applyPollPayload(payload, opts);
  }

  function handlePollClose() {
    var closedPoll = activePoll;
    if (closedPoll) {
      cachePollRecord(closedPoll);
      if (isPollForCurrentSlide(closedPoll)) {
        slidePollRecord = normalizePollRecord({
          poll_uuid: closedPoll.poll_uuid,
          poll_id: closedPoll.poll_id,
          slide_key: closedPoll.slide_key,
          question: closedPoll.question,
          options: closedPoll.options,
          results_mode: closedPoll.results_mode,
          status: 'closed',
        });
      }
    }
    activePoll = null;
    displayPoll = closedPoll;
    PlatformBridgePollsRender.renderInstructorControls();
    if (bridgeDeps.getRole() === 'learner' && closedPoll) {
      PlatformBridgePollsRender.renderLearnerPanel();
    } else {
      hidePanel();
    }
    if (bridgeDeps.getRole() === 'instructor') {
      resolveSlidePollContext();
    }
  }

  function handlePollResults(payload) {
    pollResults = payload;
    if (slidePollRecord && slidePollRecord.poll_uuid === payload.poll_uuid) {
      slidePollResults = payload;
    }

    if (bridgeDeps.getRole() === 'instructor') {
      PlatformBridgePollsRender.renderResultsHud();
      PlatformBridgePollsRender.renderInstructorControls();
      return;
    }

    var panelPoll = getPanelPoll();
    if (!panelPoll || panelPoll.poll_uuid !== payload.poll_uuid) {
      ensureLearnerDisplayFromResults(payload);
      panelPoll = getPanelPoll();
    }

    if (panelPoll && panelPoll.poll_uuid === payload.poll_uuid) {
      if (
        panelPoll.results_mode === 'instructor_only' ||
        panelPoll.results_mode === 'hidden_until_close'
      ) {
        learnerResultsRevealed = true;
      }
      panelDismissed = false;
    }
    PlatformBridgePollsRender.renderLearnerPanel();
  }

  function hydratePollState() {
    return PlatformBridgePollsHydrate.hydratePollState();
  }

  function onSlideChanged() {
    if (bridgeDeps && bridgeDeps.getRole() === 'instructor') {
      resolveSlidePollContext();
    } else {
      PlatformBridgePollsRender.renderInstructorControls();
    }
  }

  function initPollModules() {
    PlatformBridgePollsRender.init({
      shouldShowInlineBars: shouldShowInlineBars,
      getPollResults: function () {
        return pollResults;
      },
      getSlideContextPoll: getSlideContextPoll,
      getResultsForPoll: getResultsForPoll,
      shouldShowLivePollUi: shouldShowLivePollUi,
      getRole: function () {
        return bridgeDeps.getRole();
      },
      hideResultsHud: hideResultsHud,
      ensureResultsHud: ensureResultsHud,
      syncSpeakerPanel: syncSpeakerPanel,
      shouldShowLearnerPanel: shouldShowLearnerPanel,
      hidePanel: hidePanel,
      getPanelPoll: getPanelPoll,
      ensurePanel: ensurePanel,
      getHasVoted: function () {
        return hasVoted;
      },
      getSelectedOptionId: function () {
        return selectedOptionId;
      },
      setSelectedOptionId: function (id) {
        selectedOptionId = id;
      },
      onDismissLearnerPanel: dismissLearnerPanel,
      onSubmitVote: submitVote,
      getControlStatusMessage: function () {
        return controlStatusMessage;
      },
      getControlStatusIsError: function () {
        return controlStatusIsError;
      },
      onClosePoll: closePoll,
      onShowResultsToAudience: showResultsToAudience,
      onStartPoll: function () {
        var definition = getCurrentSlideDefinition();
        if (definition) openPoll(definition);
      },
      getInstructorUiMount: function () {
        return instructorUiMount;
      },
      ensurePollControls: ensurePollControls,
      getCurrentSlideDefinition: getCurrentSlideDefinition,
      getActivePoll: function () {
        return activePoll;
      },
      isPollForCurrentSlide: isPollForCurrentSlide,
      shouldShowRevealButton: shouldShowRevealButton,
      getSlidePollRecord: function () {
        return slidePollRecord;
      },
    });
    PlatformBridgePollsHydrate.init({
      getBridgeDeps: function () {
        return bridgeDeps;
      },
      getApiBase: function () {
        return bridgeDeps.getApiBase();
      },
      getSessionId: function () {
        return bridgeDeps.getSessionId();
      },
      getRole: function () {
        return bridgeDeps.getRole();
      },
      shouldShowLivePollUi: shouldShowLivePollUi,
      getCurrentSlideDefinition: getCurrentSlideDefinition,
      normalizePollRecord: normalizePollRecord,
      cachePollRecord: cachePollRecord,
      getActivePoll: function () {
        return activePoll;
      },
      setActivePoll: function (poll) {
        activePoll = poll;
      },
      setDisplayPoll: function (poll) {
        displayPoll = poll;
      },
      getPollResults: function () {
        return pollResults;
      },
      setPollResults: function (results) {
        pollResults = results;
      },
      getSlidePollRecord: function () {
        return slidePollRecord;
      },
      setSlidePollRecord: function (record) {
        slidePollRecord = record;
      },
      setSlidePollResults: function (results) {
        slidePollResults = results;
      },
      applyPollPayload: applyPollPayload,
      handlePollResults: handlePollResults,
      hideResultsHud: hideResultsHud,
    });
  }

  function bootstrap(deps) {
    bridgeDeps = deps;
    initPollModules();
    if (typeof Reveal !== 'undefined') {
      Reveal.on('slidechanged', onSlideChanged);
    }
    if (deps.getRole() === 'instructor') {
      resolveSlidePollContext();
    } else {
      PlatformBridgePollsRender.renderInstructorControls();
    }
    hydratePollState();
  }

  function install(deps) {
    bootstrap(deps);
  }

  window.PlatformBridgePolls = {
    install: install,
    hydratePollState: hydratePollState,
    teardownLivePollUi: teardownLivePollUi,
    handlePollOpen: handlePollOpen,
    handlePollClose: handlePollClose,
    handlePollResults: handlePollResults,
    onInstructorNavigationSync: onInstructorNavigationSync,
    setSpeakerViewActive: setSpeakerViewActive,
    proxyInstructorClick: proxyInstructorClick,
    proxyInstructorSelect: proxyInstructorSelect,
    getSpeakerViewWindow: function () {
      return speakerViewWindow;
    },
    isSpeakerRelayMode: function () {
      return speakerRelayMode;
    },
    getDefinitionForSlide: function (slideKey) {
      return window.PollDefinitionAdapter
        ? PollDefinitionAdapter.getDefinitionForSlide(slideKey)
        : null;
    },
    openPoll: openPoll,
    closePoll: closePoll,
    resolveSlidePollContext: resolveSlidePollContext,
  };
})();
