/**
 * Reveal slide key helpers shared by bridge and poll modules.
 */
(function () {
  function slideKeyFromReveal() {
    if (typeof Reveal === 'undefined') return '0/0';
    var state = Reveal.getState();
    return state.indexh + '/' + (state.indexv || 0);
  }

  window.PlatformRevealUtils = {
    slideKeyFromReveal: slideKeyFromReveal,
  };
})();
