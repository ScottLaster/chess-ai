# Chess AI

A deployable, responsive browser chess game with four AI levels and a Stockfish 18 WASM-powered **Impossible** mode.

## What is implemented

- Complete legal chess rules via `chess.js` 1.4.0: check/checkmate, stalemate, castling, en passant, promotion, 50-move draw, threefold repetition, insufficient material, and illegal-move prevention.
- White / Black / Random side selection.
- Four AI levels (Medium and Hard calculate in a dedicated Web Worker so the board stays responsive):
  - Easy — approximate ~100 Elo experience via noisy one-ply move scoring and deliberate errors.
  - Medium — approximate ~375 Elo experience via shallow alpha-beta search plus noise.
  - Hard — approximate ~700 Elo experience via deeper alpha-beta search, move ordering, positional evaluation, and lower randomness.
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

The displayed Elo values for Easy/Medium/Hard are UX targets, not scientifically calibrated ratings. Impossible is intentionally different: it uses a real Stockfish engine rather than a simulated Elo heuristic.

## License / third-party software

This original app code may be used and modified by the project owner. Third-party dependencies retain their own licenses: chess.js is BSD-2-Clause; Stockfish/Stockfish.js is GPL-3.0. Review the dependency licenses before public redistribution, especially if you choose to self-host the Stockfish engine files.
