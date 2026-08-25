/**
 * tldreveal editor hook — export/import ink for platform persistence (Batch 04).
 */
(function () {
  var editorRef = null;
  var changeUnsubscribe = null;
  var changeListeners = [];
  var pageActivatedListeners = [];
  var controlStateListeners = [];
  var lastActivatedPageName = null;
  var controlObserver = null;
  var lastControlSignature = '';
  var controls = null;

  function hasControls() {
    return Boolean(controls && (controls.setShown || controls.setEditing));
  }

  function registerControls(api) {
    if (!api) return;
    controls = {
      setShown: typeof api.setShown === 'function' ? api.setShown : null,
      setEditing: typeof api.setEditing === 'function' ? api.setEditing : null,
    };
    ensureControlObserver();
    setTimeout(notifyControlStateChange, 0);
  }

  function slideKeyToPageName(slideKey) {
    if (!slideKey || typeof slideKey !== 'string') return null;
    var match = /^(\d+)\/(\d+)$/.exec(slideKey);
    if (!match) return null;
    return match[1] + '.' + match[2];
  }

  function pageNameToSlideKey(pageName) {
    if (!pageName || typeof pageName !== 'string') return null;
    var match = /^(\d+)\.(\d+)$/.exec(pageName);
    if (!match) return null;
    return match[1] + '/' + match[2];
  }

  function findPageByName(pageName) {
    if (!editorRef || !pageName) return null;
    try {
      var pages = editorRef.getPages();
      for (var i = 0; i < pages.length; i++) {
        if (pages[i].name === pageName) return pages[i];
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  function getCurrentPageName() {
    if (!editorRef) return null;
    try {
      var page = editorRef.getCurrentPage();
      return page && page.name ? page.name : null;
    } catch (e) {
      return null;
    }
  }

  function withPageForSlideKey(slideKey, fn) {
    if (!editorRef || typeof fn !== 'function') return null;
    var pageName = slideKeyToPageName(slideKey);
    if (!pageName) return null;

    var page = findPageByName(pageName);
    if (!page) return null;

    var previousPageId = editorRef.getCurrentPageId();
    var switched = previousPageId !== page.id;
    if (switched) {
      editorRef.setCurrentPage(page.id);
    }

    try {
      return fn();
    } finally {
      if (switched && previousPageId) {
        editorRef.setCurrentPage(previousPageId);
      }
    }
  }

  function collectAssetIds(shapes) {
    var ids = new Set();
    shapes.forEach(function (shape) {
      if (!shape || !shape.props) return;
      var props = shape.props;
      if (typeof props.assetId === 'string') ids.add(props.assetId);
      if (typeof props.src === 'string' && props.assetId) ids.add(props.assetId);
    });
    return ids;
  }

  function exportSceneFromCurrentPage() {
    if (!editorRef) return null;
    try {
      var shapes = editorRef.getCurrentPageShapes();
      var assetIds = collectAssetIds(shapes);
      var assets = editorRef
        .getAssets()
        .filter(function (asset) {
          return assetIds.has(asset.id);
        });
      return JSON.stringify({
        version: 1,
        shapes: shapes,
        assets: assets,
      });
    } catch (e) {
      return null;
    }
  }

  function exportScene() {
    return exportSceneFromCurrentPage();
  }

  function exportSceneForSlideKey(slideKey) {
    return withPageForSlideKey(slideKey, exportSceneFromCurrentPage);
  }

  function clearCurrentPageShapes() {
    if (!editorRef) return;
    try {
      editorRef.run(function () {
        var existing = Array.from(editorRef.getCurrentPageShapeIds());
        if (existing.length) {
          editorRef.deleteShapes(existing);
        }
      });
    } catch (e) {
      /* ignore */
    }
  }

  function loadScene(sceneJson) {
    if (!editorRef) return;
    if (!sceneJson) {
      clearCurrentPageShapes();
      return;
    }

    var data;
    try {
      data = JSON.parse(sceneJson);
    } catch (e) {
      return;
    }

    try {
      editorRef.run(function () {
        var existing = Array.from(editorRef.getCurrentPageShapeIds());
        if (existing.length) {
          editorRef.deleteShapes(existing);
        }
        if (Array.isArray(data.assets) && data.assets.length) {
          editorRef.createAssets(data.assets);
        }
        if (Array.isArray(data.shapes) && data.shapes.length) {
          editorRef.createShapes(data.shapes);
        }
      });
    } catch (e) {
      /* shape restore failed — leave blank page */
    }
  }

  function loadSceneForSlideKey(slideKey, sceneJson) {
    if (!editorRef) return;
    var pageName = slideKeyToPageName(slideKey);
    if (!pageName) return;

    var currentName = getCurrentPageName();
    if (currentName !== pageName) return;

    loadScene(sceneJson);
  }

  function notifyChange() {
    changeListeners.forEach(function (fn) {
      try {
        fn();
      } catch (e) {
        /* ignore listener errors */
      }
    });
  }

  function notifyPageActivated(editor, pageName) {
    if (editor) {
      editorRef = editor;
      bindStoreListener();
    }
    if (pageName) {
      lastActivatedPageName = pageName;
    }
    pageActivatedListeners.forEach(function (fn) {
      try {
        fn(pageName);
      } catch (e) {
        /* ignore listener errors */
      }
    });
  }

  function hasInkShapes(sceneJson) {
    return window.PlatformInkUtils && window.PlatformInkUtils.hasInkShapes(sceneJson);
  }

  function getTldrevealRoot() {
    var layer = document.getElementById('cp2077-annotate-layer');
    if (layer) {
      var inLayer = layer.querySelector('.tldreveal');
      if (inLayer) return inLayer;
    }
    return document.querySelector('.reveal .tldreveal');
  }

  function isDrawingMode() {
    var el = getTldrevealRoot();
    if (!el) return false;
    return (
      !el.classList.contains('tldreveal-inactive') &&
      el.hasAttribute('data-prevent-swipe')
    );
  }

  function isInkVisible() {
    var el = getTldrevealRoot();
    if (!el) return true;
    return !el.classList.contains('tldreveal-hidden');
  }

  function controlSignature() {
    return (isDrawingMode() ? '1' : '0') + (isInkVisible() ? '1' : '0');
  }

  function notifyControlStateChange() {
    var sig = controlSignature();
    if (sig === lastControlSignature) return;
    lastControlSignature = sig;
    controlStateListeners.forEach(function (fn) {
      try {
        fn({
          drawingMode: isDrawingMode(),
          inkVisible: isInkVisible(),
        });
      } catch (e) {
        /* ignore listener errors */
      }
    });
  }

  function ensureControlObserver() {
    if (controlObserver) return;
    controlObserver = new MutationObserver(function () {
      notifyControlStateChange();
    });
    var root = getTldrevealRoot();
    if (root) {
      controlObserver.observe(root, {
        attributes: true,
        attributeFilter: ['class', 'data-prevent-swipe'],
      });
      lastControlSignature = controlSignature();
    }
  }

  function enterDrawingMode() {
    if (controls && controls.setEditing) {
      if (controls.setShown) controls.setShown(true);
      controls.setEditing(true);
    } else if (typeof Reveal !== 'undefined' && typeof Reveal.triggerKey === 'function') {
      Reveal.triggerKey(68);
    }
    setTimeout(notifyControlStateChange, 0);
  }

  function exitDrawingMode() {
    if (!isDrawingMode()) return;
    if (controls && controls.setEditing) {
      controls.setEditing(false);
    } else {
      var evt = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(evt);
    }
    setTimeout(notifyControlStateChange, 0);
  }

  function toggleInkVisible() {
    if (controls && controls.setShown) {
      controls.setShown(!isInkVisible());
    } else if (typeof Reveal !== 'undefined' && typeof Reveal.triggerKey === 'function') {
      Reveal.triggerKey(86);
    }
    setTimeout(notifyControlStateChange, 0);
  }

  function setDrawingMode(on) {
    if (on) {
      if (!isDrawingMode()) enterDrawingMode();
    } else if (isDrawingMode()) {
      exitDrawingMode();
    }
  }

  function setInkVisible(visible) {
    visible = Boolean(visible);
    if (controls && controls.setShown) {
      if (isInkVisible() !== visible) controls.setShown(visible);
      setTimeout(notifyControlStateChange, 0);
      return;
    }
    if (isInkVisible() !== visible) toggleInkVisible();
  }

  function hasInkOnSlideKey(slideKey) {
    var scene =
      typeof exportSceneForSlideKey === 'function'
        ? exportSceneForSlideKey(slideKey)
        : null;
    return hasInkShapes(scene);
  }

  function bindStoreListener() {
    if (!editorRef || !editorRef.store || changeUnsubscribe) return;
    var store = editorRef.store;
    if (typeof store.listen !== 'function') return;

    var scheduled = null;
    changeUnsubscribe = store.listen(function () {
      if (scheduled) return;
      scheduled = setTimeout(function () {
        scheduled = null;
        notifyChange();
      }, 100);
    });
  }

  window.TldrevealAdapter = {
    onEditorMount: function (editor) {
      editorRef = editor;
      bindStoreListener();
      ensureControlObserver();
      notifyChange();
      notifyControlStateChange();
    },
    registerControls: registerControls,
    hasControls: hasControls,
    notifyPageActivated: notifyPageActivated,
    exportScene: exportScene,
    exportSceneForSlideKey: exportSceneForSlideKey,
    loadScene: loadScene,
    loadSceneForSlideKey: loadSceneForSlideKey,
    slideKeyToPageName: slideKeyToPageName,
    pageNameToSlideKey: pageNameToSlideKey,
    getCurrentPageName: getCurrentPageName,
    onChange: function (listener) {
      if (typeof listener === 'function') {
        changeListeners.push(listener);
      }
      return function () {
        changeListeners = changeListeners.filter(function (fn) {
          return fn !== listener;
        });
      };
    },
    onPageActivated: function (listener) {
      if (typeof listener === 'function') {
        pageActivatedListeners.push(listener);
        if (lastActivatedPageName) {
          try {
            listener(lastActivatedPageName);
          } catch (e) {
            /* ignore listener errors */
          }
        }
      }
      return function () {
        pageActivatedListeners = pageActivatedListeners.filter(function (fn) {
          return fn !== listener;
        });
      };
    },
    isReady: function () {
      return Boolean(editorRef);
    },
    getTldrevealRoot: getTldrevealRoot,
    isDrawingMode: isDrawingMode,
    isInkVisible: isInkVisible,
    enterDrawingMode: enterDrawingMode,
    exitDrawingMode: exitDrawingMode,
    toggleDrawingMode: function () {
      if (isDrawingMode()) exitDrawingMode();
      else enterDrawingMode();
    },
    toggleInkVisible: toggleInkVisible,
    setDrawingMode: setDrawingMode,
    setInkVisible: setInkVisible,
    hasInkOnSlideKey: hasInkOnSlideKey,
    onControlStateChange: function (listener) {
      if (typeof listener !== 'function') return function () {};
      controlStateListeners.push(listener);
      ensureControlObserver();
      try {
        listener({
          drawingMode: isDrawingMode(),
          inkVisible: isInkVisible(),
        });
      } catch (e) {
        /* ignore */
      }
      return function () {
        controlStateListeners = controlStateListeners.filter(function (fn) {
          return fn !== listener;
        });
      };
    },
    teardown: function () {
      if (controlObserver) {
        controlObserver.disconnect();
        controlObserver = null;
      }
      controlStateListeners = [];
      lastControlSignature = '';
      controls = null;
      if (changeUnsubscribe) {
        try {
          changeUnsubscribe();
        } catch (e) {
          /* ignore */
        }
        changeUnsubscribe = null;
      }
      editorRef = null;
      changeListeners = [];
      pageActivatedListeners = [];
      lastActivatedPageName = null;
    },
  };
})();
