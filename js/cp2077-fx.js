/**
 * Cyberpunk 2077 CRT FX — overlay stack, barrel filter, config presets
 */
(function () {
	var STORAGE_KEY = 'cp2077-fx-state';

	var CRT_LAYERS = [
		'scanlines',
		'grille',
		'vignette',
		'bezelMask',
		'barrel',
		'phosphorGlow',
		'noise',
		'flicker',
		'movingBeam',
	];

	var CONTENT_LAYERS = ['glitch', 'chromatic', 'hud', 'cursor', 'pulseBorder'];

	var PRESETS = {
		off: {
			scanlines: false,
			grille: false,
			vignette: false,
			bezelMask: false,
			barrel: false,
			phosphorGlow: false,
			noise: false,
			flicker: false,
			movingBeam: false,
			glitch: false,
			chromatic: false,
			hud: false,
			cursor: false,
			pulseBorder: false,
		},
		subtle: {
			scanlines: true,
			grille: false,
			vignette: true,
			bezelMask: false,
			barrel: false,
			phosphorGlow: false,
			noise: false,
			flicker: false,
			movingBeam: false,
			glitch: false,
			chromatic: false,
			hud: true,
			cursor: false,
			pulseBorder: false,
		},
		fullCrt: {
			scanlines: true,
			grille: true,
			vignette: true,
			bezelMask: true,
			barrel: true,
			phosphorGlow: true,
			noise: true,
			flicker: true,
			movingBeam: true,
			glitch: true,
			chromatic: true,
			hud: true,
			cursor: true,
			pulseBorder: true,
		},
	};

	var LAYER_CLASSES = {
		scanlines: 'fx-crt-scanlines',
		grille: 'fx-crt-grille',
		vignette: 'fx-crt-vignette',
		bezelMask: 'fx-crt-bezel-mask',
		barrel: 'fx-crt-barrel',
		phosphorGlow: 'fx-crt-phosphor-glow',
		noise: 'fx-crt-noise',
		flicker: 'fx-crt-flicker',
		movingBeam: 'fx-crt-moving-beam',
		glitch: 'fx-glitch',
		chromatic: 'fx-chromatic',
		hud: 'fx-hud',
		cursor: 'fx-cursor',
		pulseBorder: 'fx-pulse-border',
	};

	var ALLOWED_GLITCH_TARGETS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

	var lastAppliedLayers = null;
	var layoutTimer = null;
	var barrelMapUrl = null;

	function getConfig() {
		return window.CP2077_CONFIG || { fx: { enabled: false } };
	}

	function layerClass(name) {
		return LAYER_CLASSES[name] || 'fx-' + name;
	}

	function normalizeGlitchTargets(cfg) {
		cfg = cfg || {};
		var raw = cfg.glitchTargets;
		if (!Array.isArray(raw) || raw.length === 0) {
			return ['h1'];
		}
		var seen = {};
		var out = [];
		raw.forEach(function (tag) {
			if (typeof tag !== 'string') {
				return;
			}
			var key = tag.trim().toLowerCase();
			if (!key || seen[key] || ALLOWED_GLITCH_TARGETS.indexOf(key) === -1) {
				return;
			}
			seen[key] = true;
			out.push(key);
		});
		return out.length ? out : ['h1'];
	}

	function applyGlitchTargets(html, layers) {
		if (!layers.glitch) {
			delete html.dataset.cp2077GlitchTargets;
			return;
		}
		var targets = normalizeGlitchTargets(getConfig().fx);
		html.dataset.cp2077GlitchTargets = targets.join(' ');
	}

	function allLayerNames() {
		return CRT_LAYERS.concat(CONTENT_LAYERS);
	}

	function readStoredState() {
		try {
			var raw = localStorage.getItem(STORAGE_KEY);
			return raw ? JSON.parse(raw) : null;
		} catch (e) {
			return null;
		}
	}

	function writeStoredState(state) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	}

	function resolveLayers() {
		var cfg = getConfig().fx || {};
		if (!cfg.enabled) {
			return PRESETS.off;
		}

		var presetName = cfg.preset || 'fullCrt';

		if (cfg.useUrlParam) {
			var param = new URLSearchParams(location.search).get('fx');
			if (param && PRESETS[param]) {
				presetName = param;
			}
		}

		if (presetName !== 'custom' && PRESETS[presetName]) {
			return Object.assign({}, PRESETS[presetName]);
		}

		if (cfg.useConfigDefaults && cfg.layers) {
			return Object.assign({}, cfg.layers);
		}

		var stored = readStoredState();
		if (stored && stored.layers && cfg.persist && !cfg.useConfigDefaults) {
			return stored.layers;
		}

		if (cfg.layers) {
			return Object.assign({}, cfg.layers);
		}

		return Object.assign({}, PRESETS.fullCrt);
	}

	function prefersReducedMotion() {
		var cfg = getConfig().fx || {};
		if (!cfg.respectReducedMotion) {
			return false;
		}
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	function applyReducedMotion(layers) {
		if (!prefersReducedMotion()) {
			return layers;
		}
		var next = Object.assign({}, layers);
		next.flicker = false;
		next.movingBeam = false;
		next.glitch = false;
		next.barrel = false;
		return next;
	}

	/**
	 * Symmetric radial barrel map: R/G encode displacement from center (128 = neutral).
	 */
	function buildBarrelMapDataUrl(size) {
		var canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		var ctx = canvas.getContext('2d');
		if (!ctx) {
			return null;
		}
		var img = ctx.createImageData(size, size);
		var cx = (size - 1) / 2;
		var cy = (size - 1) / 2;
		var maxR = size / 2;
		var i = 0;
		for (var y = 0; y < size; y++) {
			for (var x = 0; x < size; x++) {
				var nx = (x - cx) / maxR;
				var ny = (y - cy) / maxR;
				var dist = Math.sqrt(nx * nx + ny * ny);
				if (dist > 1) {
					dist = 1;
				}
				var edge = dist * dist;
				var dx = nx * edge * 0.42;
				var dy = ny * edge * 0.42;
				img.data[i++] = Math.max(0, Math.min(255, Math.round(128 - dx * 127)));
				img.data[i++] = Math.max(0, Math.min(255, Math.round(128 - dy * 127)));
				img.data[i++] = 128;
				img.data[i++] = 255;
			}
		}
		ctx.putImageData(img, 0, 0);
		return canvas.toDataURL('image/png');
	}

	function ensureBarrelMapUrl() {
		if (!barrelMapUrl) {
			barrelMapUrl = buildBarrelMapDataUrl(256);
		}
		return barrelMapUrl;
	}

	function injectDom() {
		var cfg = getConfig().fx || {};
		var strength = cfg.barrelStrength != null ? cfg.barrelStrength : 10;
		var mapHref = ensureBarrelMapUrl();

		var existingSvg = document.querySelector('.cp2077-svg-defs');
		if (existingSvg) {
			existingSvg.remove();
		}

		var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'cp2077-svg-defs');
		svg.setAttribute('aria-hidden', 'true');
		svg.setAttribute('width', '0');
		svg.setAttribute('height', '0');
		svg.style.position = 'absolute';
		svg.style.overflow = 'hidden';
		svg.innerHTML =
			'<defs>' +
			'<filter id="cp2077-barrel" color-interpolation-filters="sRGB" x="-12%" y="-12%" width="124%" height="124%">' +
			'<feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="barrelMap" href="' +
			(mapHref || '') +
			'"/>' +
			'<feDisplacementMap in="SourceGraphic" in2="barrelMap" scale="' +
			strength +
			'" xChannelSelector="R" yChannelSelector="G"/>' +
			'</filter>' +
			'</defs>';
		document.body.appendChild(svg);

		if (document.getElementById('cp2077-crt-overlay')) {
			return;
		}

		var overlay = document.createElement('div');
		overlay.id = 'cp2077-crt-overlay';
		overlay.setAttribute('aria-hidden', 'true');
		overlay.innerHTML =
			'<div class="cp2077-crt__scanlines"></div>' +
			'<div class="cp2077-crt__grille"></div>' +
			'<div class="cp2077-crt__vignette"></div>' +
			'<div class="cp2077-crt__mask"></div>' +
			'<div class="cp2077-crt__glow"></div>' +
			'<div class="cp2077-crt__noise"></div>' +
			'<div class="cp2077-crt__flicker"></div>' +
			'<div class="cp2077-crt__beam"></div>';

		var anchor =
			document.getElementById('cp2077-deck-shell') ||
			document.querySelector('.reveal');
		if (anchor && anchor.parentNode) {
			anchor.parentNode.insertBefore(overlay, anchor.nextSibling);
		} else {
			document.body.appendChild(overlay);
		}
	}

	function updateBarrelScale() {
		var cfg = getConfig().fx || {};
		var scale = cfg.barrelStrength != null ? cfg.barrelStrength : 10;
		var map = document.querySelector('#cp2077-barrel feDisplacementMap');
		if (map) {
			map.setAttribute('scale', String(scale));
		}
		document.documentElement.style.setProperty('--cp-barrel-scale', String(scale));
	}

	function scheduleRevealLayout() {
		if (typeof Reveal === 'undefined' || !Reveal.layout) {
			return;
		}
		clearTimeout(layoutTimer);
		layoutTimer = setTimeout(function () {
			Reveal.layout();
		}, 50);
	}

	function updateFxStatus(layers) {
		var status = document.getElementById('cp2077-fx-status');
		if (!status) {
			return;
		}
		var cfg = getConfig().fx || {};
		var crtCount = CRT_LAYERS.filter(function (k) {
			return layers[k];
		}).length;
		var overlayOn = cfg.enabled && crtCount > 0;
		var reduced = prefersReducedMotion();
		var parts = [
			'Overlay: ' + (overlayOn ? 'on' : 'off'),
			'CRT layers: ' + crtCount,
			'Preset: ' + (cfg.preset || 'custom'),
		];
		if (reduced && cfg.respectReducedMotion) {
			parts.push('Reduce motion: warp/beam/flicker off');
		}
		status.textContent = parts.join(' · ');
	}

	function applyLayers(layers) {
		var cfg = getConfig().fx || {};
		var intensity = cfg.intensity != null ? cfg.intensity : 1;
		var html = document.documentElement;
		var hadBarrel = lastAppliedLayers && lastAppliedLayers.barrel;

		html.style.setProperty('--cp-crt-intensity', String(intensity));

		var reduced = prefersReducedMotion() && cfg.respectReducedMotion;
		if (reduced) {
			html.dataset.cp2077ReducedMotion = 'true';
		} else {
			delete html.dataset.cp2077ReducedMotion;
		}

		var anyCrt = CRT_LAYERS.some(function (k) {
			return layers[k];
		});
		html.classList.toggle('fx-crt-active', cfg.enabled && anyCrt);

		allLayerNames().forEach(function (key) {
			html.classList.toggle(layerClass(key), !!layers[key]);
		});

		applyGlitchTargets(html, layers);

		html.dataset.cp2077FxPreset = cfg.preset || 'custom';

		var inputs = document.querySelectorAll('[data-cp2077-layer]');
		inputs.forEach(function (input) {
			var key = input.dataset.cp2077Layer;
			if (key && layers[key] !== undefined) {
				input.checked = !!layers[key];
			}
		});

		var label = document.getElementById('cp2077-fx-preset-label');
		if (label) {
			label.textContent = cfg.preset || 'custom';
		}

		var intensityRange = document.getElementById('cp2077-intensity-range');
		if (intensityRange) {
			intensityRange.value = String(intensity);
		}

		lastAppliedLayers = Object.assign({}, layers);
		updateFxStatus(layers);

		if (hadBarrel !== layers.barrel) {
			scheduleRevealLayout();
		}
	}

	function apply(presetOrLayers) {
		var cfg = getConfig().fx || {};
		if (!cfg.enabled) {
			applyLayers(PRESETS.off);
			lastAppliedLayers = Object.assign({}, PRESETS.off);
			return PRESETS.off;
		}

		injectDom();
		updateBarrelScale();

		var layers;
		if (typeof presetOrLayers === 'string' && PRESETS[presetOrLayers]) {
			cfg.preset = presetOrLayers;
			layers = Object.assign({}, PRESETS[presetOrLayers]);
		} else if (presetOrLayers && typeof presetOrLayers === 'object') {
			layers = Object.assign({}, presetOrLayers);
			cfg.preset = 'custom';
		} else {
			layers = resolveLayers();
		}

		layers = applyReducedMotion(layers);
		applyLayers(layers);

		if (cfg.persist) {
			writeStoredState({ preset: cfg.preset, layers: layers });
		}

		return layers;
	}

	function getLayers() {
		if (lastAppliedLayers) {
			return Object.assign({}, lastAppliedLayers);
		}
		return resolveLayers();
	}

	function setLayer(name, on) {
		var layers = getLayers();
		layers = applyReducedMotion(layers);
		layers[name] = !!on;
		getConfig().fx.preset = 'custom';
		apply(layers);
	}

	function setPreset(name) {
		if (name === 'full') {
			name = 'fullCrt';
		}
		if (!PRESETS[name]) {
			return;
		}
		var cfg = getConfig().fx;
		cfg.preset = name;
		if (name !== 'custom') {
			cfg.useConfigDefaults = false;
		}
		apply(name);
	}

	function setIntensity(value) {
		var cfg = getConfig().fx;
		var n = Number(value);
		cfg.intensity = Math.max(0, Math.min(2, Number.isFinite(n) ? n : 1));
		if (lastAppliedLayers) {
			applyLayers(lastAppliedLayers);
		} else {
			apply();
		}
	}

	/** @deprecated use cp2077SetLayer */
	function setFxLegacy(className, on) {
		var map = {
			'fx-scanlines': 'scanlines',
			'fx-noise': 'noise',
			'fx-flicker': 'flicker',
			'fx-glitch': 'glitch',
			'fx-chromatic': 'chromatic',
			'fx-hud': 'hud',
			'fx-cursor': 'cursor',
			'fx-pulse-border': 'pulseBorder',
		};
		if (map[className]) {
			setLayer(map[className], on);
		}
	}

	function setBarrelStrength(value) {
		var cfg = getConfig().fx;
		cfg.barrelStrength = Math.max(0, Math.min(40, Number(value) || 0));
		updateBarrelScale();
		scheduleRevealLayout();
	}

	function init(force) {
		var cfg = getConfig().fx || {};
		if (!cfg.enabled) {
			return;
		}
		if (cfg.deferInit && !force) {
			return;
		}
		apply();
	}

	window.cp2077FxPresets = PRESETS;
	window.cp2077FxApply = apply;
	window.cp2077FxGetLayers = getLayers;
	window.cp2077SetLayer = setLayer;
	window.cp2077SetFx = setFxLegacy;
	window.cp2077FxPreset = setPreset;
	window.cp2077SetBarrelStrength = setBarrelStrength;
	window.cp2077SetCrtIntensity = setIntensity;
	window.cp2077FxInit = function () {
		init(true);
	};

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', function () {
			init(false);
		});
	} else {
		init(false);
	}
})();
