import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FILES = ['a','b','c','d','e','f','g','h'];
const OPENING_BOOK = {
  '': [['e2e4', 28], ['d2d4', 24], ['g1f3', 16], ['c2c4', 14], ['b1c3', 6]],
  'e2e4': [['e7e5', 20], ['c7c5', 24], ['e7e6', 10], ['c7c6', 10], ['d7d5', 9], ['g8f6', 9]],
  'd2d4': [['d7d5', 22], ['g8f6', 20], ['e7e6', 14], ['f7f5', 4]],
  'g1f3': [['d7d5', 14], ['g8f6', 16], ['c7c5', 12], ['d7d6', 8]],
  'c2c4': [['e7e5', 16], ['g8f6', 18], ['e7e6', 14], ['c7c5', 10]],
  'e2e4 e7e5': [['g1f3', 24], ['f1c4', 18], ['b1c3', 13], ['d2d4', 11]],
  'e2e4 c7c5': [['g1f3', 24], ['b1c3', 16], ['c2c3', 7], ['d2d4', 14]],
  'e2e4 e7e6': [['d2d4', 22], ['g1f3', 9]],
  'e2e4 c7c6': [['d2d4', 18], ['b1c3', 10]],
  'd2d4 d7d5': [['c2c4', 24], ['g1f3', 14], ['e2e3', 8]],
  'd2d4 g8f6': [['c2c4', 18], ['g1f3', 16], ['c1g5', 8]],
  'g1f3 d7d5': [['d2d4', 16], ['c2c4', 14], ['g2g3', 10]],
  'c2c4 e7e5': [['b1c3', 16], ['g2g3', 12], ['g1f3', 10]],
  'e2e4 e7e5 g1f3': [['b8c6', 22], ['d7d6', 10], ['g8f6', 16]],
  'e2e4 c7c5 g1f3': [['d7d6', 20], ['b8c6', 18], ['e7e6', 11]],
  'd2d4 d7d5 c2c4': [['e7e6', 16], ['c7c6', 12], ['d5c4', 8]],
};

self.onmessage = (event) => {
  const { id, fen, level, plyCount = 0 } = event.data || {};
  if (!id || !fen) return;
  try {
    const game = new Chess(fen);
    const aiColor = game.turn();
    const moves = game.moves({ verbose: true });
    if (!moves.length) return self.postMessage({ id, move: null });

    const opening = chooseOpeningMove(game, moves, level, plyCount);
    if (opening) return self.postMessage({ id, move: toMoveInput(opening), stats: { nodes: 0, depth: 0, score: 0 } });

    const config = level === 'medium'
      ? { depth: 2, timeMs: 550, noise: 70 }
      : level === 'hard'
      ? { depth: 4, timeMs: 1700, noise: 8 }
      : { depth: 5, timeMs: 3200, noise: 0 };

    const result = searchBestMove(game, aiColor, config.depth, config.timeMs, config.noise);
    self.postMessage({ id, move: result.move || toMoveInput(moves[0]), stats: { nodes: result.nodes, depth: result.depth, score: result.score } });
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  }
};

function chooseOpeningMove(game, moves, level, plyCount) {
  if (plyCount > 9) return null;
  const key = game.history({ verbose: true }).map(m => `${m.from}${m.to}${m.promotion || ''}`.trim()).join(' ');
  const options = OPENING_BOOK[key];
  if (options?.length) {
    const legal = options.map(([uci, weight]) => ({ weight, move: moves.find(m => `${m.from}${m.to}${m.promotion || ''}` === uci) })).filter(x => x.move);
    if (legal.length) {
      const probability = level === 'medium' ? .9 : level === 'hard' ? .96 : .98;
      if (Math.random() < probability) return weightedPick(legal).move;
    }
  }
  const weighted = [];
  moves.forEach(m => {
    let w = 0;
    if (m.piece === 'p' && ['d4','e4','d5','e5','c4','c5'].includes(m.to)) w += 12;
    if (m.piece === 'n' && ['c3','f3','c6','f6'].includes(m.to)) w += 10;
    if (m.piece === 'b' && ['c4','b5','c5','f4','g5'].includes(m.to)) w += 5;
    if (m.san === 'O-O' || m.san === 'O-O-O') w += 10;
    if (m.piece === 'q') w -= 8;
    if (w > 0) weighted.push({ move: m, weight: w });
  });
  if (!weighted.length) return null;
  const probability = level === 'medium' ? .72 : level === 'hard' ? .84 : .90;
  if (Math.random() > probability) return null;
  return weightedPick(weighted).move;
}
function weightedPick(items) {
  const total = items.reduce((sum, x) => sum + x.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function searchBestMove(game, perspective, maxDepth, timeMs, noise) {
  const start = performance.now();
  let nodes = 0;
  let bestMove = null;
  let bestScore = -Infinity;
  let reachedDepth = 0;
  const tt = new Map();

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (performance.now() - start > timeMs) break;
    let localBestMove = bestMove;
    let localBestScore = -Infinity;
    const moves = orderedMoves(game.moves({ verbose: true }), tt.get(game.fen())?.best);
    for (const move of moves) {
      if (performance.now() - start > timeMs) break;
      game.move(toMoveInput(move));
      const score = -negamax(game, depth - 1, -Infinity, Infinity, opposite(perspective), perspective, start, timeMs, tt, () => ++nodes) + randomNormalish() * noise;
      game.undo();
      if (score > localBestScore) {
        localBestScore = score;
        localBestMove = toMoveInput(move);
      }
    }
    if (localBestMove) {
      bestMove = localBestMove;
      bestScore = localBestScore;
      reachedDepth = depth;
      tt.set(game.fen(), { best: bestMove, score: bestScore, depth });
    }
  }
  return { move: bestMove, score: bestScore, nodes, depth: reachedDepth };
}

function negamax(game, depth, alpha, beta, turnColor, rootPerspective, start, timeMs, tt, countNode) {
  countNode();
  if (performance.now() - start > timeMs) return evaluatePerspective(game, rootPerspective);
  if (game.isCheckmate()) return game.turn() === rootPerspective ? -100000 : 100000;
  if (game.isDraw()) return 0;
  if (depth <= 0) return quiescence(game, alpha, beta, rootPerspective, start, timeMs, countNode);

  const key = `${game.fen()}|${depth}`;
  const cached = tt.get(key);
  if (cached?.depth >= depth) return cached.score;

  let best = -Infinity;
  let bestMove = null;
  const orderingHint = tt.get(game.fen())?.best;
  const moves = orderedMoves(game.moves({ verbose: true }), orderingHint);
  for (const move of moves) {
    game.move(toMoveInput(move));
    const score = -negamax(game, depth - 1, -beta, -alpha, opposite(turnColor), rootPerspective, start, timeMs, tt, countNode);
    game.undo();
    if (score > best) { best = score; bestMove = toMoveInput(move); }
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  tt.set(key, { score: best, best: bestMove, depth });
  return best;
}

function quiescence(game, alpha, beta, perspective, start, timeMs, countNode) {
  countNode();
  const standPat = evaluatePerspective(game, perspective);
  if (standPat >= beta) return beta;
  alpha = Math.max(alpha, standPat);
  if (performance.now() - start > timeMs) return standPat;
  const captures = orderedMoves(game.moves({ verbose: true }).filter(m => m.captured || m.promotion));
  for (const move of captures) {
    game.move(toMoveInput(move));
    const score = -quiescence(game, -beta, -alpha, perspective, start, timeMs, countNode);
    game.undo();
    if (score >= beta) return beta;
    alpha = Math.max(alpha, score);
  }
  return alpha;
}

function evaluatePerspective(game, perspective) {
  if (game.isCheckmate()) return game.turn() === perspective ? -100000 : 100000;
  if (game.isDraw()) return 0;
  let score = 0;
  for (const row of game.board()) for (const p of row) if (p) {
    let val = PIECE_VALUE[p.type] * 100 + positionalBonus(p);
    score += p.color === perspective ? val : -val;
  }
  const mobility = game.moves().length;
  score += (game.turn() === perspective ? 1 : -1) * Math.min(24, mobility) * 1.4;
  if (game.isCheck()) score += game.turn() === perspective ? -28 : 28;
  return score;
}
function positionalBonus(p) {
  const f = FILES.indexOf(p.square[0]);
  const r = Number(p.square[1]) - 1;
  const rr = p.color === 'w' ? r : 7 - r;
  const center = 3.5 - (Math.abs(f - 3.5) + Math.abs(r - 3.5)) / 2;
  if (p.type === 'p') return rr * 5 + center * 3;
  if (p.type === 'n') return center * 12;
  if (p.type === 'b') return center * 7;
  if (p.type === 'r') return rr === 6 ? 12 : 0;
  if (p.type === 'q') return center * 3;
  if (p.type === 'k') return rr < 2 ? -center * 3 : center * 1.5;
  return 0;
}
function orderedMoves(moves, bestHint) {
  const copy = [...moves];
  return copy.sort((a,b) => moveOrderingScore(b, bestHint) - moveOrderingScore(a, bestHint));
}
function moveOrderingScore(m, bestHint) {
  let s = 0;
  if (bestHint && m.from === bestHint.from && m.to === bestHint.to && (m.promotion || '') === (bestHint.promotion || '')) s += 30000;
  if (m.captured) s += 100 + PIECE_VALUE[m.captured] * 10 - PIECE_VALUE[m.piece];
  if (m.san.includes('+')) s += 35;
  if (m.san.includes('#')) s += 10000;
  if (m.promotion) s += PIECE_VALUE[m.promotion] * 20;
  return s;
}
function toMoveInput(m) { return { from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) }; }
function randomNormalish() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }
function opposite(color) { return color === 'w' ? 'b' : 'w'; }
