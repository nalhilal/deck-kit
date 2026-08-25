/**
 * Facilitator audience-screen hint overlay.
 */
(function () {
  var bridgeDeps = null;

  function showAudienceProjectorHint() {
    if (!bridgeDeps.isAudienceScreen() || bridgeDeps.getRole() !== 'instructor') return;
    if (PlatformGuestStorage.getItem('platform-audience-hint-dismissed') === '1') return;

    var el = document.getElementById('platform-audience-hint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'platform-audience-hint';
      el.setAttribute('role', 'status');
      el.innerHTML =
        '<p>This is the audience screen — learners follow slides here. Press F11 or use Reveal fullscreen for a clean projector view.</p>' +
        '<button type="button" id="platform-audience-hint-dismiss">Dismiss</button>';
      document.body.appendChild(el);
      var dismiss = document.getElementById('platform-audience-hint-dismiss');
      if (dismiss) {
        dismiss.addEventListener('click', function () {
          PlatformGuestStorage.setItem('platform-audience-hint-dismissed', '1');
          el.remove();
        });
      }
    }
  }

  function init(deps) {
    bridgeDeps = deps;
  }

  window.PlatformBridgeHints = {
    init: init,
    showAudienceProjectorHint: showAudienceProjectorHint,
  };
})();
