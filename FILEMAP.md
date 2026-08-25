# Deck kit file map

Used when copying `presentations/chapter_01` into `nalhilal/deck-kit`. See [08-deck-kit.md](08-deck-kit.md).

## Engine (copy into kit; educators should not fork)

| Path | Notes |
|------|--------|
| `js/` except generated `js/deck-meta.js` | Reveal core, CP2077, platform bridge, whiteboard-bridge |
| `js/whiteboard/` | Excalidraw entry (build with `build:whiteboard`) |
| `css/cp2077-*.css`, `css/platform-*.css`, `css/reset.css`, `css/reveal.scss`, `css/print/` | Engine styles |
| `css/theme/` | Cyberpunk + Reveal theme SCSS |
| `css/deck.css` | Slide component classes (from `chapter-01.css`) |
| `plugin/` | Reveal plugins + vendored tldreveal |
| `scripts/` | pack, inject-deck-meta, scan markers, vendor, init |
| `build/`, `vite.config*.ts`, `tsconfig*.json`, `package.json`, `package-lock.json` | Tooling |
| `theme_example.html`, `theme_effects_preview.html`, `js/cp2077-config-preview.js` | Optional FX preview |
| `WHITEBOARD.md`, `LICENSE-REVEAL.md` | Author + Reveal MIT |
| `.gitignore`, `.npmrc`, `.prettierrc` | Tooling |

## Content (kit stub vs Chapter 1 overlay)

| Path | Kit Template | Chapter 1 (`ai_training`) |
|------|----------------|---------------------------|
| `content/slides.html` | Stub title / activity / whiteboard / poll | Chapter 1 curriculum |
| `package.json` `deck.*` / `version` | `example-deck` / `1.0.0` | `chapter-01` / course semver |
| `content/css/` | unused (kit uses `css/deck.css`) | optional overrides |

## Omit (do not copy into kit)

| Path | Why |
|------|-----|
| `react/` | Optional wrapper, not required for HTML decks |
| `examples/`, `demo.html` | Upstream Reveal demos |
| `test/` | Upstream QUnit |
| `.github/` under chapter_01 | Inactive Reveal CI |
| `tests/e2e/` | Chapter 1 Playwright (stays in `ai_training`) |
| `node_modules/`, `js/deck-meta.js`, `dist/*.zip` | Generated |
| Chapter 1 `index.html` slide copy | Curriculum; not MIT stub |
| `planning/` | Facilitator notes live in `ai_training/planning/` |
| `COPYRIGHT.md` (UNLICENSED course) | Kit uses MIT `LICENSE` + third-party `COPYRIGHT.md` |
| `CHANGELOG.md` Chapter 1 history | Kit starts its own changelog |
