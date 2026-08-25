/**
 * Excalidraw whiteboard — overlay host (transform-free) or in-slide fallback.
 * Session persistence via sessionStorage; export/import shortcuts.
 */
(function () {
	var STORAGE_PREFIX = 'cp2077-whiteboard:';
	var activeMountEl = null;
	var activePlaceholder = null;
	var activeSlide = null;
	var fileInput = null;
	var placeholderResizeObserver = null;
	var refreshTimers = [];
	var mountFallbackTimer = null;
	var boundsRaf = null;
	var whiteboardLayer = null;
	var whiteboardMountHost = null;
	var bundleMissingWarned = false;

	function dbg() {
		return typeof window !== 'undefined' ? window.cp2077WhiteboardDebug : null;
	}

	function dbgLifecycle(name, extra) {
		var d = dbg();
		if (d && d.logLifecycle) {
			d.logLifecycle(name, extra);
		}
	}

	function dbgRefresh(reason) {
		var d = dbg();
		if (d && d.logRefresh) {
			d.logRefresh(reason);
		}
	}

	function getWhiteboardConfig() {
		return (
			(typeof window !== 'undefined' && window.CP2077_CONFIG && window.CP2077_CONFIG.whiteboard) ||
			{}
		);
	}

	function useOverlayMount() {
		var cfg = getWhiteboardConfig();
		return cfg.mount !== 'inSlide';
	}

	function shouldDisableBarrel() {
		var cfg = getWhiteboardConfig();
		return cfg.disableBarrel !== false;
	}

	function setWhiteboardPointerMode(active) {
		document.documentElement.classList.toggle('fx-whiteboard-active', !!active);
		document.documentElement.classList.toggle(
			'fx-whiteboard-overlay',
			!!active && useOverlayMount()
		);
	}

	function ensureWhiteboardLayer() {
		if (whiteboardLayer && whiteboardMountHost) {
			return whiteboardLayer;
		}
		var existing = document.getElementById('cp2077-whiteboard-layer');
		if (existing) {
			whiteboardLayer = existing;
			whiteboardMountHost =
				existing.querySelector('.cp2077-whiteboard-mount') || existing;
			return whiteboardLayer;
		}

		var layer = document.createElement('div');
		layer.id = 'cp2077-whiteboard-layer';
		layer.setAttribute('aria-hidden', 'true');

		var mount = document.createElement('div');
		mount.className = 'cp2077-whiteboard-mount';
		mount.setAttribute('aria-label', 'Facilitator whiteboard canvas');
		layer.appendChild(mount);

		var crt = document.getElementById('cp2077-crt-overlay');
		var shell = document.getElementById('cp2077-deck-shell');
		if (crt && crt.parentNode) {
			crt.parentNode.insertBefore(layer, crt);
		} else if (shell && shell.parentNode) {
			shell.parentNode.insertBefore(layer, shell.nextSibling);
		} else {
			document.body.appendChild(layer);
		}

		whiteboardLayer = layer;
		whiteboardMountHost = mount;
		return layer;
	}

	function hideWhiteboardLayer() {
		if (whiteboardLayer) {
			whiteboardLayer.classList.remove('is-active');
			whiteboardLayer.setAttribute('aria-hidden', 'true');
		}
	}

	function getMountContainer() {
		if (useOverlayMount()) {
			ensureWhiteboardLayer();
			return whiteboardMountHost;
		}
		return activePlaceholder;
	}

	function clearRefreshTimers() {
		for (var i = 0; i < refreshTimers.length; i++) {
			clearTimeout(refreshTimers[i]);
		}
		refreshTimers = [];
	}

	function clearMountFallback() {
		if (mountFallbackTimer) {
			clearTimeout(mountFallbackTimer);
			mountFallbackTimer = null;
		}
	}

	function cancelBoundsRaf() {
		if (boundsRaf) {
			cancelAnimationFrame(boundsRaf);
			boundsRaf = null;
		}
	}

	function disconnectPlaceholderObserver() {
		if (placeholderResizeObserver) {
			placeholderResizeObserver.disconnect();
			placeholderResizeObserver = null;
		}
	}

	function connectPlaceholderObserver(placeholder) {
		disconnectPlaceholderObserver();
		if (typeof ResizeObserver === 'undefined' || !placeholder) {
			return;
		}
		placeholderResizeObserver = new ResizeObserver(function () {
			scheduleBoundsSync('placeholder-resize');
		});
		placeholderResizeObserver.observe(placeholder);
	}

	function scheduleRefresh(reason) {
		if (!activeMountEl || !window.CP2077Whiteboard || !window.CP2077Whiteboard.refresh) {
			return;
		}
		dbgRefresh(reason || 'schedule');
		clearRefreshTimers();
		function refreshIfActive() {
			if (activeMountEl) {
				window.CP2077Whiteboard.refresh(activeMountEl);
			}
		}
		requestAnimationFrame(function () {
			requestAnimationFrame(refreshIfActive);
		});
		refreshTimers.push(setTimeout(refreshIfActive, 150));
	}

	function syncWhiteboardBounds(reason) {
		if (!useOverlayMount()) {
			scheduleRefresh(reason || 'inSlide');
			return false;
		}

		ensureWhiteboardLayer();
		var placeholder = activePlaceholder;
		if (!placeholder || !whiteboardLayer) {
			hideWhiteboardLayer();
			return false;
		}

		var rect = placeholder.getBoundingClientRect();
		if (rect.width < 2 || rect.height < 2) {
			hideWhiteboardLayer();
			return false;
		}

		whiteboardLayer.style.left = Math.round(rect.left) + 'px';
		whiteboardLayer.style.top = Math.round(rect.top) + 'px';
		whiteboardLayer.style.width = Math.round(rect.width) + 'px';
		whiteboardLayer.style.height = Math.round(rect.height) + 'px';
		whiteboardLayer.classList.add('is-active');
		whiteboardLayer.setAttribute('aria-hidden', 'false');

		dbgLifecycle('sync-bounds', {
			reason: reason,
			left: rect.left,
			top: rect.top,
			width: rect.width,
			height: rect.height,
		});

		scheduleRefresh(reason || 'sync-bounds');
		return true;
	}

	function scheduleBoundsSync(reason) {
		cancelBoundsRaf();
		boundsRaf = requestAnimationFrame(function () {
			boundsRaf = null;
			if (typeof Reveal !== 'undefined' && Reveal.layout) {
				Reveal.layout();
			}
			syncWhiteboardBounds(reason);
		});
	}

	function layoutReveal() {
		if (typeof Reveal !== 'undefined' && typeof Reveal.layout === 'function') {
			Reveal.layout();
		}
		scheduleBoundsSync('layout');
	}

	function getDeckId() {
		var fromConfig = getWhiteboardConfig().deckId;
		if (fromConfig) {
			return fromConfig;
		}
		var meta =
			typeof window !== 'undefined' && window.__DECK_META__ ? window.__DECK_META__ : {};
		return meta.deck_id || '';
	}

	function getPlatformSessionId() {
		var bridge = typeof window !== 'undefined' ? window.PlatformBridge : null;
		if (!bridge || typeof bridge.isLive !== 'function' || !bridge.isLive()) {
			return null;
		}
		if (typeof bridge.getSessionId !== 'function') {
			return null;
		}
		var liveSessionId = bridge.getSessionId();
		return liveSessionId || null;
	}

	function storageKey(boardId) {
		var deckId = getDeckId();
		var liveSessionId = getPlatformSessionId();
		if (liveSessionId) {
			return STORAGE_PREFIX + liveSessionId + ':' + deckId + ':' + boardId;
		}
		return STORAGE_PREFIX + deckId + ':' + boardId;
	}

	function isLegacyWhiteboardKey(key) {
		if (!key || key.indexOf(STORAGE_PREFIX) !== 0) {
			return false;
		}
		var rest = key.slice(STORAGE_PREFIX.length);
		var parts = rest.split(':');
		return parts.length === 2 && parts[0] === getDeckId();
	}

	function clearLegacyWhiteboardStorage() {
		try {
			var keysToRemove = [];
			for (var i = 0; i < sessionStorage.length; i++) {
				var key = sessionStorage.key(i);
				if (key && isLegacyWhiteboardKey(key)) {
					keysToRemove.push(key);
				}
			}
			for (var j = 0; j < keysToRemove.length; j++) {
				sessionStorage.removeItem(keysToRemove[j]);
			}
		} catch (e) {
			/* sessionStorage unavailable */
		}
	}

	function clearSessionWhiteboardStorage(sessionId) {
		if (!sessionId) {
			return;
		}
		var prefix = STORAGE_PREFIX + sessionId + ':';
		try {
			var keysToRemove = [];
			for (var i = 0; i < sessionStorage.length; i++) {
				var key = sessionStorage.key(i);
				if (key && key.indexOf(prefix) === 0) {
					keysToRemove.push(key);
				}
			}
			for (var j = 0; j < keysToRemove.length; j++) {
				sessionStorage.removeItem(keysToRemove[j]);
			}
		} catch (e) {
			/* sessionStorage unavailable */
		}
	}

	function readSession(boardId) {
		try {
			return sessionStorage.getItem(storageKey(boardId));
		} catch (e) {
			return null;
		}
	}

	function writeSession(boardId, json) {
		try {
			sessionStorage.setItem(storageKey(boardId), json);
		} catch (e) {
			/* quota or private mode */
		}
	}

	function fetchTemplate(src) {
		return fetch(src)
			.then(function (res) {
				if (!res.ok) {
					throw new Error('template fetch failed');
				}
				return res.text();
			})
			.catch(function () {
				return null;
			});
	}

	function resolveInitialScene(slide, boardId) {
		var saved = readSession(boardId);
		if (saved) {
			return Promise.resolve(saved);
		}
		var src = slide.getAttribute('data-whiteboard-src');
		if (src) {
			return fetchTemplate(src);
		}
		return Promise.resolve(null);
	}

	function unbindDebugProbe() {
		var d = dbg();
		if (d && d.unbindPointerProbe) {
			d.unbindPointerProbe();
		}
	}

	function bindDebugProbe() {
		var d = dbg();
		var target = activeMountEl || activePlaceholder;
		if (d && d.bindPointerProbe && target) {
			d.bindPointerProbe(target);
		}
	}

	function unmountActive() {
		clearRefreshTimers();
		clearMountFallback();
		cancelBoundsRaf();
		unbindDebugProbe();
		disconnectPlaceholderObserver();
		setWhiteboardPointerMode(false);
		hideWhiteboardLayer();
		if (activeMountEl && window.CP2077Whiteboard) {
			window.CP2077Whiteboard.unmount(activeMountEl);
		}
		activeMountEl = null;
		activePlaceholder = null;
		activeSlide = null;
		if (typeof Reveal !== 'undefined') {
			Reveal.configure({ keyboard: true });
		}
	}

	function clearBundleMissingMessage(placeholder) {
		if (!placeholder) {
			return;
		}
		placeholder.classList.remove('whiteboard-root--bundle-missing');
		placeholder.removeAttribute('data-bundle-missing');
		if (placeholder.getAttribute('data-bundle-missing-text') === '1') {
			placeholder.textContent = '';
			placeholder.removeAttribute('data-bundle-missing-text');
		}
	}

	function resolveWhiteboardTheme(slide) {
		if (!slide) {
			return 'dark';
		}
		var attr = slide.getAttribute('data-whiteboard-theme');
		if (attr === 'light' || attr === 'dark') {
			return attr;
		}
		return 'dark';
	}

	function showBundleMissingMessage(placeholder) {
		if (!placeholder || placeholder.getAttribute('data-bundle-missing') === '1') {
			return;
		}
		placeholder.setAttribute('data-bundle-missing', '1');
		placeholder.classList.add('whiteboard-root--bundle-missing');
		placeholder.setAttribute('role', 'alert');
		placeholder.textContent =
			'Whiteboard bundle not loaded. Run `npm run build:present` from this deck folder.';
		placeholder.setAttribute('data-bundle-missing-text', '1');
	}

	function mountWhiteboard(slide) {
		var placeholder = slide.querySelector('.whiteboard-root');
		if (!placeholder) {
			return;
		}

		if (!window.CP2077Whiteboard) {
			if (!bundleMissingWarned) {
				bundleMissingWarned = true;
				console.warn(
					'[cp2077-whiteboard] CP2077Whiteboard is undefined. ' +
						'Run `npm run build:present` from this deck folder.'
				);
			}
			showBundleMissingMessage(placeholder);
			return;
		}

		clearBundleMissingMessage(placeholder);

		var boardId = slide.getAttribute('data-whiteboard-id') || 'default';

		if (
			activeSlide === slide &&
			activePlaceholder === placeholder &&
			activeMountEl
		) {
			layoutReveal();
			return;
		}

		unmountActive();
		activeSlide = slide;
		activePlaceholder = placeholder;
		setWhiteboardPointerMode(true);
		connectPlaceholderObserver(placeholder);

		if (useOverlayMount()) {
			ensureWhiteboardLayer();
		}

		activeMountEl = getMountContainer();
		if (!activeMountEl) {
			return;
		}

		bindDebugProbe();
		dbgLifecycle('mount', { boardId: boardId, mount: useOverlayMount() ? 'overlay' : 'inSlide' });

		layoutReveal();

		resolveInitialScene(slide, boardId).then(function (initialScene) {
			if (activePlaceholder !== placeholder) {
				return;
			}
			window.CP2077Whiteboard.mount(activeMountEl, {
				boardId: boardId,
				storageKey: storageKey(boardId),
				initialScene: initialScene,
				theme: resolveWhiteboardTheme(slide),
				onPersist: function (json) {
					writeSession(boardId, json);
					if (
						window.PlatformBridgeWhiteboard &&
						typeof PlatformBridgeWhiteboard.onLocalPersist === 'function'
					) {
						PlatformBridgeWhiteboard.onLocalPersist(boardId, json);
					}
				},
				onApiReady: function () {
					layoutReveal();
					if (
						window.PlatformBridgeWhiteboard &&
						typeof PlatformBridgeWhiteboard.onBoardMounted === 'function'
					) {
						PlatformBridgeWhiteboard.onBoardMounted(boardId);
					}
				},
				onPointerRefresh: function () {
					scheduleRefresh('excalidraw-pointer-down');
				},
				onPointerUpdate: function (payload) {
					var d = dbg();
					if (d && d.logPointerUpdate) {
						d.logPointerUpdate(payload);
					}
				},
			});
			layoutReveal();
		});
	}

	function scheduleMountFallback(slide) {
		clearMountFallback();
		mountFallbackTimer = setTimeout(function () {
			mountFallbackTimer = null;
			if (
				typeof Reveal !== 'undefined' &&
				Reveal.getCurrentSlide &&
				Reveal.getCurrentSlide() === slide &&
				activeSlide !== slide
			) {
				mountWhiteboard(slide);
			}
		}, 650);
	}

	function syncFromReveal(immediate) {
		if (typeof Reveal === 'undefined' || !Reveal.getCurrentSlide) {
			return;
		}
		var slide = Reveal.getCurrentSlide();
		if (slide && slide.classList.contains('whiteboard-slide')) {
			if (slide === activeSlide && activeMountEl) {
				layoutReveal();
				return;
			}
			if (immediate) {
				clearMountFallback();
				mountWhiteboard(slide);
			} else {
				scheduleMountFallback(slide);
			}
			return;
		}
		unmountActive();
	}

	function onWhiteboardSlideActivated() {
		if (typeof Reveal === 'undefined' || !Reveal.getCurrentSlide) {
			return;
		}
		clearMountFallback();
		var slide = Reveal.getCurrentSlide();
		if (slide && slide.classList.contains('whiteboard-slide')) {
			mountWhiteboard(slide);
		}
	}

	function downloadJson(filename, json) {
		var blob = new Blob([json], { type: 'application/json' });
		var url = URL.createObjectURL(blob);
		var link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		URL.revokeObjectURL(url);
	}

	function exportBoard() {
		if (!activeMountEl || !window.CP2077Whiteboard) {
			return;
		}
		var boardId =
			(activeSlide && activeSlide.getAttribute('data-whiteboard-id')) || 'whiteboard';
		var json = window.CP2077Whiteboard.exportJson(activeMountEl);
		if (json) {
			downloadJson(boardId + '.excalidraw', json);
		}
	}

	function ensureFileInput() {
		if (fileInput) {
			return fileInput;
		}
		fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = '.excalidraw,.json,application/json';
		fileInput.style.display = 'none';
		fileInput.addEventListener('change', function () {
			var file = fileInput.files && fileInput.files[0];
			fileInput.value = '';
			if (!file || !activeMountEl || !window.CP2077Whiteboard) {
				return;
			}
			window.CP2077Whiteboard.importBlob(activeMountEl, file).then(function () {
				var boardId =
					(activeSlide && activeSlide.getAttribute('data-whiteboard-id')) ||
					'whiteboard';
				var json = window.CP2077Whiteboard.exportJson(activeMountEl);
				if (json) {
					writeSession(boardId, json);
				}
			});
		});
		document.body.appendChild(fileInput);
		return fileInput;
	}

	function importBoard() {
		if (!activeMountEl) {
			return;
		}
		ensureFileInput().click();
	}

	function onKeyDown(event) {
		if (!activeMountEl || !activeSlide) {
			return;
		}
		if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) {
			return;
		}
		if (event.key === 'S' || event.key === 's') {
			event.preventDefault();
			exportBoard();
		}
		if (event.key === 'O' || event.key === 'o') {
			event.preventDefault();
			importBoard();
		}
		if (event.key === 'D' || event.key === 'd') {
			var d = dbg();
			if (d && d.isEnabled && d.isEnabled() && d.dump) {
				event.preventDefault();
				d.dump();
			}
		}
	}

	function init() {
		if (typeof Reveal === 'undefined') {
			return;
		}
		if (useOverlayMount()) {
			ensureWhiteboardLayer();
		}
		Reveal.on('ready', function () {
			syncFromReveal(true);
		});
		Reveal.on('slidechanged', function () {
			syncFromReveal(false);
		});
		Reveal.on('slidetransitionend', onWhiteboardSlideActivated);
		Reveal.on('resize', function () {
			if (activeMountEl) {
				layoutReveal();
			}
		});
		window.addEventListener('resize', function () {
			if (activeMountEl) {
				scheduleBoundsSync('window-resize');
			}
		});
		window.addEventListener('scroll', function () {
			if (activeMountEl && useOverlayMount()) {
				scheduleBoundsSync('window-scroll');
			}
		});
		document.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('beforeunload', function () {
			if (activeMountEl && activeSlide && window.CP2077Whiteboard) {
				var boardId =
					activeSlide.getAttribute('data-whiteboard-id') || 'default';
				var json = window.CP2077Whiteboard.exportJson(activeMountEl);
				if (json) {
					writeSession(boardId, json);
				}
			}
		});
	}

	window.cp2077WhiteboardBridgeInit = init;
	window.cp2077WhiteboardStorage = {
		storageKey: storageKey,
		clearLegacy: clearLegacyWhiteboardStorage,
		clearSession: clearSessionWhiteboardStorage,
	};
})();
