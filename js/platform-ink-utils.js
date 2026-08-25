/**
 * Shared ink/annotation helpers for tldreveal adapter and platform bridge.
 */
(function (global) {
  'use strict';

  function hasInkShapes(sceneJson) {
    if (!sceneJson) return false;
    try {
      var parsed = JSON.parse(sceneJson);
      return Array.isArray(parsed.shapes) && parsed.shapes.length > 0;
    } catch (e) {
      return sceneJson.length > 2;
    }
  }

  global.PlatformInkUtils = {
    hasInkShapes: hasInkShapes,
  };
})(typeof window !== 'undefined' ? window : globalThis);
