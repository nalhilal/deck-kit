/**
 * Cyberpunk 2077 theme switcher — CP2077_CONFIG, URL ?theme=, localStorage
 */
(function () {
	var THEMES = {
		corporate: {
			theme: 'dist/theme/cyberpunk-corporate.css',
			highlight: 'dist/plugin/highlight/cyberpunk-corporate.css',
			label: 'Corporate',
		},
		industrial: {
			theme: 'dist/theme/cyberpunk-industrial.css',
			highlight: 'dist/plugin/highlight/cyberpunk-industrial.css',
			label: 'Industrial',
		},
		synthwave: {
			theme: 'dist/theme/synthwave.css',
			highlight: 'dist/plugin/highlight/synthwave.css',
			label: 'Legacy Synthwave',
		},
	};

	function getThemeConfig() {
		var cfg = window.CP2077_CONFIG && window.CP2077_CONFIG.theme;
		return cfg || { default: 'corporate', useUrlParam: true, persist: true };
	}

	function resolveThemeName() {
		var themeCfg = getThemeConfig();

		if (themeCfg.useUrlParam) {
			var param = new URLSearchParams(location.search).get('theme');
			if (param && THEMES[param]) {
				return param;
			}
		}

		if (themeCfg.persist) {
			var stored = localStorage.getItem('cp2077-theme');
			if (stored && THEMES[stored]) {
				return stored;
			}
		}

		var fallback = themeCfg.default || 'corporate';
		return THEMES[fallback] ? fallback : 'corporate';
	}

	function apply(themeName) {
		if (!THEMES[themeName]) {
			themeName = resolveThemeName();
		}
		var t = THEMES[themeName];
		var themeLink = document.getElementById('theme-link');
		var highlightLink = document.getElementById('highlight-link');
		if (themeLink) {
			themeLink.href = t.theme;
		}
		if (highlightLink) {
			highlightLink.href = t.highlight;
		}
		var themeCfg = getThemeConfig();
		if (themeCfg.persist) {
			localStorage.setItem('cp2077-theme', themeName);
		}
		document.documentElement.dataset.cp2077Theme = themeName;
		document.querySelectorAll('[data-cp2077-theme]').forEach(function (btn) {
			btn.classList.toggle('is-active', btn.dataset.cp2077Theme === themeName);
			btn.setAttribute('aria-pressed', btn.dataset.cp2077Theme === themeName ? 'true' : 'false');
		});
		return themeName;
	}

	var initial = apply(resolveThemeName());

	window.cp2077Themes = THEMES;
	window.cp2077SetTheme = apply;
	window.cp2077ActiveTheme = initial;
})();
