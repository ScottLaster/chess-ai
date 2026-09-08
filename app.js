import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';

const $ = (id) => document.getElementById(id);
const PIECES = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const AI_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', impossible: 'Impossible' };
const FILES = ['a','b','c','d','e','f','g','h'];
const STOCKFISH_JS = 'https://cdn.jsdelivr.net/npm/stockfish@18.0.8/bin/stockfish-18-lite-single.js';
const STOCKFISH_WASM = 'https://cdn.jsdelivr.net/npm/stockfish@18.0.8/bin/stockfish-18-lite-single.wasm';

let game = new Chess();
let selectedSquare = null;
let legalMoves = [];
let lastMove = null;
let isAiThinking = false;
let gameEnded = false;
let pendingPromotion = null;
let playerColor = 'w';
let aiColor = 'b';
let chosenColor = 'w';
let difficulty = 'medium';
let clockTimer = null;
let clockLastTick = performance.now();
let clocks = { w: 600000, b: 600000 };
let stockfish = null;
let stockfishReady = false;
let stockfishFailed = false;
let currentEngineSearchId = 0;
let audioContext = null;
let toastTimer = null;
let gameStartSnapshot = null;
let gameGeneration = 0;
let aiWorker = null;
let aiWorkerSeq = 0;
const aiWorkerPending = new Map();

const defaultSettings = {
  sound: false,
  animations: true,
  coordinates: true,
  legalMoves: true,
  clock: true,
  thinking: true,
  boardTheme: 'forest',
  pieceStyle: 'classic',
};
let settings = loadSettings();

function loadSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem('chess-ai-settings') || '{}') };
  } catch {
    return { ...defaultSettings };
  }
}
function saveSettings() {
  localStorage.setItem('chess-ai-settings', JSON.stringify(settings));
}

function init() {
  bindSetup();
  bindControls();
  bindSettings();
  applySettings();
  renderBoard();
  updateAllUi();
  document.addEventListener('keydown', handleKeyboard);
}

function bindSetup() {
  document.querySelectorAll('[data-color]').forEach(btn => btn.addEventListener('click', () => {
    chosenColor = btn.dataset.color;
    document.querySelectorAll('[data-color]').forEach(x => {
      const active = x === btn;
      x.classList.toggle('selected', active);
      x.setAttribute('aria-pressed', String(active));
    });
  }));
  document.querySelectorAll('[data-difficulty]').forEach(btn => btn.addEventListener('click', () => {
    difficulty = btn.dataset.difficulty;
    document.querySelectorAll('[data-difficulty]').forEach(x => {
      const active = x === btn;
      x.classList.toggle('selected', active);
      x.setAttribute('aria-pressed', String(active));
    });
  }));
  $('startGameButton').addEventListener('click', () => {
    settings.clock = $('clockSetupToggle').checked;
    $('clockToggle').checked = settings.clock;
    saveSettings();
    startNewGame({ preserveSide: false });
  });
}

function bindControls() {
  $('settingsButton').addEventListener('click', () => openModal('settingsModal'));
  $('undoButton').addEventListener('click', undoTurn);
  $('restartButton').addEventListener('click', () => startNewGame({ preserveSide: true }));
  $('newGameButton').addEventListener('click', returnToSetup);
  $('resignButton').addEventListener('click', resignGame);
  $('playAgainButton').addEventListener('click', () => { closeModal('resultModal'); startNewGame({ preserveSide: true }); });
  $('changeDifficultyButton').addEventListener('click', () => { closeModal('resultModal'); returnToSetup(); });
  $('returnSetupButton').addEventListener('click', () => { closeModal('resultModal'); returnToSetup(); });
  document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  $('settingsModal').addEventListener('click', (e) => { if (e.target === $('settingsModal')) closeModal('settingsModal'); });
}

function bindSettings() {
  const mapping = [
    ['soundToggle', 'sound'], ['animationToggle', 'animations'], ['coordinatesToggle', 'coordinates'],
    ['legalMovesToggle', 'legalMoves'], ['clockToggle', 'clock'], ['thinkingToggle', 'thinking']
  ];
  mapping.forEach(([id,key]) => {
    $(id).checked = settings[key];
    $(id).addEventListener('change', () => {
      settings[key] = $(id).checked;
      if (key === 'clock') $('clockSetupToggle').checked = settings.clock;
      saveSettings(); applySettings(); updateClockUi();
    });
  });
  $('boardThemeSelect').value = settings.boardTheme;
  $('pieceStyleSelect').value = settings.pieceStyle;
  $('boardThemeSelect').addEventListener('change', () => { settings.boardTheme = $('boardThemeSelect').value; saveSettings(); applySettings(); });
  $('pieceStyleSelect').addEventListener('change', () => { settings.pieceStyle = $('pieceStyleSelect').value; saveSettings(); applySettings(); });
  $('clockSetupToggle').checked = settings.clock;
}

function applySettings() {
  document.body.dataset.boardTheme = settings.boardTheme;
  document.body.classList.toggle('animations-on', settings.animations);
  document.body.classList.remove('piece-style-classic','piece-style-modern','piece-style-minimal');
  document.body.classList.add(`piece-style-${settings.pieceStyle}`);
  if ($('board').children.length) renderBoard();
  updateThinkingIndicator();
}

function startNewGame({ preserveSide }) {
  gameGeneration++;
  stopClock();
  stopStockfishSearch();
  resetAiWorker();
  game = new Chess();
  selectedSquare = null; legalMoves = []; lastMove = null; gameEnded = false; isAiThinking = false; pendingPromotion = null;
  clocks = { w: 600000, b: 600000 };
  currentEngineSearchId++;
  $('evaluationText').textContent = '—'; $('depthText').textContent = '—';

  if (!preserveSide) {
    playerColor = chosenColor === 'random' ? (Math.random() < .5 ? 'w' : 'b') : chosenColor;
  }
  aiColor = playerColor === 'w' ? 'b' : 'w';
  gameStartSnapshot = { playerColor, aiColor, difficulty, clock: settings.clock };
  $('setupScreen').classList.add('hidden');
  $('gameScreen').classList.remove('hidden');
  $('aiDifficultyBadge').textContent = AI_LABEL[difficulty];
  $('aiDifficultyText').textContent = AI_LABEL[difficulty];
  $('playerColorBadge').textContent = playerColor === 'w' ? 'White' : 'Black';
  $('aiStatusText').textContent = difficulty === 'impossible' ? 'Engine loading' : 'Ready';
  renderBoard(); updateAllUi();
  playSound('start');
  startClock();
  if (game.turn() === aiColor) scheduleAiMove();
  if (difficulty === 'impossible') ensureStockfish().catch(() => {});
}

function returnToSetup() {
  gameGeneration++;
  stopClock(); stopStockfishSearch(); resetAiWorker(); isAiThinking = false; gameEnded = false;
  closeModal('resultModal');
  $('gameScreen').classList.add('hidden');
  $('setupScreen').classList.remove('hidden');
}

function resignGame() {
  if (gameEnded) return;
  gameEnded = true; isAiThinking = false; stopClock(); stopStockfishSearch(); updateAllUi();
  playSound('end');
  showResult('RESIGNATION', 'You resigned', 'AI wins the game.');
}

function undoTurn() {
  if (isAiThinking || game.history().length === 0) return;
  closeModal('resultModal'); gameEnded = false;
  // Undo until it is the player's turn, normally two plies.
  let undone = game.undo();
  if (undone && game.turn() !== playerColor && game.history().length) game.undo();
  lastMove = game.history({ verbose: true }).at(-1) || null;
  selectedSquare = null; legalMoves = [];
  // Clock restoration cannot be exact without per-ply snapshots; give a small, bounded adjustment.
  if (settings.clock) clocks[playerColor] = Math.min(600000, clocks[playerColor] + 3000);
  renderBoard(); updateAllUi(); startClock();
}

function renderBoard() {
  const board = $('board'); board.innerHTML = '';
  const ranks = playerColor === 'w' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
  const files = playerColor === 'w' ? FILES : [...FILES].reverse();
  const checkedKing = game.isCheck() ? findKingSquare(game.turn()) : null;
  const legalTargets = new Map(legalMoves.map(m => [m.to, m]));

  ranks.forEach((rank, rankIdx) => files.forEach((file, fileIdx) => {
    const squareName = `${file}${rank}`;
    const square = document.createElement('div');
    square.className = `square ${(FILES.indexOf(file) + rank) % 2 === 1 ? 'light' : 'dark'}`;
    square.dataset.square = squareName; square.setAttribute('role','gridcell'); square.setAttribute('tabindex','0');
    square.setAttribute('aria-label', describeSquare(squareName));
    if (selectedSquare === squareName) square.classList.add('selected');
    if (lastMove && (lastMove.from === squareName || lastMove.to === squareName)) square.classList.add('last-move');
    if (checkedKing === squareName) square.classList.add('in-check');
    if (settings.legalMoves && legalTargets.has(squareName)) {
      square.classList.add(game.get(squareName) ? 'capture-target' : 'legal');
    }
    if (settings.coordinates) {
      if (rankIdx === 7) { const c = document.createElement('span'); c.className='coord file'; c.textContent=file; square.appendChild(c); }
      if (fileIdx === 0) { const c = document.createElement('span'); c.className='coord rank'; c.textContent=rank; square.appendChild(c); }
    }
    const piece = game.get(squareName);
    if (piece) {
      const el = document.createElement('div'); el.className = `piece piece-${piece.color === 'w' ? 'white':'black'}`;
      el.textContent = PIECES[piece.color][piece.type]; el.draggable = canHumanMovePiece(squareName);
      el.setAttribute('aria-hidden','true');
      el.addEventListener('dragstart', e => onDragStart(e, squareName));
      el.addEventListener('dragend', () => document.body.classList.remove('dragging-piece'));
      square.appendChild(el);
    }
    square.addEventListener('click', () => onSquareClick(squareName));
    square.addEventListener('dragover', e => e.preventDefault());
    square.addEventListener('drop', e => onDrop(e, squareName));
    square.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSquareClick(squareName); } });
    board.appendChild(square);
  }));
}

function describeSquare(square) {
  const p = game.get(square);
  return `${square}${p ? `, ${p.color === 'w' ? 'white' : 'black'} ${pieceName(p.type)}` : ', empty'}`;
}
function pieceName(t) { return ({p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'})[t]; }
function canHumanMovePiece(square) {
  const p = game.get(square);
  return !!p && p.color === playerColor && game.turn() === playerColor && !isAiThinking && !gameEnded;
}

function onDragStart(e, square) {
  if (!canHumanMovePiece(square)) { e.preventDefault(); return; }
  selectSquare(square);
  e.dataTransfer.setData('text/plain', square);
  e.dataTransfer.effectAllowed = 'move';
  document.body.classList.add('dragging-piece');
}
function onDrop(e, target) {
  e.preventDefault();
  const source = e.dataTransfer.getData('text/plain') || selectedSquare;
  if (source) attemptHumanMove(source, target);
}

function onSquareClick(square) {
  if (gameEnded || isAiThinking || game.turn() !== playerColor) return;
  const piece = game.get(square);
  if (!selectedSquare) {
    if (piece?.color === playerColor) selectSquare(square);
    return;
  }
  if (square === selectedSquare) { selectedSquare = null; legalMoves=[]; renderBoard(); return; }
  if (piece?.color === playerColor) { selectSquare(square); return; }
  attemptHumanMove(selectedSquare, square);
}

function selectSquare(square) {
  selectedSquare = square;
  legalMoves = game.moves({ square, verbose: true });
  renderBoard();
}

function attemptHumanMove(from, to) {
  const candidates = game.moves({ square: from, verbose: true }).filter(m => m.to === to);
  if (!candidates.length) { selectSquare(from); return; }
  const promotionMoves = candidates.filter(m => m.promotion);
  if (promotionMoves.length) { openPromotion(from, to); return; }
  commitMove({ from, to });
}

function openPromotion(from, to) {
  pendingPromotion = { from, to };
  const choices = $('promotionChoices'); choices.innerHTML='';
  ['q','r','b','n'].forEach(type => {
    const btn = document.createElement('button'); btn.type='button'; btn.className='promotion-choice';
    btn.textContent = PIECES[playerColor][type]; btn.setAttribute('aria-label', `Promote to ${pieceName(type)}`);
    btn.addEventListener('click', () => { closeModal('promotionModal'); const p=pendingPromotion; pendingPromotion=null; commitMove({ ...p, promotion:type }); });
    choices.appendChild(btn);
  });
  openModal('promotionModal');
}

function commitMove(moveInput, byAi = false) {
  if (gameEnded) return null;
  let move;
  try { move = game.move(moveInput); } catch { move = null; }
  if (!move) return null;
  lastMove = move; selectedSquare=null; legalMoves=[];
  renderBoard(); updateAllUi();
  if (move.captured) playSound('capture'); else playSound('move');
  if (game.isCheck()) playSound('check');
  if (checkGameEnd()) return move;
  if (!byAi && game.turn() === aiColor) scheduleAiMove();
  return move;
}

function checkGameEnd() {
  if (!game.isGameOver()) return false;
  gameEnded = true; isAiThinking=false; stopClock(); stopStockfishSearch(); updateAllUi();
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'b' : 'w';
    playSound('checkmate');
    showResult('CHECKMATE', winner === playerColor ? 'You Win!' : 'AI Wins', winner === playerColor ? 'A clean finish.' : 'The engine found mate.');
  } else {
    playSound('end');
    let detail='The game is drawn.';
    if (game.isStalemate()) detail='Stalemate.';
    else if (game.isThreefoldRepetition()) detail='Draw by threefold repetition.';
    else if (game.isInsufficientMaterial()) detail='Draw by insufficient material.';
    else if (typeof game.isDrawByFiftyMoves === 'function' && game.isDrawByFiftyMoves()) detail='Draw by the 50-move rule.';
    showResult('DRAW', 'Draw', detail);
  }
  return true;
}

function showResult(kicker, title, message) {
  $('resultKicker').textContent=kicker; $('resultTitle').textContent=title; $('resultMessage').textContent=message;
  setTimeout(() => openModal('resultModal'), 220);
}

function scheduleAiMove() {
  if (gameEnded || game.turn() !== aiColor) return;
  const generation = gameGeneration;
  isAiThinking=true; updateAllUi();
  const delay = difficulty === 'easy' ? 420 : difficulty === 'medium' ? 520 : difficulty === 'hard' ? 620 : 250;
  setTimeout(async () => {
    if (generation !== gameGeneration || gameEnded || game.turn() !== aiColor) return;
    try {
      let move;
      if (difficulty === 'impossible') move = await getStockfishMove();
      else move = await chooseCustomAiMove(difficulty);
      if (!move || generation !== gameGeneration || gameEnded || game.turn() !== aiColor) return;
      isAiThinking=false;
      commitMove(move, true);
      updateAllUi();
    } catch (err) {
      console.error(err);
      isAiThinking=false;
      const fallback = randomLegalMove();
      if (fallback) commitMove(fallback, true);
      showToast('AI engine recovered with a fallback move.');
    }
  }, delay);
}

async function chooseCustomAiMove(level) {
  const moves = game.moves({ verbose: true });
  if (!moves.length) return null;
  const opening = chooseOpeningMove(moves, level);
  if (opening) return toMoveInput(opening);

  if (level === 'easy') {
    const scored = moves.map(m => ({ m, s: scoreMoveOnePly(m, aiColor) + randomNormalish()*420 }));
    scored.sort((a,b)=>b.s-a.s);
    // Beginner: often selects from the middle/lower half, but still sees obvious captures sometimes.
    const r = Math.random();
    const idx = r < .18 ? 0 : r < .55 ? Math.min(scored.length-1, 2+Math.floor(Math.random()*Math.min(8,scored.length))) : Math.floor(Math.random()*scored.length);
    await idleYield();
    return toMoveInput(scored[idx].m);
  }
  if (level === 'medium' || level === 'hard') {
    try {
      return await getWorkerAiMove(level);
    } catch (err) {
      console.warn('AI worker fallback', err);
      const config = level === 'medium' ? [2, 220, 160] : [3, 520, 45];
      const search = searchBestMove(...config);
      await idleYield();
      return search.move || toMoveInput(moves[0]);
    }
  }
  return toMoveInput(moves[0]);
}

function chooseOpeningMove(moves, level) {
  if (game.history().length > 7) return null;
  const weighted = [];
  moves.forEach(m => {
    let w=0;
    if (m.piece==='p' && ['d4','e4','d5','e5'].includes(m.to)) w += 10;
    if (m.piece==='n' && ['c3','f3','c6','f6'].includes(m.to)) w += 9;
    if (m.piece==='b' && ['c4','b5','c5','b4','f4','g5','f5','g4'].includes(m.to)) w += 5;
    if (m.flags.includes('k') || m.flags.includes('q')) w += 8;
    if (m.piece==='q') w -= 5;
    if (w>0) weighted.push({m,w});
  });
  if (!weighted.length) return null;
  const probability = level==='easy' ? .62 : level==='medium' ? .82 : .94;
  if (Math.random()>probability) return null;
  weighted.sort((a,b)=>b.w-a.w);
  const pool = level==='hard' ? weighted.slice(0,3) : weighted.slice(0,5);
  return pool[Math.floor(Math.random()*pool.length)].m;
}

function scoreMoveOnePly(move, perspective) {
  game.move(toMoveInput(move));
  let score = evaluatePosition(perspective);
  if (game.isCheckmate()) score += game.turn() === perspective ? -100000 : 100000;
  game.undo();
  return score;
}

function searchBestMove(depth, timeMs, noise) {
  const start=performance.now();
  let nodes=0, bestMove=null, best=-Infinity;
  const perspective=aiColor;
  const moves = orderedMoves(game.moves({verbose:true}));
  for (const m of moves) {
    game.move(toMoveInput(m));
    const score = minimax(depth-1, -Infinity, Infinity, perspective, start, timeMs, () => ++nodes) + randomNormalish()*noise;
    game.undo();
    if (score>best) { best=score; bestMove=toMoveInput(m); }
    if (performance.now()-start > timeMs) break;
  }
  return { move:bestMove, score:best, nodes };
}

function minimax(depth, alpha, beta, perspective, start, timeMs, countNode) {
  countNode();
  if (performance.now()-start > timeMs) return evaluatePosition(perspective);
  if (game.isCheckmate()) return game.turn()===perspective ? -100000 : 100000;
  if (game.isDraw()) return 0;
  if (depth<=0) return evaluatePosition(perspective);
  const maximizing = game.turn()===perspective;
  const moves=orderedMoves(game.moves({verbose:true}));
  if (maximizing) {
    let value=-Infinity;
    for (const m of moves) { game.move(toMoveInput(m)); value=Math.max(value,minimax(depth-1,alpha,beta,perspective,start,timeMs,countNode)); game.undo(); alpha=Math.max(alpha,value); if (alpha>=beta) break; }
    return value;
  }
  let value=Infinity;
  for (const m of moves) { game.move(toMoveInput(m)); value=Math.min(value,minimax(depth-1,alpha,beta,perspective,start,timeMs,countNode)); game.undo(); beta=Math.min(beta,value); if (alpha>=beta) break; }
  return value;
}
function orderedMoves(moves) {
  return moves.sort((a,b)=>moveOrderingScore(b)-moveOrderingScore(a));
}
function moveOrderingScore(m) {
  let s=0;
  if (m.captured) s += 100 + PIECE_VALUE[m.captured]*10 - PIECE_VALUE[m.piece];
  if (m.san.includes('+')) s += 35;
  if (m.san.includes('#')) s += 10000;
  if (m.promotion) s += PIECE_VALUE[m.promotion]*20;
  return s;
}

function evaluatePosition(perspective) {
  if (game.isCheckmate()) return game.turn()===perspective ? -100000 : 100000;
  if (game.isDraw()) return 0;
  let score=0;
  for (const row of game.board()) for (const p of row) if (p) {
    let val = PIECE_VALUE[p.type]*100;
    val += positionalBonus(p);
    score += p.color===perspective ? val : -val;
  }
  const mobility = game.moves().length;
  score += (game.turn()===perspective ? 1 : -1) * Math.min(22, mobility) * 1.2;
  if (game.isCheck()) score += game.turn()===perspective ? -22 : 22;
  return score;
}
function positionalBonus(p) {
  const f=FILES.indexOf(p.square[0]), r=Number(p.square[1])-1;
  const rr=p.color==='w'?r:7-r;
  const center = 3.5-(Math.abs(f-3.5)+Math.abs(r-3.5))/2;
  if (p.type==='p') return rr*4 + center*2;
  if (p.type==='n') return center*10;
  if (p.type==='b') return center*6;
  if (p.type==='r') return rr===6?10:0;
  if (p.type==='q') return center*2;
  if (p.type==='k') return rr<2 ? -center*2 : 0;
  return 0;
}
function randomNormalish() { return (Math.random()+Math.random()+Math.random()-1.5)/1.5; }
function toMoveInput(m) { return { from:m.from, to:m.to, ...(m.promotion?{promotion:m.promotion}:{}) }; }
function randomLegalMove() { const m=game.moves({verbose:true}); return m.length?toMoveInput(m[Math.floor(Math.random()*m.length)]):null; }
function idleYield() { return new Promise(resolve => setTimeout(resolve, 0)); }


function ensureAiWorker() {
  if (aiWorker) return aiWorker;
  aiWorker = new Worker('./ai-worker.js', { type: 'module' });
  aiWorker.onmessage = (event) => {
    const { id, move, error, stats } = event.data || {};
    const pending = aiWorkerPending.get(id);
    if (!pending) return;
    aiWorkerPending.delete(id);
    if (error) pending.reject(new Error(error));
    else pending.resolve({ move, stats });
  };
  aiWorker.onerror = (event) => {
    for (const { reject } of aiWorkerPending.values()) reject(new Error(event.message || 'AI worker error'));
    aiWorkerPending.clear();
    try { aiWorker.terminate(); } catch {}
    aiWorker = null;
  };
  return aiWorker;
}
function getWorkerAiMove(level) {
  const worker = ensureAiWorker();
  const id = ++aiWorkerSeq;
  const fen = game.fen();
  const plyCount = game.history().length;
  return new Promise((resolve, reject) => {
    aiWorkerPending.set(id, { resolve: ({ move }) => resolve(move), reject });
    worker.postMessage({ id, fen, level, plyCount });
    setTimeout(() => {
      const pending = aiWorkerPending.get(id);
      if (!pending) return;
      aiWorkerPending.delete(id);
      pending.reject(new Error('AI worker timeout'));
    }, level === 'hard' ? 2500 : 1600);
  });
}
function resetAiWorker() {
  for (const { reject } of aiWorkerPending.values()) reject(new Error('AI search cancelled'));
  aiWorkerPending.clear();
  if (aiWorker) { try { aiWorker.terminate(); } catch {} aiWorker = null; }
}

async function ensureStockfish() {
  if (stockfishReady && stockfish) return stockfish;
  if (stockfishFailed) throw new Error('Stockfish unavailable');
  if (stockfish?.readyPromise) return stockfish.readyPromise;

  const state = { worker:null, readyPromise:null, resolveReady:null, rejectReady:null, lines:[], currentResolve:null, currentReject:null, bestInfo:null, blobUrl:null };
  state.readyPromise = new Promise((resolve,reject)=>{ state.resolveReady=resolve; state.rejectReady=reject; });
  stockfish=state;
  try {
    const response = await fetch(STOCKFISH_JS, { mode:'cors', cache:'force-cache' });
    if (!response.ok) throw new Error(`Stockfish JS HTTP ${response.status}`);
    const source = await response.text();
    const blob = new Blob([source], { type:'text/javascript' });
    state.blobUrl = URL.createObjectURL(blob);
    // Stockfish.js supports a #<wasm-url> suffix for explicitly locating the WASM binary.
    const workerUrl = `${state.blobUrl}#${STOCKFISH_WASM}`;
    state.worker = new Worker(workerUrl);
    state.worker.onmessage = (ev) => handleStockfishLine(String(ev.data));
    state.worker.onerror = (err) => {
      console.error('Stockfish worker error', err);
      stockfishFailed=true; stockfishReady=false;
      state.rejectReady?.(err);
      state.currentReject?.(err);
    };
    state.worker.postMessage('uci');
    state.worker.postMessage('setoption name Hash value 64');
    state.worker.postMessage('isready');
    const timeout=setTimeout(()=>{ if(!stockfishReady){ stockfishFailed=true; state.rejectReady?.(new Error('Stockfish initialization timeout')); } },12000);
    state._readyTimeout=timeout;
    return state.readyPromise;
  } catch (err) {
    stockfishFailed=true; stockfishReady=false; state.rejectReady?.(err);
    $('aiStatusText').textContent='Strong fallback';
    showToast('Stockfish could not load; Impossible will use the strongest built-in fallback search.');
    throw err;
  }
}

function handleStockfishLine(line) {
  if (!stockfish) return;
  if (line === 'readyok') {
    clearTimeout(stockfish._readyTimeout); stockfishReady=true; stockfishFailed=false; $('aiStatusText').textContent=isAiThinking?'Thinking':'Ready'; stockfish.resolveReady?.(stockfish); stockfish.resolveReady=null; return;
  }
  if (line.startsWith('info ')) {
    const depth = line.match(/\bdepth (\d+)/)?.[1];
    const cp = line.match(/\bscore cp (-?\d+)/)?.[1];
    const mate = line.match(/\bscore mate (-?\d+)/)?.[1];
    if (depth) $('depthText').textContent=depth;
    if (mate) {
      const mateNum=Number(mate); const whiteMate = game.turn()==='w'?mateNum:-mateNum;
      $('evaluationText').textContent = whiteMate>0?`M${Math.abs(whiteMate)}`:`−M${Math.abs(whiteMate)}`;
    } else if (cp) {
      let score=Number(cp)/100; if (game.turn()==='b') score=-score;
      $('evaluationText').textContent = `${score>=0?'+':''}${score.toFixed(1)}`;
    }
    stockfish.bestInfo=line;
  }
  if (line.startsWith('bestmove ')) {
    const uci=line.split(/\s+/)[1];
    const resolve=stockfish.currentResolve; stockfish.currentResolve=null; stockfish.currentReject=null;
    resolve?.(uci);
  }
}

async function getStockfishMove() {
  try {
    await ensureStockfish();
    if (!stockfishReady) throw new Error('Stockfish not ready');
    $('aiStatusText').textContent='Thinking';
    const fen=game.fen(); const searchId=++currentEngineSearchId;
    stockfish.worker.postMessage('stop');
    stockfish.worker.postMessage('ucinewgame');
    stockfish.worker.postMessage(`position fen ${fen}`);
    const isMobile = matchMedia('(max-width: 840px)').matches;
    const moveTime = isMobile ? 1100 : 1800;
    const uci = await new Promise((resolve,reject)=>{
      stockfish.currentResolve=(value)=>{ if(searchId===currentEngineSearchId) resolve(value); else reject(new Error('Stale engine result')); };
      stockfish.currentReject=reject;
      stockfish.worker.postMessage(`go movetime ${moveTime}`);
      setTimeout(()=>{ if(stockfish.currentResolve){ stockfish.worker.postMessage('stop'); } }, moveTime+700);
    });
    if (!uci || uci==='(none)') return null;
    const from=uci.slice(0,2), to=uci.slice(2,4), promotion=uci[4];
    return { from,to,...(promotion?{promotion}:{}) };
  } catch (err) {
    if (/cancelled|stale/i.test(String(err?.message || err))) return null;
    console.warn('Stockfish fallback',err);
    $('aiStatusText').textContent='Strong fallback';
    const fallback=searchBestMove(3,650,0);
    return fallback.move || randomLegalMove();
  }
}
function stopStockfishSearch() {
  currentEngineSearchId++;
  if (stockfish?.worker) try { stockfish.worker.postMessage('stop'); } catch {}
  if (stockfish) {
    const reject = stockfish.currentReject;
    stockfish.currentResolve = null; stockfish.currentReject = null;
    try { reject?.(new Error('Engine search cancelled')); } catch {}
  }
}

function findKingSquare(color) {
  for (const row of game.board()) for (const p of row) if (p?.type==='k' && p.color===color) return p.square;
  return null;
}

function updateAllUi() {
  updateMoveList(); updateCaptured(); updateMaterial(); updateStatus(); updateClockUi(); updateThinkingIndicator();
  $('undoButton').disabled = isAiThinking || game.history().length===0;
  $('resignButton').disabled = gameEnded;
}
function updateMoveList() {
  const history=game.history(); const list=$('moveList'); list.innerHTML='';
  for(let i=0;i<history.length;i+=2){
    const row=document.createElement('div'); row.className='move-row';
    const num=document.createElement('span'); num.className='move-number'; num.textContent=`${i/2+1}.`; row.appendChild(num);
    ['w','b'].forEach((c,j)=>{ const cell=document.createElement('span'); cell.className='move-cell'; const idx=i+j; cell.textContent=history[idx]||''; if(idx===history.length-1) cell.classList.add('latest'); row.appendChild(cell); });
    list.appendChild(row);
  }
  list.scrollTop=list.scrollHeight;
  $('moveCount').textContent=`${history.length} move${history.length===1?'':'s'}`;
}
function updateCaptured() {
  const history=game.history({verbose:true});
  const captures={w:[],b:[]};
  for(const m of history) if(m.captured) captures[m.color].push(m.captured);
  renderCaptureRow($('playerCaptured'), captures[playerColor], playerColor);
  renderCaptureRow($('aiCaptured'), captures[aiColor], aiColor);
}
function renderCaptureRow(el, capturedTypes, capturer) {
  el.innerHTML='';
  const capturedColor=capturer==='w'?'b':'w';
  capturedTypes.sort((a,b)=>PIECE_VALUE[b]-PIECE_VALUE[a]);
  capturedTypes.forEach(t=>{ const s=document.createElement('span'); s.className='captured-piece'; s.textContent=PIECES[capturedColor][t]; el.appendChild(s); });
  const material=materialDelta(capturer);
  if(material>0){ const score=document.createElement('span'); score.className='capture-score'; score.textContent=`+${material}`; el.appendChild(score); }
}
function materialDelta(color) {
  let white=0,black=0;
  for(const row of game.board()) for(const p of row) if(p) (p.color==='w'?white+=PIECE_VALUE[p.type]:black+=PIECE_VALUE[p.type]);
  const diff=white-black; return color==='w'?diff:-diff;
}
function updateMaterial() {
  const d=materialDelta(playerColor);
  $('materialAdvantage').textContent=d===0?'Equal':d>0?`You +${d}`:`AI +${Math.abs(d)}`;
}
function updateStatus() {
  let status='';
  if(gameEnded) status='Game over';
  else if(isAiThinking) status='AI thinking';
  else if(game.turn()===playerColor) status=game.isCheck()?'Your turn · Check':'Your turn';
  else status=game.isCheck()?'AI in check':'AI turn';
  $('turnStatus').textContent=status;
  if(difficulty!=='impossible') {
    $('aiStatusText').textContent=isAiThinking?'Thinking':'Ready'; $('evaluationText').textContent='—'; $('depthText').textContent='—';
  } else if(!isAiThinking && stockfishReady) $('aiStatusText').textContent='Ready';
}
function updateThinkingIndicator() {
  $('thinkingOverlay').classList.toggle('hidden', !(isAiThinking && settings.thinking));
}

function startClock() {
  stopClock(); clockLastTick=performance.now();
  if(!settings.clock || gameEnded) { updateClockUi(); return; }
  clockTimer=setInterval(tickClock,100);
}
function stopClock(){ if(clockTimer){ clearInterval(clockTimer); clockTimer=null; } }
function tickClock(){
  if(!settings.clock || gameEnded){ clockLastTick=performance.now(); return; }
  const now=performance.now(), elapsed=now-clockLastTick; clockLastTick=now;
  const side=game.turn(); clocks[side]=Math.max(0,clocks[side]-elapsed); updateClockUi();
  if(clocks[side]<=0) handleTimeout(side);
}
function handleTimeout(flagged) {
  if(gameEnded) return;
  gameEnded=true; isAiThinking=false; stopClock(); stopStockfishSearch(); updateAllUi();
  const winner=flagged==='w'?'b':'w';
  if(game.isInsufficientMaterial()) showResult('TIME', 'Draw', 'Time expired in a position with insufficient mating material.');
  else showResult('TIME', winner===playerColor?'You Win!':'AI Wins', flagged===playerColor?'Your clock reached zero.':'The AI clock reached zero.');
  playSound('end');
}
function updateClockUi(){
  [['w', playerColor==='w' ? $('playerClock') : $('aiClock')],['b',playerColor==='b' ? $('playerClock') : $('aiClock')]].forEach(([color,el])=>{
    if(!settings.clock){ el.textContent='No clock'; el.classList.add('disabled-clock'); el.classList.remove('active','low'); return; }
    el.classList.remove('disabled-clock'); el.textContent=formatTime(clocks[color]);
    el.classList.toggle('active', !gameEnded && game.turn()===color); el.classList.toggle('low',clocks[color]<30000);
  });
}
function formatTime(ms){ const total=Math.max(0,Math.ceil(ms/1000)), m=Math.floor(total/60), s=total%60; return `${m}:${String(s).padStart(2,'0')}`; }

function openModal(id){ $(id).classList.remove('hidden'); const focusable=$(id).querySelector('button, input, select'); focusable?.focus(); }
function closeModal(id){ $(id).classList.add('hidden'); }
function showToast(msg){ clearTimeout(toastTimer); const t=$('toast'); t.textContent=msg; t.classList.remove('hidden'); toastTimer=setTimeout(()=>t.classList.add('hidden'),3500); }

function handleKeyboard(e) {
  if(e.key==='Escape') { closeModal('settingsModal'); if(!pendingPromotion) closeModal('resultModal'); }
}

function playSound(type) {
  if(!settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==='suspended') audioContext.resume();
    const osc=audioContext.createOscillator(), gain=audioContext.createGain();
    const spec={move:[220,.035,.035],capture:[150,.06,.05],check:[330,.08,.045],checkmate:[120,.2,.07],start:[440,.09,.045],end:[180,.13,.05]}[type]||[220,.04,.03];
    osc.frequency.value=spec[0]; osc.type=type==='check'?'triangle':'sine'; gain.gain.value=spec[2];
    osc.connect(gain); gain.connect(audioContext.destination); const now=audioContext.currentTime; gain.gain.setValueAtTime(spec[2],now); gain.gain.exponentialRampToValueAtTime(.001,now+spec[1]); osc.start(now); osc.stop(now+spec[1]+.01);
  } catch {}
}

init();
