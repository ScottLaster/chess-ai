import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FILES = ['a','b','c','d','e','f','g','h'];

self.onmessage = (event) => {
  const { id, fen, level, plyCount = 0 } = event.data || {};
  if (!id || !fen) return;
  try {
    const game = new Chess(fen);
    const aiColor = game.turn();
    const moves = game.moves({ verbose: true });
    if (!moves.length) return self.postMessage({ id, move: null });
    const opening = chooseOpeningMove(game, moves, level, plyCount);
    if (opening) return self.postMessage({ id, move: toMoveInput(opening), stats: { nodes: 0, depth: 0 } });

    const config = level === 'medium'
      ? { depth: 2, timeMs: 260, noise: 160 }
      : { depth: 3, timeMs: 760, noise: 42 };
    const result = searchBestMove(game, aiColor, config.depth, config.timeMs, config.noise);
    self.postMessage({ id, move: result.move || toMoveInput(moves[0]), stats: { nodes: result.nodes, depth: config.depth } });
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  }
};

function chooseOpeningMove(game, moves, level, plyCount) {
  if (plyCount > 7) return null;
  const weighted = [];
  moves.forEach(m => {
    let w = 0;
    if (m.piece === 'p' && ['d4','e4','d5','e5'].includes(m.to)) w += 10;
    if (m.piece === 'n' && ['c3','f3','c6','f6'].includes(m.to)) w += 9;
    if (m.piece === 'b' && ['c4','b5','c5','b4','f4','g5','f5','g4'].includes(m.to)) w += 5;
    if (m.isKingsideCastle?.() || m.isQueensideCastle?.()) w += 8;
    if (m.piece === 'q') w -= 5;
    if (w > 0) weighted.push({ m, w });
  });
  if (!weighted.length) return null;
  const probability = level === 'medium' ? .82 : .94;
  if (Math.random() > probability) return null;
  weighted.sort((a,b) => b.w - a.w);
  const pool = level === 'hard' ? weighted.slice(0,3) : weighted.slice(0,5);
  return pool[Math.floor(Math.random() * pool.length)].m;
}

function searchBestMove(game, perspective, depth, timeMs, noise) {
  const start = performance.now();
  let nodes = 0, bestMove = null, best = -Infinity;
  const moves = orderedMoves(game.moves({ verbose: true }));
  for (const m of moves) {
    game.move(toMoveInput(m));
    const score = minimax(game, depth - 1, -Infinity, Infinity, perspective, start, timeMs, () => ++nodes) + randomNormalish() * noise;
    game.undo();
    if (score > best) { best = score; bestMove = toMoveInput(m); }
    if (performance.now() - start > timeMs) break;
  }
  return { move: bestMove, score: best, nodes };
}

function minimax(game, depth, alpha, beta, perspective, start, timeMs, countNode) {
  countNode();
  if (performance.now() - start > timeMs) return evaluatePosition(game, perspective);
  if (game.isCheckmate()) return game.turn() === perspective ? -100000 : 100000;
  if (game.isDraw()) return 0;
  if (depth <= 0) return evaluatePosition(game, perspective);
  const maximizing = game.turn() === perspective;
  const moves = orderedMoves(game.moves({ verbose: true }));
  if (maximizing) {
    let value = -Infinity;
    for (const m of moves) {
      game.move(toMoveInput(m));
      value = Math.max(value, minimax(game, depth - 1, alpha, beta, perspective, start, timeMs, countNode));
      game.undo();
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }
  let value = Infinity;
  for (const m of moves) {
    game.move(toMoveInput(m));
    value = Math.min(value, minimax(game, depth - 1, alpha, beta, perspective, start, timeMs, countNode));
    game.undo();
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function evaluatePosition(game, perspective) {
  if (game.isCheckmate()) return game.turn() === perspective ? -100000 : 100000;
  if (game.isDraw()) return 0;
  let score = 0;
  for (const row of game.board()) for (const p of row) if (p) {
    let val = PIECE_VALUE[p.type] * 100;
    val += positionalBonus(p);
    score += p.color === perspective ? val : -val;
  }
  const mobility = game.moves().length;
  score += (game.turn() === perspective ? 1 : -1) * Math.min(22, mobility) * 1.2;
  if (game.isCheck()) score += game.turn() === perspective ? -22 : 22;
  return score;
}

function positionalBonus(p) {
  const f = FILES.indexOf(p.square[0]), r = Number(p.square[1]) - 1;
  const rr = p.color === 'w' ? r : 7 - r;
  const center = 3.5 - (Math.abs(f - 3.5) + Math.abs(r - 3.5)) / 2;
  if (p.type === 'p') return rr * 4 + center * 2;
  if (p.type === 'n') return center * 10;
  if (p.type === 'b') return center * 6;
  if (p.type === 'r') return rr === 6 ? 10 : 0;
  if (p.type === 'q') return center * 2;
  if (p.type === 'k') return rr < 2 ? -center * 2 : 0;
  return 0;
}
function orderedMoves(moves) { return moves.sort((a,b) => moveOrderingScore(b) - moveOrderingScore(a)); }
function moveOrderingScore(m) {
  let s = 0;
  if (m.captured) s += 100 + PIECE_VALUE[m.captured] * 10 - PIECE_VALUE[m.piece];
  if (m.san.includes('+')) s += 35;
  if (m.san.includes('#')) s += 10000;
  if (m.promotion) s += PIECE_VALUE[m.promotion] * 20;
  return s;
}
function toMoveInput(m) { return { from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) }; }
function randomNormalish() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }
