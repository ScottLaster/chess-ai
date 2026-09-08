# Chess AI — Build 3.0

A deployable, responsive browser chess game with four AI levels and a Stockfish 18 WASM-powered **Impossible** mode.

## What is implemented

- Complete legal chess rules via `chess.js` 1.4.0: check/checkmate, stalemate, castling, en passant, promotion, 50-move draw, threefold repetition, insufficient material, and illegal-move prevention.
- White / Black / Random side selection.
- Four AI levels (Medium and Hard calculate in a dedicated Web Worker so the board stays responsive):
  - Easy — stronger beginner tuning with improved one-ply move selection while retaining deliberate errors.
  - Medium — stronger shallow alpha-beta search with less evaluation noise.
  - Hard — stronger deeper alpha-beta search with more calculation time and substantially less randomness.
  - Impossible — Stockfish 18 lite single-threaded WASM, loaded in a Web Worker and searched by time.
- Click-to-move and drag-and-drop.
- Legal-move, capture, last-move, selection, and check highlights.
- Responsive board orientation based on the human side.
- 10:00 clocks with an untimed option.
- Move history, captured pieces, material indicator, undo, restart, resign, new-game flow.
- Promotion chooser.
- Optional synthesized move/capture/check/game sounds.
- Settings: sound, animation, coordinates, legal moves, clock, board themes, piece styles, thinking animation.
- AI status plus Stockfish evaluation/depth when available.
- Keyboard focus/Enter-to-select support and visible focus states.

## Run locally

This is a static website, but it must be served over HTTP(S) because browser module imports and Web Workers are involved.

With Python:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

Or with Node:

```bash
npx serve .
```

## Publish to the internet

No backend is required. Upload the contents of this folder to any static host such as:

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- AWS S3 + CloudFront

The app is responsive and works on desktop, tablet, and mobile browsers.

## External runtime dependencies

The site loads these browser dependencies from jsDelivr:

- `chess.js@1.4.0` (main game and custom-AI Web Worker)
- `stockfish@18.0.8` (`stockfish-18-lite-single.js` and its WASM binary)

For a production deployment where you want zero CDN dependency, download those files, serve them from your own origin, and update the URLs in `app.js`.

## Notes on difficulty

The setup screen intentionally shows only the difficulty names. Internal tuning targets are approximately 250 / 525 / 850 for Easy / Medium / Hard, but these are heuristic strength targets rather than scientifically calibrated Elo ratings. Impossible is intentionally different: it uses a real Stockfish engine.

Piece appearance can be switched between Filled and Traced in Settings. Build 3.0 uses inline vector pieces so White and Black colors remain deterministic across browsers. Piece movement uses board-level pointer capture for reliable dragging across desktop mouse/trackpad, touch, and pen, with click-to-move retained as an accessibility fallback.

## License / third-party software

This original app code may be used and modified by the project owner. Third-party dependencies retain their own licenses: chess.js is BSD-2-Clause; Stockfish/Stockfish.js is GPL-3.0. Review the dependency licenses before public redistribution, especially if you choose to self-host the Stockfish engine files.


## Build 3.0 fixes

- Replaced Unicode filled pieces with deterministic inline SVG pieces so White pieces cannot render as black due to platform glyph/emoji behavior.
- Fixed desktop drag-and-drop by capturing the pointer on the persistent board element before board redraws.
- Added cache-busting version parameters for app assets and a visible **Build 3.0** marker in Settings to make GitHub Pages deployment verification easier.
