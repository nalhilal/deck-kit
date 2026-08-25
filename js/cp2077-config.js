/**
 * Cyberpunk 2077 presentation config — edit defaults here.
 *
 * Theme: corporate | industrial | synthwave (?theme= when useUrlParam)
 *
 * FX presets (off | subtle | fullCrt): built-in bundles — fx.layers below is IGNORED.
 * FX preset custom + useConfigDefaults true: fx.layers toggles apply.
 * URL ?fx= overrides preset when useUrlParam is true.
 * persist false: no localStorage read/write (cp2077-fx-state / cp2077-theme).
 *
 * Always from this file: glitchTargets, barrelStrength, intensity.
 * After edits: npm run dev + hard refresh; check cp2077FxGetLayers() in console.
 *
 * Preview: cp2077-config-preview.js (deferInit, preset off on theme_effects_preview.html)
 *
 * Deck version: injected via js/deck-meta.js from package.json (npm run package:platform).
 * See VERSIONING.md.
 */
var __deckMeta = (typeof window !== 'undefined' && window.__DECK_META__) || {};
window.CP2077_CONFIG = {
	deck: {
		id: __deckMeta.deck_id || '',
		version: __deckMeta.version || '0.0.0-dev',
		title: __deckMeta.title || '',
		revealVersion: '6.0.1',
		copyright: __deckMeta.copyright || 'MIT — see LICENSE',
	},
	theme: {
		default: 'industrial',
		useUrlParam: true,
		persist: false,
	},
	fx: {
		enabled: true,
		preset: 'custom',
		useUrlParam: true,
		persist: false,
		useConfigDefaults: true,
		barrelStrength: 10,
		intensity: 1,
		respectReducedMotion: true,
		glitchTargets: ['h1', 'h2', 'h3'],
		layers: {
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
	},
	whiteboard: {
		mount: 'overlay',
		deckId: __deckMeta.deck_id || '',
		disableBarrel: true,
		debug: false,
	},
	annotate: {
		layerZIndex: 75,
		aboveCrt: true,
	},
};
