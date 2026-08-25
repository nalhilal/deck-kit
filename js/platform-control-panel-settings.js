/**
 * Action Panel Settings tab — FX layers, presets, intensity (Batch 07.3).
 */
(function () {
  var MOTION_HEAVY_LAYERS = ['flicker', 'movingBeam', 'glitch', 'barrel'];

  var LAYER_GROUPS = [
    {
      legend: 'CRT overlay',
      layers: [
        { id: 'scanlines', label: 'Scanlines' },
        { id: 'grille', label: 'Grille' },
        { id: 'vignette', label: 'Vignette' },
        { id: 'bezelMask', label: 'Bezel mask' },
        { id: 'phosphorGlow', label: 'Phosphor glow' },
        { id: 'noise', label: 'Noise' },
        { id: 'flicker', label: 'Flicker' },
        { id: 'movingBeam', label: 'Moving beam' },
        { id: 'barrel', label: 'Warp (barrel)' },
      ],
    },
    {
      legend: 'Content',
      layers: [
        { id: 'glitch', label: 'Glitch on headings' },
        { id: 'chromatic', label: 'Chromatic aberration' },
        { id: 'hud', label: 'HUD frame' },
        { id: 'cursor', label: 'Custom cursor' },
        { id: 'pulseBorder', label: 'Pulse border' },
      ],
    },
  ];

  var mounted = false;
  var rootEl = null;

  function prefersReducedMotion() {
    var cfg = window.CP2077_CONFIG && window.CP2077_CONFIG.fx;
    return (
      cfg &&
      cfg.respectReducedMotion &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function escapeHtml(text) {
    return PlatformDomUtils.escapeHtml(text);
  }

  function buildMarkup() {
    var presets =
      '<div class="platform-control-panel-settings-presets" role="group" aria-label="FX presets">' +
      '<button type="button" class="platform-control-panel-settings-preset" data-fx-preset="off">Off</button>' +
      '<button type="button" class="platform-control-panel-settings-preset" data-fx-preset="subtle">Subtle</button>' +
      '<button type="button" class="platform-control-panel-settings-preset" data-fx-preset="fullCrt">Full CRT</button>' +
      '<span class="platform-control-panel-settings-preset-label">Preset: <strong id="platform-control-panel-fx-preset-label">custom</strong></span>' +
      '</div>';

    var groups = LAYER_GROUPS.map(function (group) {
      var items = group.layers
        .map(function (layer) {
          return (
            '<label class="platform-control-panel-settings-layer">' +
            '<input type="checkbox" data-cp2077-layer="' +
            escapeHtml(layer.id) +
            '" data-layer-id="' +
            escapeHtml(layer.id) +
            '" /> ' +
            escapeHtml(layer.label) +
            '</label>'
          );
        })
        .join('');
      return (
        '<fieldset class="platform-control-panel-settings-group">' +
        '<legend>' +
        escapeHtml(group.legend) +
        '</legend>' +
        items +
        '</fieldset>'
      );
    }).join('');

    var intensity =
      '<label class="platform-control-panel-settings-intensity">' +
      'CRT intensity ' +
      '<input type="range" id="platform-control-panel-fx-intensity" min="0" max="1" step="0.05" value="1" />' +
      '</label>';

    return (
      '<div class="platform-control-panel-settings">' +
      '<section class="platform-control-panel-settings-section" aria-labelledby="platform-control-panel-theme-heading">' +
      '<h3 id="platform-control-panel-theme-heading" class="platform-control-panel-settings-section-title">Theme settings</h3>' +
      '<p class="platform-control-panel-settings-section-desc">Personal CRT and visual effects for this deck.</p>' +
      presets +
      groups +
      intensity +
      '</section>' +
      '</div>'
    );
  }

  function persistCurrentFx() {
    if (!window.PlatformFxPreferences) return;
    PlatformFxPreferences.saveFx(PlatformFxPreferences.captureCurrentFx());
  }

  function syncReducedMotionDisables() {
    if (!rootEl) return;
    var reduced = prefersReducedMotion();
    MOTION_HEAVY_LAYERS.forEach(function (layerId) {
      var input = rootEl.querySelector('[data-layer-id="' + layerId + '"]');
      if (!input) return;
      input.disabled = reduced;
      input.setAttribute('aria-disabled', reduced ? 'true' : 'false');
    });
  }

  function syncFromState(fx) {
    if (!rootEl || !fx) return;
    var layers = fx.layers || {};
    rootEl.querySelectorAll('[data-layer-id]').forEach(function (input) {
      var id = input.getAttribute('data-layer-id');
      if (id && layers[id] !== undefined) {
        input.checked = !!layers[id];
      }
    });
    var label = rootEl.querySelector('#platform-control-panel-fx-preset-label');
    if (label) label.textContent = fx.preset || 'custom';
    var intensity = rootEl.querySelector('#platform-control-panel-fx-intensity');
    if (intensity && fx.intensity != null) {
      intensity.value = String(fx.intensity);
    }
    syncReducedMotionDisables();
  }

  function bindEvents() {
    if (!rootEl) return;

    rootEl.querySelectorAll('[data-fx-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var preset = btn.getAttribute('data-fx-preset');
        if (!preset || typeof cp2077FxPreset !== 'function') return;
        cp2077FxPreset(preset);
        persistCurrentFx();
      });
    });

    rootEl.querySelectorAll('[data-layer-id]').forEach(function (input) {
      input.addEventListener('change', function () {
        var layerId = input.getAttribute('data-layer-id');
        if (!layerId || typeof cp2077SetLayer !== 'function') return;
        cp2077SetLayer(layerId, input.checked);
        persistCurrentFx();
      });
    });

    var intensity = rootEl.querySelector('#platform-control-panel-fx-intensity');
    if (intensity) {
      intensity.addEventListener('input', function () {
        if (typeof cp2077SetCrtIntensity !== 'function') return;
        cp2077SetCrtIntensity(Number(intensity.value));
        if (window.PlatformFxPreferences) {
          PlatformFxPreferences.saveFx({ intensity: Number(intensity.value) });
        }
      });
    }

    if (window.PlatformFxPreferences && typeof PlatformFxPreferences.onChange === 'function') {
      PlatformFxPreferences.onChange(syncFromState);
    }

    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      var onMotionChange = function () {
        syncReducedMotionDisables();
      };
      if (mq.addEventListener) {
        mq.addEventListener('change', onMotionChange);
      } else if (mq.addListener) {
        mq.addListener(onMotionChange);
      }
    }
  }

  function mount(panelEl) {
    if (!panelEl || mounted) return;
    mounted = true;
    rootEl = panelEl;
    panelEl.innerHTML = buildMarkup();
    bindEvents();
    if (window.PlatformFxPreferences) {
      syncFromState(PlatformFxPreferences.getState());
    }
  }

  window.PlatformControlPanelSettings = {
    mount: mount,
  };
})();
