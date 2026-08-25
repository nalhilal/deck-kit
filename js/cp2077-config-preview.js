/**
 * Preview-only overrides for theme_effects_preview.html (load after cp2077-config.js).
 */
(function () {
	var base = window.CP2077_CONFIG || {};
	window.CP2077_CONFIG = {
		theme: Object.assign({}, base.theme, { persist: false }),
		fx: Object.assign({}, base.fx, {
			enabled: true,
			persist: false,
			preset: 'off',
			deferInit: true,
			useUrlParam: true,
			intensity: 1,
			barrelStrength: 10,
		}),
	};
})();
