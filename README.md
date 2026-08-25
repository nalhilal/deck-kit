# deck-kit

Template for **training-platform compatible** Reveal.js decks: Cyberpunk 2077 theme, CRT overlay, facilitator whiteboard, live polls, and `platform-bridge.js`.

Use this repository as a **GitHub Template**. You do **not** need to clone [ai_training](https://github.com/nalhilal/ai_training).

## Quick start

```bash
# after "Use this template"
npm install --legacy-peer-deps
npm run build
npm run build:present
npm start
# http://localhost:8000/index.html
```

Set your identity (kebab-case id, unique on the platform):

```bash
npm run init -- --id my-course --title "My Course"
```

## Author slides

Edit [`content/slides.html`](content/slides.html). Keep classes such as `.title-slide`, `.prompt-block`, `.whiteboard-slide`, and poll `data-poll-*` markers. Authoring: [WHITEBOARD.md](WHITEBOARD.md).

Do not edit files under `js/platform-*.js`, `js/cp2077-*.js`, or `scripts/package-deck.mjs` unless you are contributing engine fixes upstream.

## Package and upload

```bash
npm run package:platform
# dist/my-course-1.0.0.zip  → admin → course → Add presentation resource
```

Standalone `npm start` has no session WebSocket. Live classroom needs `?session=` and `?token=` from the platform.

## Updates

This template is the engine source of truth. To take engine updates, add `upstream`:

```bash
git remote add upstream https://github.com/nalhilal/deck-kit.git
git fetch upstream
git merge upstream/main   # keep your content/slides.html and package.json deck.*
```

Prefer merging only `runtime` paths if you customized `index.html` shell carefully. Stub slides live in `content/`.

## License

MIT — [LICENSE](LICENSE). Third-party notices: [COPYRIGHT.md](COPYRIGHT.md).
