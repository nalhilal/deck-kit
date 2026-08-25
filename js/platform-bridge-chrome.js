/**
 * Bridge status chrome (connection bar, positional sync state).
 */
(function () {
  var bridgeDeps = null;

  function ensureChrome() {
    var el = document.getElementById('platform-bridge-chrome');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'platform-bridge-chrome';
    document.body.appendChild(el);
    return el;
  }

  function buildSyncHtml() {
    if (
      !bridgeDeps.isLive() ||
      bridgeDeps.getRole() !== 'learner' ||
      bridgeDeps.isReviewMode()
    ) {
      return '';
    }
    var instructorPos = bridgeDeps.getInstructorPosition();
    if (!instructorPos) return '';
    var learnerPos = PlatformPositionUtils.positionFromReveal();
    var cmp = PlatformPositionUtils.compareSlidePosition(learnerPos, instructorPos);
    if (cmp === 0) {
      return (
        '<div class="platform-bridge-sync" role="group" aria-label="Instructor sync">' +
        '<span class="platform-bridge-sync__status" aria-live="polite">Synced with instructor</span>' +
        '</div>'
      );
    }
    if (cmp < 0) {
      var key = PlatformPositionUtils.keyFromPosition(instructorPos);
      var position = PlatformPositionUtils.learnerSlidePosition(key);
      var label = position || key;
      return (
        '<div class="platform-bridge-sync" role="group" aria-label="Instructor sync">' +
        '<a href="#" class="platform-bridge-sync__catch-up" id="platform-catch-up-link">' +
        'Go to instructor slide ' +
        label +
        '</a>' +
        '</div>'
      );
    }
    return '';
  }

  function bindCatchUpLink() {
    var link = document.getElementById('platform-catch-up-link');
    if (!link || link.dataset.bound === '1') return;
    link.dataset.bound = '1';
    link.addEventListener('click', function (event) {
      event.preventDefault();
      bridgeDeps.catchUpToInstructor();
    });
  }

  function updateSyncRegion(bar) {
    if (!bar) return;
    var syncHtml = buildSyncHtml();
    var existing = bar.querySelector('.platform-bridge-sync');
    if (syncHtml) {
      if (existing) {
        var wrap = document.createElement('div');
        wrap.innerHTML = syncHtml;
        existing.replaceWith(wrap.firstElementChild);
      } else {
        bar.insertAdjacentHTML('beforeend', syncHtml);
      }
      bindCatchUpLink();
    } else if (existing) {
      existing.remove();
    }
  }

  function updateSyncState() {
    var chrome = ensureChrome();
    var bar = chrome.querySelector('.platform-bridge-bar');
    updateSyncRegion(bar);
  }

  function updateChrome(status, connected) {
    bridgeDeps.notifyShellParent(status, connected);
    var chrome = ensureChrome();
    var statusClass = connected ? 'connected' : 'disconnected';
    var syncHtml = buildSyncHtml();

    var bar = chrome.querySelector('.platform-bridge-bar');
    if (!bar) {
      chrome.innerHTML =
        '<div class="platform-bridge-bar ' +
        statusClass +
        '">' +
        '<span class="platform-status">' +
        status +
        '</span>' +
        syncHtml +
        '</div>' +
        '<div id="platform-poll-controls"></div>';
      bindCatchUpLink();
    } else {
      bar.className = 'platform-bridge-bar ' + statusClass;
      var statusEl = bar.querySelector('.platform-status');
      if (statusEl) statusEl.textContent = status;
      updateSyncRegion(bar);
    }
  }

  function init(deps) {
    bridgeDeps = deps;
  }

  window.PlatformBridgeChrome = {
    init: init,
    updateChrome: updateChrome,
    updateSyncState: updateSyncState,
    ensureChrome: ensureChrome,
  };
})();
