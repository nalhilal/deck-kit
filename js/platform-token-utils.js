/**
 * JWT payload decode for platform session tokens (client-side claims only).
 */
(function () {
  function decodeTokenClaims(token) {
    try {
      var parts = token.split('.');
      if (parts.length < 2) return {};
      var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      var pad = payload.length % 4;
      if (pad) payload += '===='.slice(pad);
      return JSON.parse(atob(payload));
    } catch (e) {
      return {};
    }
  }

  window.PlatformTokenUtils = {
    decodeTokenClaims: decodeTokenClaims,
  };
})();
