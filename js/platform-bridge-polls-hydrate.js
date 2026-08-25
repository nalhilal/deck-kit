/**
 * Poll hydration and slide-context lookup (Batch 03).
 */
(function () {
  var ctx = null;

  function parseApiResult(res) {
    return res.json().then(function (body) {
      return { ok: res.ok, status: res.status, body: body };
    });
  }

  function fetchPollResults(pollUuid) {
    return fetch(
      ctx.getApiBase() + '/polls/' + encodeURIComponent(pollUuid) + '/results',
      { credentials: 'include' }
    )
      .then(parseApiResult)
      .then(function (result) {
        if (result.ok && result.body && result.body.data) {
          return result.body.data;
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  function resolveSlidePollContext() {
    if (!ctx.getBridgeDeps() || ctx.getRole() !== 'instructor' || !ctx.shouldShowLivePollUi()) {
      ctx.setSlidePollRecord(null);
      ctx.setSlidePollResults(null);
      PlatformBridgePollsRender.renderInstructorControls();
      PlatformBridgePollsRender.renderResultsHud();
      return Promise.resolve();
    }

    var definition = ctx.getCurrentSlideDefinition();
    if (!definition) {
      ctx.setSlidePollRecord(null);
      ctx.setSlidePollResults(null);
      PlatformBridgePollsRender.renderInstructorControls();
      PlatformBridgePollsRender.renderResultsHud();
      return Promise.resolve();
    }

    return fetch(
      ctx.getApiBase() +
        '/sessions/' +
        encodeURIComponent(ctx.getSessionId()) +
        '/polls/lookup?poll_id=' +
        encodeURIComponent(definition.poll_id),
      { credentials: 'include' }
    )
      .then(parseApiResult)
      .then(function (result) {
        if (result.status === 404) {
          ctx.setSlidePollRecord(null);
          ctx.setSlidePollResults(null);
          PlatformBridgePollsRender.renderInstructorControls();
          PlatformBridgePollsRender.renderResultsHud();
          return null;
        }
        if (!result.ok || !result.body || !result.body.data || !result.body.data.poll) {
          PlatformBridgePollsRender.renderInstructorControls();
          PlatformBridgePollsRender.renderResultsHud();
          return null;
        }

        var slidePollRecord = ctx.normalizePollRecord(result.body.data.poll);
        ctx.cachePollRecord(slidePollRecord);
        ctx.setSlidePollRecord(slidePollRecord);

        var activePoll = ctx.getActivePoll();
        var pollResults = ctx.getPollResults();
        if (activePoll && activePoll.poll_uuid === slidePollRecord.poll_uuid && pollResults) {
          ctx.setSlidePollResults(pollResults);
          PlatformBridgePollsRender.renderInstructorControls();
          PlatformBridgePollsRender.renderResultsHud();
          return null;
        }

        return fetchPollResults(slidePollRecord.poll_uuid);
      })
      .then(function (results) {
        if (results) {
          ctx.setSlidePollResults(results);
          var activePoll = ctx.getActivePoll();
          if (activePoll && activePoll.poll_uuid === results.poll_uuid) {
            ctx.setPollResults(results);
          }
        }
        PlatformBridgePollsRender.renderInstructorControls();
        PlatformBridgePollsRender.renderResultsHud();
      })
      .catch(function () {
        PlatformBridgePollsRender.renderInstructorControls();
        PlatformBridgePollsRender.renderResultsHud();
      });
  }

  function hydratePollState() {
    var bridgeDeps = ctx.getBridgeDeps();
    if (!bridgeDeps || !bridgeDeps.isLive() || bridgeDeps.isReviewMode()) {
      return Promise.resolve();
    }

    return fetch(
      ctx.getApiBase() +
        '/sessions/' +
        encodeURIComponent(ctx.getSessionId()) +
        '/polls/active',
      { credentials: 'include' }
    )
      .then(parseApiResult)
      .then(function (result) {
        if (result.status === 404) {
          ctx.setActivePoll(null);
          ctx.setDisplayPoll(null);
          if (ctx.getRole() === 'instructor') {
            return resolveSlidePollContext();
          }
          PlatformBridgePollsRender.renderInstructorControls();
          PlatformBridgePollsRender.renderLearnerPanel();
          ctx.hideResultsHud();
          return;
        }
        if (!result.ok || !result.body || !result.body.data || !result.body.data.poll) {
          return;
        }
        var poll = result.body.data.poll;
        ctx.applyPollPayload(poll, { fromHydration: true });
        if (ctx.getRole() === 'instructor') {
          return fetchPollResults(poll.poll_uuid || poll.id).then(function (data) {
            if (data) {
              ctx.handlePollResults(data);
            }
          });
        }
      })
      .catch(function () {
        /* hydration is best-effort; WS replay may still deliver state */
      });
  }

  function init(hydrateCtx) {
    ctx = hydrateCtx;
  }

  window.PlatformBridgePollsHydrate = {
    init: init,
    resolveSlidePollContext: resolveSlidePollContext,
    hydratePollState: hydratePollState,
    fetchPollResults: fetchPollResults,
  };
})();
