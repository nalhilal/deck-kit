/**
 * Bridge API compatibility checks and warning UI.
 */
(function () {
  var bridgeDeps = null;

  function evaluateCompatibility(payload) {
    if (!payload || !payload.platform) {
      return { ok: true, message: '' };
    }

    var requiredApi = payload.platform.bridge_api || bridgeDeps.getBridgeApi();

    if (bridgeDeps.getBridgeApi() < requiredApi) {
      return {
        ok: false,
        message:
          'Platform bridge API ' +
          bridgeDeps.getBridgeApi() +
          ' is outdated (platform requires ' +
          requiredApi +
          '+). Run npm run package:platform and upload the new zip.',
      };
    }

    return { ok: true, message: '' };
  }

  function showCompatWarning(message) {
    var el = document.getElementById('platform-compat-warning');
    if (!el) {
      el = document.createElement('div');
      el.id = 'platform-compat-warning';
      el.setAttribute('role', 'alert');
      document.body.appendChild(el);
    }
    el.textContent = message;
    document.documentElement.classList.add('platform-compat-warning-active');
  }

  function hideCompatWarning() {
    document.documentElement.classList.remove('platform-compat-warning-active');
    var el = document.getElementById('platform-compat-warning');
    if (el) el.remove();
  }

  function init(deps) {
    bridgeDeps = deps;
  }

  window.PlatformBridgeCompat = {
    init: init,
    evaluateCompatibility: evaluateCompatibility,
    showCompatWarning: showCompatWarning,
    hideCompatWarning: hideCompatWarning,
  };
})();
