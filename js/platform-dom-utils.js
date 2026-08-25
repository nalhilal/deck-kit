/**
 * Shared DOM helpers for platform bridge modules.
 */
(function () {
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function byteLengthUtf8(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str).length;
    }
    var len = 0;
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code <= 0x7f) len += 1;
      else if (code <= 0x7ff) len += 2;
      else if (code >= 0xd800 && code <= 0xdbff) {
        len += 4;
        i++;
      } else len += 3;
    }
    return len;
  }

  window.PlatformDomUtils = {
    escapeHtml: escapeHtml,
    byteLengthUtf8: byteLengthUtf8,
  };
})();
