/**
 * Annotation host layer — above CRT overlay (z-index 75).
 * tldreveal draws here; deck whiteboards stay in-slide under CRT.
 */
(function () {
	function getZIndex() {
		var cfg = window.CP2077_CONFIG || {};
		var annotate = cfg.annotate || {};
		return annotate.layerZIndex != null ? annotate.layerZIndex : 75;
	}

	function ensureAnnotateLayer() {
		var existing = document.getElementById('cp2077-annotate-layer');
		if (existing) {
			existing.style.zIndex = String(getZIndex());
			return existing;
		}

		var layer = document.createElement('div');
		layer.id = 'cp2077-annotate-layer';
		layer.setAttribute('aria-hidden', 'true');
		layer.style.zIndex = String(getZIndex());

		var crt = document.getElementById('cp2077-crt-overlay');
		if (crt && crt.parentNode) {
			crt.parentNode.insertBefore(layer, crt.nextSibling);
		} else {
			var shell = document.getElementById('cp2077-deck-shell');
			if (shell && shell.parentNode) {
				shell.parentNode.insertBefore(layer, shell.nextSibling);
			} else {
				document.body.appendChild(layer);
			}
		}

		return layer;
	}

	function reparentTldrawRoots() {
		var layer = document.getElementById('cp2077-annotate-layer');
		if (!layer) {
			return;
		}
		var selectors = ['.tl-container', '.tldraw__editor', '[data-tldraw]'];
		selectors.forEach(function (sel) {
			document.querySelectorAll(sel).forEach(function (node) {
				if (!(node instanceof HTMLElement)) {
					return;
				}
				if (node.parentNode === document.body) {
					layer.appendChild(node);
					node.style.pointerEvents = 'auto';
				}
			});
		});
	}

	function init() {
		ensureAnnotateLayer();
		reparentTldrawRoots();
		var observer = new MutationObserver(function () {
			reparentTldrawRoots();
		});
		observer.observe(document.body, { childList: true });
	}

	window.cp2077AnnotateLayerInit = init;
})();
