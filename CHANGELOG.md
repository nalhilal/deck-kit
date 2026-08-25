# deck-kit changelog

## [Unreleased]

### Fixed

- Notes mismatch HUD: show instructor learner position from the deck slide when no instructor key is stored yet (panel open while the deck advances).
- Draw-exit resync: apply buffered instructor `deck.state` when following even if draw-mode observer never fired; `setFollowing(false)` keeps an exploring learner on their slide.

### Added

- Initial public Template: Reveal + CP2077 CRT + whiteboard + platform bridge, `CONTENT_DIR` slide inject, `npm run init`.
