import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';

const $ = (id) => document.getElementById(id);
const FILES = ['a','b','c','d','e','f','g','h'];
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE_NAMES = { p:'pawn', n:'knight', b:'bishop', r:'rook', q:'queen', k:'king' };
const AI_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', impossible: 'Impossible' };
const AI_ELO = { easy: 250, medium: 525, hard: 850, impossible: null };
const OPPONENTS = {
  easy: { key:'breen', name:'Breen' },
  medium: { key:'bellow', name:'Bellow' },
  hard: { key:'brange', name:'Brange' },
  impossible: { key:'bred', name:'Bred' },
  coach: { key:'blurple', name:'Blurple' },
};
const REVIEW_ORDER = ['brilliant','great','best','excellent','good','book','inaccuracy','mistake','miss','blunder'];
const REVIEW_TITLES = {
  brilliant:'Brilliant', great:'Great', best:'Best', excellent:'Excellent', good:'Good', book:'Book',
  inaccuracy:'Inaccuracy', mistake:'Mistake', miss:'Miss', blunder:'Blunder'
};
const STOCKFISH_SOURCES = [
  {
    js: 'https://cdn.jsdelivr.net/npm/stockfish@18.0.8/bin/stockfish-18-lite-single.js',
    wasm: 'https://cdn.jsdelivr.net/npm/stockfish@18.0.8/bin/stockfish-18-lite-single.wasm',
  },
  {
    js: 'https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.js',
    wasm: 'https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.wasm',
  },
];

const PIECE_SVG = {
  p: `
    <path class="piece-body" d="M50 17 C56 17 61 22 61 28 C61 32 59 35 56 38 C63 42 67 49 66 58 L70 69 H30 L34 58 C33 49 37 42 44 38 C41 35 39 32 39 28 C39 22 44 17 50 17 Z" />
    <path class="piece-body" d="M28 69 H72 L79 84 H21 Z" />`,
  r: `
    <path class="piece-body" d="M24 22 H35 V31 H43 V22 H50 V31 H57 V22 H65 V31 H76 V44 L69 49 L66 69 H34 L31 49 L24 44 Z" />
    <path class="piece-body" d="M28 69 H72 L79 84 H21 Z" />
    <path class="piece-detail" d="M33 48 H67" />`,
  n: `
    <path class="piece-body" d="M30 83 C31 68 36 56 45 48 L38 41 L49 18 L67 27 C73 30 77 36 78 46 L66 52 L62 69 H72 L78 83 Z" />
    <path class="piece-detail" d="M50 19 L54 33 L42 40" />
    <circle class="piece-detail-dot" cx="63" cy="37" r="2.7" />`,
  b: `
    <path class="piece-body" d="M50 15 C60 23 64 30 63 37 C62 43 57 48 55 54 L66 69 H34 L45 54 C43 48 38 43 37 37 C36 30 40 23 50 15 Z" />
    <path class="piece-body" d="M28 69 H72 L79 84 H21 Z" />
    <path class="piece-detail" d="M43 28 L57 43" />`,
  q: `
    <path class="piece-body" d="M25 30 L37 46 L50 26 L63 46 L75 30 L68 68 H32 Z" />
    <path class="piece-body" d="M27 68 H73 L80 84 H20 Z" />
    <circle class="piece-body" cx="25" cy="24" r="5" />
    <circle class="piece-body" cx="50" cy="18" r="5" />
    <circle class="piece-body" cx="75" cy="24" r="5" />
    <path class="piece-detail" d="M36 57 H64" />`,
  k: `
    <path class="piece-body" d="M38 40 H62 C68 48 66 56 61 63 L68 70 H32 L39 63 C34 56 32 48 38 40 Z" />
    <path class="piece-body" d="M28 70 H72 L79 84 H21 Z" />
    <path class="piece-detail piece-cross" d="M50 13 V34 M39 23 H61" />`,
};

const defaultSettings = {
  sound: false,
  animations: true,
  coordinates: true,
  legalMoves: true,
  clock: true,
  thinking: true,
  boardTheme: 'forest',
  pieceStyle: 'filled',
};

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
let audioContext = null;
let toastTimer = null;
let gameGeneration = 0;
let aiWorker = null;
let aiWorkerSeq = 0;
const aiWorkerPending = new Map();
let pointerDrag = null;
let dragGhost = null;
let suppressClickUntil = 0;
let settings = loadSettings();
let stockfish = null;
let stockfishReady = false;
let stockfishFailed = false;
let stockfishWarned = false;
let currentEngineSearchId = 0;
let engineMode = 'local';
let aiMood = 'idle';
let aiMoodTimer = null;
let currentReview = null;
let engineTelemetry = { status:'Ready', position:'Equal (0.0)', keyIdea:'Develop pieces', scoreCp:0, scoreText:'Equal', depth:'—' };

function loadSettings() {
  try {
    const loaded = { ...defaultSettings, ...JSON.parse(localStorage.getItem('chess-ai-settings') || '{}') };
    if (!['filled','traced'].includes(loaded.pieceStyle)) loaded.pieceStyle = 'filled';
    return loaded;
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
  renderSetupIcons();
  updateAiAvatar();
  renderBoard();
  updateAllUi();
  document.addEventListener('keydown', handleKeyboard);
  document.addEventListener('pointermove', onPiecePointerMove, { passive: false });
  document.addEventListener('pointerup', onPiecePointerUp, { passive: false });
  document.addEventListener('pointercancel', cancelPointerDrag);
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
    updateDifficultyCards();
  }));
  $('startGameButton').addEventListener('click', async () => {
    settings.clock = $('clockSetupToggle').checked;
    $('clockToggle').checked = settings.clock;
    saveSettings();
    await startNewGame({ preserveSide: false });
  });
}

function bindControls() {
  $('settingsButton').addEventListener('click', () => openModal('settingsModal'));
  $('undoButton').addEventListener('click', undoTurn);
  $('restartButton').addEventListener('click', () => startNewGame({ preserveSide: true }));
  $('newGameButton').addEventListener('click', returnToSetup);
  $('resignButton').addEventListener('click', resignGame);
  $('playAgainButton').addEventListener('click', async () => { closeModal('resultModal'); await startNewGame({ preserveSide: true }); });
  $('changeDifficultyButton').addEventListener('click', () => { closeModal('resultModal'); returnToSetup(); });
  $('returnSetupButton').addEventListener('click', () => { closeModal('resultModal'); returnToSetup(); });
  $('reviewGameButton').addEventListener('click', async () => {
    closeModal('resultModal');
    await openReviewModal();
  });
  document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  ['settingsModal','reviewModal'].forEach(id => $(id).addEventListener('click', (e) => { if (e.target === $(id)) closeModal(id); }));
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
  document.body.classList.remove('piece-style-filled','piece-style-traced');
  document.body.classList.add(`piece-style-${settings.pieceStyle}`);
  renderSetupIcons();
  updateDifficultyCards();
  updateAiAvatar();
  if ($('board').children.length) renderBoard();
  updateCaptured();
  updateThinkingIndicator();
}

function renderSetupIcons() {
  document.querySelectorAll('[data-choice-piece="white"]').forEach(el => el.innerHTML = pieceMarkup('p','w'));
  document.querySelectorAll('[data-choice-piece="black"]').forEach(el => el.innerHTML = pieceMarkup('p','b'));
  document.querySelectorAll('[data-choice-piece="random"]').forEach(el => el.innerHTML = splitPawnMarkup());
  updateDifficultyCards();
  $('coachAvatar').innerHTML = blobMarkup(OPPONENTS.coach.key, 'smile');
}

function updateDifficultyCards() {
  document.querySelectorAll('[data-difficulty-avatar]').forEach(el => {
    const level = el.dataset.difficultyAvatar;
    const opp = OPPONENTS[level];
    el.innerHTML = blobMarkup(opp.key, level === difficulty ? 'smile' : 'idle');
  });
}

async function startNewGame({ preserveSide }) {
  gameGeneration++;
  stopClock(); stopStockfishSearch(); resetAiWorker();
  game = new Chess();
  selectedSquare = null; legalMoves = []; lastMove = null; gameEnded = false; isAiThinking = false; pendingPromotion = null;
  clocks = { w: 600000, b: 600000 };
  currentEngineSearchId++;
  currentReview = null;
  engineTelemetry = { status:'Ready', position:'Equal (0.0)', keyIdea:'Develop pieces', scoreCp:0, scoreText:'Equal', depth:'—' };

  if (!preserveSide) playerColor = chosenColor === 'random' ? (Math.random() < .5 ? 'w' : 'b') : chosenColor;
  aiColor = playerColor === 'w' ? 'b' : 'w';

  $('setupScreen').classList.add('hidden');
  $('gameScreen').classList.remove('hidden');
  $('aiDifficultyBadge').textContent = AI_LABEL[difficulty];
  $('aiDifficultyText').textContent = AI_LABEL[difficulty];
  $('playerColorBadge').textContent = playerColor === 'w' ? 'White' : 'Black';
  $('reviewAiName').textContent = OPPONENTS[difficulty].name;
  $('aiNameText').textContent = OPPONENTS[difficulty].name;
  setAiMood('idle');

  renderBoard(); updateAllUi(); refreshInsightPanel();
  playSound('start'); startClock();
  if (difficulty === 'impossible') ensureStockfish().catch(() => {});
  if (game.turn() === aiColor) scheduleAiMove();
}

function returnToSetup() {
  gameGeneration++;
  stopClock(); stopStockfishSearch(); resetAiWorker(); isAiThinking = false; gameEnded = false;
  closeModal('resultModal'); closeModal('reviewModal');
  $('gameScreen').classList.add('hidden');
  $('setupScreen').classList.remove('hidden');
}

function resignGame() {
  if (gameEnded) return;
  gameEnded = true; isAiThinking = false; stopClock(); stopStockfishSearch(); updateAllUi();
  setAiMood('chuckle');
  playSound('end');
  showResult('RESIGNATION', 'You resigned', `${OPPONENTS[difficulty].name} wins the game.`);
}

function undoTurn() {
  if (isAiThinking || game.history().length === 0) return;
  closeModal('resultModal'); gameEnded = false; currentReview = null;
  let undone = game.undo();
  if (undone && game.turn() !== playerColor && game.history().length) game.undo();
  lastMove = game.history({ verbose: true }).at(-1) || null;
  selectedSquare = null; legalMoves = [];
  if (settings.clock) clocks[playerColor] = Math.min(600000, clocks[playerColor] + 3000);
  renderBoard(); updateAllUi(); refreshInsightPanel(); startClock();
}

function pieceSvg(type) {
  const shape = PIECE_SVG[type] || PIECE_SVG.p;
  return `<svg class="piece-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><g>${shape}</g></svg>`;
}
function pieceMarkup(type, color) {
  return `<div class="piece piece-${color === 'w' ? 'white' : 'black'}" aria-hidden="true">${pieceSvg(type)}</div>`;
}
function splitPawnMarkup() {
  return `<div class="piece piece-split" aria-hidden="true"><svg class="piece-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="splitLeft"><rect x="0" y="0" width="50" height="100"/></clipPath><clipPath id="splitRight"><rect x="50" y="0" width="50" height="100"/></clipPath></defs><g class="piece-white" style="color:#f6f3e8;--piece-edge:#2a2b26;--piece-detail:#60655e" clip-path="url(#splitLeft)">${PIECE_SVG.p}</g><g class="piece-black" style="color:#141513;--piece-edge:#d8d7cf;--piece-detail:#d8d7cf" clip-path="url(#splitRight)">${PIECE_SVG.p}</g></svg></div>`;
}

function blobMarkup(characterKey, mood='idle') {
  return `
    <div class="blob-body ${characterKey} mood-${mood}">
      <span class="blob-brow left"></span><span class="blob-brow right"></span>
      <span class="blob-eye left"></span><span class="blob-eye right"></span>
      <span class="blob-cheek left"></span><span class="blob-cheek right"></span>
      <span class="blob-mouth"></span>
    </div>`;
}
function setAiMood(mood, timeout = 1600) {
  clearTimeout(aiMoodTimer);
  aiMood = mood;
  updateAiAvatar();
  if (timeout > 0 && !gameEnded) {
    aiMoodTimer = setTimeout(() => {
      aiMood = isAiThinking ? 'thinking' : 'idle';
      updateAiAvatar();
    }, timeout);
  }
}
function updateAiAvatar() {
  const opp = OPPONENTS[difficulty] || OPPONENTS.medium;
  $('aiAvatar').innerHTML = blobMarkup(opp.key, isAiThinking ? 'thinking' : aiMood);
  $('coachAvatar').innerHTML = blobMarkup(OPPONENTS.coach.key, 'smile');
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
    square.dataset.square = squareName;
    square.setAttribute('role','gridcell');
    square.setAttribute('tabindex','0');
    square.setAttribute('aria-label', describeSquare(squareName));
    if (selectedSquare === squareName) square.classList.add('selected');
    if (pointerDrag?.dragging && pointerDrag.source === squareName) square.classList.add('drag-source');
    if (lastMove && (lastMove.from === squareName || lastMove.to === squareName)) square.classList.add('last-move');
    if (checkedKing === squareName) square.classList.add('in-check');
    if (settings.legalMoves && legalTargets.has(squareName)) square.classList.add(game.get(squareName) ? 'capture-target' : 'legal');
    if (settings.coordinates) {
      if (rankIdx === 7) { const c = document.createElement('span'); c.className='coord file'; c.textContent=file; square.appendChild(c); }
      if (fileIdx === 0) { const c = document.createElement('span'); c.className='coord rank'; c.textContent=rank; square.appendChild(c); }
    }
    const piece = game.get(squareName);
    if (piece) {
      const el = document.createElement('div');
      el.className = `piece piece-${piece.color === 'w' ? 'white':'black'}`;
      el.innerHTML = pieceSvg(piece.type);
      el.draggable = false;
      el.setAttribute('aria-hidden','true');
      if (canHumanMovePiece(squareName)) el.addEventListener('pointerdown', ev => onPiecePointerDown(ev, squareName));
      square.appendChild(el);
    }
    square.addEventListener('click', () => { if (performance.now() >= suppressClickUntil) onSquareClick(squareName); });
    square.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSquareClick(squareName); } });
    board.appendChild(square);
  }));
}

function describeSquare(square) {
  const p = game.get(square);
  return `${square}${p ? `, ${p.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[p.type]}` : ', empty'}`;
}
function canHumanMovePiece(square) {
  const p = game.get(square);
  return !!p && p.color === playerColor && game.turn() === playerColor && !isAiThinking && !gameEnded;
}

function onPiecePointerDown(e, square) {
  if (!canHumanMovePiece(square) || e.button > 0) return;
  e.preventDefault();
  const board = $('board');
  try { board.setPointerCapture(e.pointerId); } catch {}
  pointerDrag = { pointerId: e.pointerId, source: square, startX: e.clientX, startY: e.clientY, dragging: false };
}
function onPiecePointerMove(e) {
  if (!pointerDrag || e.pointerId !== pointerDrag.pointerId) return;
  const distance = Math.hypot(e.clientX - pointerDrag.startX, e.clientY - pointerDrag.startY);
  if (!pointerDrag.dragging && distance < 6) return;
  if (!pointerDrag.dragging) {
    pointerDrag.dragging = true;
    selectedSquare = pointerDrag.source;
    legalMoves = game.moves({ square: pointerDrag.source, verbose: true });
    renderBoard();
    const piece = game.get(pointerDrag.source);
    dragGhost = document.createElement('div');
    dragGhost.className = `drag-ghost piece piece-${piece.color === 'w' ? 'white' : 'black'}`;
    dragGhost.innerHTML = pieceSvg(piece.type);
    document.body.appendChild(dragGhost);
    document.body.classList.add('dragging-piece');
  }
  e.preventDefault();
  dragGhost.style.left = `${e.clientX}px`;
  dragGhost.style.top = `${e.clientY}px`;
}
function onPiecePointerUp(e) {
  if (!pointerDrag || e.pointerId !== pointerDrag.pointerId) return;
  const drag = pointerDrag; pointerDrag = null;
  const board = $('board');
  if (!drag.dragging) { try { if (board.hasPointerCapture(e.pointerId)) board.releasePointerCapture(e.pointerId); } catch {} return; }
  e.preventDefault();
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.square')?.dataset.square;
  cleanupDragGhost();
  try { if (board.hasPointerCapture(e.pointerId)) board.releasePointerCapture(e.pointerId); } catch {}
  suppressClickUntil = performance.now() + 300;
  if (target) attemptHumanMove(drag.source, target); else renderBoard();
}
function cancelPointerDrag(e) {
  const board = $('board');
  if (pointerDrag && e?.pointerId === pointerDrag.pointerId) {
    try { if (board.hasPointerCapture(e.pointerId)) board.releasePointerCapture(e.pointerId); } catch {}
  }
  pointerDrag = null; cleanupDragGhost();
}
function cleanupDragGhost() { dragGhost?.remove(); dragGhost = null; document.body.classList.remove('dragging-piece'); }

function onSquareClick(square) {
  if (gameEnded || isAiThinking || game.turn() !== playerColor) return;
  const piece = game.get(square);
  if (!selectedSquare) { if (piece?.color === playerColor) selectSquare(square); return; }
  if (square === selectedSquare) { selectedSquare = null; legalMoves = []; renderBoard(); return; }
  if (piece?.color === playerColor) { selectSquare(square); return; }
  attemptHumanMove(selectedSquare, square);
}
function selectSquare(square) { selectedSquare = square; legalMoves = game.moves({ square, verbose: true }); renderBoard(); }
function attemptHumanMove(from, to) {
  const candidates = game.moves({ square: from, verbose: true }).filter(m => m.to === to);
  if (!candidates.length) { selectSquare(from); return; }
  const promotionMoves = candidates.filter(m => m.promotion);
  if (promotionMoves.length) { openPromotion(from, to); return; }
  commitMove({ from, to }, false);
}

function openPromotion(from, to) {
  pendingPromotion = { from, to };
  const choices = $('promotionChoices'); choices.innerHTML = '';
  ['q','r','b','n'].forEach(type => {
    const btn = document.createElement('button'); btn.type='button'; btn.className='promotion-choice';
    btn.innerHTML = pieceMarkup(type, playerColor);
    btn.setAttribute('aria-label', `Promote to ${PIECE_NAMES[type]}`);
    btn.addEventListener('click', () => {
      closeModal('promotionModal'); const p = pendingPromotion; pendingPromotion = null; commitMove({ ...p, promotion: type }, false);
    });
    choices.appendChild(btn);
  });
  openModal('promotionModal');
}

function commitMove(moveInput, byAi = false) {
  if (gameEnded) return null;
  const mover = game.turn();
  const targetPiece = game.get(moveInput.to);
  let move;
  try { move = game.move(moveInput); } catch { move = null; }
  if (!move) return null;
  lastMove = move; selectedSquare = null; legalMoves = [];
  applyReactionToMove(move, mover, byAi, targetPiece);
  renderBoard(); updateAllUi(); refreshInsightPanel();
  if (move.captured) playSound('capture'); else playSound('move');
  if (game.isCheck()) playSound('check');
  if (checkGameEnd()) return move;
  if (!byAi && game.turn() === aiColor) scheduleAiMove();
  return move;
}

function applyReactionToMove(move, moverColor, byAi, targetBeforeMove) {
  const capturedType = move.captured || targetBeforeMove?.type;
  if (capturedType) {
    const val = PIECE_VALUE[capturedType] || 0;
    if (moverColor === playerColor) setAiMood(val >= 5 ? 'angry' : val >= 3 ? 'scared' : 'sad');
    else setAiMood(val >= 5 ? 'laugh' : 'happy');
  } else if (byAi) {
    setAiMood('thinking', 700);
  }
}

function checkGameEnd() {
  if (!game.isGameOver()) return false;
  gameEnded = true; isAiThinking = false; stopClock(); stopStockfishSearch(); updateAllUi();
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'b' : 'w';
    playSound('checkmate');
    if (winner === playerColor) { setAiMood('defeated', 0); showResult('CHECKMATE', 'You Win!', `You outplayed ${OPPONENTS[difficulty].name}.`); }
    else { setAiMood('chuckle', 0); showResult('CHECKMATE', 'AI Wins', `${OPPONENTS[difficulty].name} found mate.`); }
  } else {
    playSound('end');
    setAiMood('sad', 0);
    let detail = 'The game is drawn.';
    if (game.isStalemate()) detail = 'Stalemate.';
    else if (game.isThreefoldRepetition()) detail = 'Draw by threefold repetition.';
    else if (game.isInsufficientMaterial()) detail = 'Draw by insufficient material.';
    else if (typeof game.isDrawByFiftyMoves === 'function' && game.isDrawByFiftyMoves()) detail = 'Draw by the 50-move rule.';
    showResult('DRAW', 'Draw', detail);
  }
  return true;
}

function showResult(kicker, title, message) {
  $('resultKicker').textContent = kicker; $('resultTitle').textContent = title; $('resultMessage').textContent = message;
  setTimeout(() => openModal('resultModal'), 220);
}

function scheduleAiMove() {
  if (gameEnded || game.turn() !== aiColor) return;
  const generation = gameGeneration;
  isAiThinking = true;
  setAiMood('thinking', 0);
  engineTelemetry.status = describeAiIntent(game, aiColor, true);
  updateAllUi();
  const delay = difficulty === 'easy' ? 380 : difficulty === 'medium' ? 450 : difficulty === 'hard' ? 560 : 300;
  setTimeout(async () => {
    if (generation !== gameGeneration || gameEnded || game.turn() !== aiColor) return;
    try {
      let result;
      if (difficulty === 'impossible') result = await getStockfishMove();
      else result = await chooseCustomAiMove(difficulty);
      const move = result?.move || result;
      if (!move || generation !== gameGeneration || gameEnded || game.turn() !== aiColor) return;
      if (result?.stats?.score !== undefined) engineTelemetry.scoreCp = normalizeScoreForWhite(result.stats.score, aiColor);
      if (result?.stats?.depth) engineTelemetry.depth = String(result.stats.depth);
      isAiThinking = false;
      commitMove(move, true);
      updateAllUi();
    } catch (err) {
      console.error(err);
      isAiThinking = false;
      const fallbackResult = await getWorkerAiMove('impossible').catch(() => null);
      const fallbackMove = fallbackResult?.move || randomLegalMove();
      if (fallbackMove) commitMove(fallbackMove, true);
      showToast('The AI recovered using its local engine.');
    }
  }, delay);
}

async function chooseCustomAiMove(level) {
  const moves = game.moves({ verbose: true });
  if (!moves.length) return null;
  const opening = chooseOpeningMove(game, moves, level);
  if (opening) return { move: toMoveInput(opening), stats: { depth: 0, score: 0 } };

  if (level === 'easy') {
    const scored = moves.map(m => ({ m, s: scoreMoveOnePly(game, m, aiColor) + randomNormalish()*200 }));
    scored.sort((a,b) => b.s - a.s);
    const nearBestPool = Math.min(5, scored.length);
    const r = Math.random();
    const idx = r < .30 ? 0 : r < .78 ? Math.floor(Math.random() * nearBestPool) : Math.floor(Math.random() * scored.length);
    await idleYield();
    return { move: toMoveInput(scored[idx].m), stats: { depth: 1, score: scored[idx].s } };
  }
  const result = await getWorkerAiMove(level);
  return result;
}

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

function chooseOpeningMove(chess, moves, level) {
  const ply = chess.history().length;
  if (ply > 9) return null;
  const uciHistory = chess.history({ verbose: true }).map(m => `${m.from}${m.to}${m.promotion || ''}`.trim()).join(' ');
  const options = OPENING_BOOK[uciHistory];
  if (options?.length) {
    const legal = options.map(([uci, weight]) => ({ uci, weight, move: moves.find(m => `${m.from}${m.to}${m.promotion || ''}` === uci) })).filter(x => x.move);
    if (legal.length) {
      const probability = level === 'easy' ? .82 : level === 'medium' ? .93 : level === 'hard' ? .96 : .98;
      if (Math.random() < probability) return weightedPick(legal).move;
    }
  }
  const weighted = [];
  moves.forEach(m => {
    let w = 0;
    if (m.piece === 'p' && ['d4','e4','d5','e5','c4','c5'].includes(m.to)) w += 12;
    if (m.piece === 'n' && ['c3','f3','c6','f6'].includes(m.to)) w += 10;
    if (m.piece === 'b' && ['c4','b5','c5','g2','g7','f4','g5'].includes(m.to)) w += 5;
    if (m.san === 'O-O' || m.san === 'O-O-O') w += 10;
    if (m.piece === 'q') w -= 8;
    if (w > 0) weighted.push({ move: m, weight: w });
  });
  if (!weighted.length) return null;
  const probability = level === 'easy' ? .65 : level === 'medium' ? .75 : level === 'hard' ? .86 : .90;
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

function scoreMoveOnePly(chess, move, perspective) {
  chess.move(toMoveInput(move));
  const score = evaluatePosition(chess, perspective);
  chess.undo();
  return score;
}

function ensureAiWorker() {
  if (aiWorker) return aiWorker;
  aiWorker = new Worker('./ai-worker.js?v=4', { type: 'module' });
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
    aiWorkerPending.set(id, { resolve, reject });
    worker.postMessage({ id, fen, level, plyCount });
    const timeout = level === 'impossible' ? 5000 : level === 'hard' ? 3500 : 2500;
    setTimeout(() => {
      const pending = aiWorkerPending.get(id);
      if (!pending) return;
      aiWorkerPending.delete(id);
      pending.reject(new Error('AI worker timeout'));
    }, timeout);
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
  if (stockfish?.loadingPromise) return stockfish.loadingPromise;

  const state = stockfish || { worker:null, readyPromise:null, resolveReady:null, rejectReady:null, currentResolve:null, currentReject:null, blobUrl:null, scoreText:'', depth:'', loadingPromise:null };
  stockfish = state;

  state.loadingPromise = (async () => {
    for (const source of STOCKFISH_SOURCES) {
      try {
        state.readyPromise = new Promise((resolve, reject) => { state.resolveReady = resolve; state.rejectReady = reject; });
        const response = await fetch(source.js, { mode:'cors', cache:'force-cache' });
        if (!response.ok) throw new Error(`Stockfish JS HTTP ${response.status}`);
        const sourceText = await response.text();
        const blob = new Blob([sourceText], { type:'text/javascript' });
        state.blobUrl = URL.createObjectURL(blob);
        state.worker = new Worker(`${state.blobUrl}#${source.wasm}`);
        state.worker.onmessage = (ev) => handleStockfishLine(String(ev.data));
        state.worker.onerror = (err) => { console.error('Stockfish worker error', err); };
        state.worker.postMessage('uci');
        state.worker.postMessage('setoption name Hash value 96');
        state.worker.postMessage('isready');
        const timeout = setTimeout(() => { if (!stockfishReady) state.rejectReady?.(new Error('Stockfish initialization timeout')); }, 12000);
        state._readyTimeout = timeout;
        await state.readyPromise;
        engineMode = 'stockfish';
        state.loadingPromise = null;
        return state;
      } catch (err) {
        clearTimeout(state._readyTimeout);
        try { state.worker?.terminate(); } catch {}
        state.worker = null;
        if (state.blobUrl) URL.revokeObjectURL(state.blobUrl);
        state.blobUrl = null;
        stockfishReady = false;
      }
    }
    stockfishFailed = true;
    engineMode = 'local';
    state.loadingPromise = null;
    if (!stockfishWarned) {
      stockfishWarned = true;
      showToast('Impossible is using its local master engine because Stockfish could not load.');
    }
    throw new Error('Stockfish unavailable');
  })();

  return state.loadingPromise;
}

function handleStockfishLine(line) {
  if (!stockfish) return;
  if (line === 'readyok') {
    clearTimeout(stockfish._readyTimeout);
    stockfishReady = true;
    stockfishFailed = false;
    stockfish.resolveReady?.(stockfish);
    stockfish.resolveReady = null;
    return;
  }
  if (line.startsWith('info ')) {
    const depth = line.match(/\bdepth (\d+)/)?.[1];
    const cp = line.match(/\bscore cp (-?\d+)/)?.[1];
    const mate = line.match(/\bscore mate (-?\d+)/)?.[1];
    if (depth) engineTelemetry.depth = depth;
    if (mate) {
      const mateNum = Number(mate);
      const whiteMate = game.turn() === 'w' ? mateNum : -mateNum;
      engineTelemetry.position = whiteMate > 0 ? `Mate for White (M${Math.abs(whiteMate)})` : `Mate for Black (M${Math.abs(whiteMate)})`;
      engineTelemetry.scoreCp = whiteMate > 0 ? 10000 : -10000;
    } else if (cp) {
      const whiteScore = game.turn() === 'w' ? Number(cp) : -Number(cp);
      engineTelemetry.scoreCp = whiteScore;
      engineTelemetry.position = scoreToPositionText(whiteScore);
    }
  }
  if (line.startsWith('bestmove ')) {
    const uci = line.split(/\s+/)[1];
    const resolve = stockfish.currentResolve;
    stockfish.currentResolve = null; stockfish.currentReject = null;
    resolve?.(uci);
  }
}

async function getStockfishMove() {
  const opening = chooseOpeningMove(game, game.moves({ verbose: true }), 'impossible');
  if (opening) return { move: toMoveInput(opening), stats: { depth: 0, score: 0 } };
  try {
    await ensureStockfish();
    if (!stockfishReady) throw new Error('Stockfish not ready');
    engineMode = 'stockfish';
    engineTelemetry.status = describeAiIntent(game, aiColor, true);
    const fen = game.fen(); const searchId = ++currentEngineSearchId;
    stockfish.worker.postMessage('stop');
    stockfish.worker.postMessage('ucinewgame');
    stockfish.worker.postMessage(`position fen ${fen}`);
    const isMobile = matchMedia('(max-width: 840px)').matches;
    const moveTime = isMobile ? 1700 : 2800;
    const uci = await new Promise((resolve, reject) => {
      stockfish.currentResolve = (value) => { if (searchId === currentEngineSearchId) resolve(value); else reject(new Error('Stale engine result')); };
      stockfish.currentReject = reject;
      stockfish.worker.postMessage(`go movetime ${moveTime}`);
      setTimeout(() => { if (stockfish.currentResolve) stockfish.worker.postMessage('stop'); }, moveTime + 1000);
    });
    if (!uci || uci === '(none)') return null;
    const from = uci.slice(0,2), to = uci.slice(2,4), promotion = uci[4];
    return { move: { from, to, ...(promotion ? { promotion } : {}) }, stats: { depth: Number(engineTelemetry.depth) || 0, score: engineTelemetry.scoreCp } };
  } catch (err) {
    if (/cancelled|stale/i.test(String(err?.message || err))) return null;
    engineMode = 'local';
    const fallback = await getWorkerAiMove('impossible').catch(() => null);
    return fallback || { move: randomLegalMove(), stats: { depth: 0, score: 0 } };
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

function normalizeScoreForWhite(score, perspective) {
  return perspective === 'w' ? score : -score;
}

function evaluatePosition(chess, perspective) {
  if (chess.isCheckmate()) return chess.turn() === perspective ? -100000 : 100000;
  if (chess.isDraw()) return 0;
  let score = 0;
  for (const row of chess.board()) for (const p of row) if (p) {
    let val = PIECE_VALUE[p.type] * 100;
    val += positionalBonus(p);
    score += p.color === perspective ? val : -val;
  }
  const mobility = chess.moves().length;
  score += (chess.turn() === perspective ? 1 : -1) * Math.min(22, mobility) * 1.2;
  if (chess.isCheck()) score += chess.turn() === perspective ? -22 : 22;
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
function orderedMoves(moves) { return [...moves].sort((a,b) => moveOrderingScore(b) - moveOrderingScore(a)); }
function moveOrderingScore(m) {
  let s = 0;
  if (m.captured) s += 100 + PIECE_VALUE[m.captured] * 10 - PIECE_VALUE[m.piece];
  if (m.san.includes('+')) s += 35;
  if (m.san.includes('#')) s += 10000;
  if (m.promotion) s += PIECE_VALUE[m.promotion] * 20;
  return s;
}
function randomNormalish() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }
function toMoveInput(m) { return { from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) }; }
function randomLegalMove() { const moves = game.moves({ verbose: true }); return moves.length ? toMoveInput(moves[Math.floor(Math.random()*moves.length)]) : null; }
function idleYield() { return new Promise(resolve => setTimeout(resolve, 0)); }

function findKingSquare(color) {
  for (const row of game.board()) for (const p of row) if (p?.type === 'k' && p.color === color) return p.square;
  return null;
}

function refreshInsightPanel() {
  const whiteScore = typeof engineTelemetry.scoreCp === 'number' ? engineTelemetry.scoreCp : evaluateFromWhite(game);
  $('evaluationText').textContent = scoreToPositionText(whiteScore);
  $('aiStatusText').textContent = gameEnded ? 'Game complete' : describeAiIntent(game, aiColor, isAiThinking);
  $('depthText').textContent = describeKeyIdea(game, playerColor, aiColor, whiteScore);
}

function describeAiIntent(chess, side, thinking) {
  const moveCount = chess.history().length;
  const score = side === 'w' ? evaluatePosition(chess, 'w') : evaluatePosition(chess, 'b');
  if (thinking) {
    if (moveCount < 8) return 'Opening development';
    if (chess.isCheck()) return 'Calculating response';
    if (Math.abs(score) > 280) return score > 0 ? 'Converting advantage' : 'Finding counterplay';
    if (hasImmediateCapture(chess, side)) return 'Seeking tactics';
    return 'Balancing attack and defense';
  }
  if (moveCount < 8) return 'Opening';
  if (chess.isCheck()) return chess.turn() === side ? 'Under pressure' : 'Applying pressure';
  if (Math.abs(score) < 80) return 'Maneuvering';
  return score > 0 ? 'Pressing the position' : 'Defending carefully';
}
function hasImmediateCapture(chess, side) {
  return chess.moves({ verbose:true }).some(m => m.color === side && !!m.captured);
}
function evaluateFromWhite(chess) {
  return evaluatePosition(chess, 'w');
}
function scoreToPositionText(whiteScore) {
  const score = whiteScore / 100;
  const prefix = score >= 0 ? '+' : '';
  if (Math.abs(whiteScore) < 35) return `Equal (${prefix}${score.toFixed(1)})`;
  if (whiteScore >= 250) return `Winning for White (${prefix}${score.toFixed(1)})`;
  if (whiteScore <= -250) return `Winning for Black (${score.toFixed(1)})`;
  if (whiteScore > 0) return `White better (${prefix}${score.toFixed(1)})`;
  return `Black better (${score.toFixed(1)})`;
}
function describeKeyIdea(chess, humanSide, aiSide, whiteScore) {
  const legal = chess.moves({ verbose:true });
  if (chess.history().length < 4) return 'Fight for the center and develop your minor pieces.';
  if (chess.isCheck()) return chess.turn() === humanSide ? 'Your king is under pressure — solve the threat before chasing activity.' : 'Watch the checks and forcing replies in the position.';
  const capture = legal.find(m => m.captured);
  if (capture) return `Watch undefended pieces — ${PIECE_NAMES[capture.captured]} captures are available.`;
  const castle = legal.find(m => m.san === 'O-O' || m.san === 'O-O-O');
  if (castle) return 'King safety matters here; castling is worth considering.';
  if (Math.abs(whiteScore) > 220) return whiteScore > 0 ? 'White should simplify and convert the advantage.' : 'Black should simplify and convert the advantage.';
  const openFiles = countOpenFiles(chess);
  if (openFiles > 1) return 'Look for rook activity on the open files.';
  return 'Improve your least active piece and keep pieces defended.';
}
function countOpenFiles(chess) {
  let count = 0;
  for (const file of FILES) {
    let hasPawn = false;
    for (let rank = 1; rank <= 8; rank++) {
      const p = chess.get(`${file}${rank}`);
      if (p?.type === 'p') { hasPawn = true; break; }
    }
    if (!hasPawn) count++;
  }
  return count;
}

function updateAllUi() {
  updateMoveList(); updateCaptured(); updateMaterial(); updateStatus(); updateClockUi(); updateThinkingIndicator();
  $('undoButton').disabled = isAiThinking || game.history().length === 0;
  $('resignButton').disabled = gameEnded;
}
function updateMoveList() {
  const history = game.history(); const list = $('moveList'); list.innerHTML = '';
  for (let i = 0; i < history.length; i += 2) {
    const row = document.createElement('div'); row.className = 'move-row';
    const num = document.createElement('span'); num.className = 'move-number'; num.textContent = `${i/2 + 1}.`; row.appendChild(num);
    ['w','b'].forEach((_, j) => {
      const cell = document.createElement('span'); cell.className = 'move-cell';
      const idx = i + j; cell.textContent = history[idx] || ''; if (idx === history.length - 1) cell.classList.add('latest'); row.appendChild(cell);
    });
    list.appendChild(row);
  }
  list.scrollTop = list.scrollHeight;
  $('moveCount').textContent = `${history.length} move${history.length === 1 ? '' : 's'}`;
}
function updateCaptured() {
  const history = game.history({ verbose:true });
  const captures = { w:[], b:[] };
  for (const m of history) if (m.captured) captures[m.color].push(m.captured);
  renderCaptureRow($('playerCaptured'), captures[playerColor], playerColor);
  renderCaptureRow($('aiCaptured'), captures[aiColor], aiColor);
}
function renderCaptureRow(el, capturedTypes, capturer) {
  el.innerHTML = '';
  const capturedColor = capturer === 'w' ? 'b' : 'w';
  capturedTypes.sort((a,b) => PIECE_VALUE[b] - PIECE_VALUE[a]);
  capturedTypes.forEach(t => {
    const s = document.createElement('span'); s.className = 'captured-piece';
    s.innerHTML = pieceMarkup(t, capturedColor); el.appendChild(s);
  });
  const material = materialDelta(capturer);
  if (material > 0) { const score = document.createElement('span'); score.className = 'capture-score'; score.textContent = `+${material}`; el.appendChild(score); }
}
function materialDelta(color) {
  let white = 0, black = 0;
  for (const row of game.board()) for (const p of row) if (p) (p.color === 'w' ? white += PIECE_VALUE[p.type] : black += PIECE_VALUE[p.type]);
  const diff = white - black; return color === 'w' ? diff : -diff;
}
function updateMaterial() {
  const d = materialDelta(playerColor);
  $('materialAdvantage').textContent = d === 0 ? 'Equal' : d > 0 ? `You +${d}` : `${OPPONENTS[difficulty].name} +${Math.abs(d)}`;
}
function updateStatus() {
  let status = '';
  if (gameEnded) status = 'Game over';
  else if (isAiThinking) status = `${OPPONENTS[difficulty].name} thinking`;
  else if (game.turn() === playerColor) status = game.isCheck() ? 'Your turn · Check' : 'Your turn';
  else status = game.isCheck() ? `${OPPONENTS[difficulty].name} in check` : `${OPPONENTS[difficulty].name} to move`;
  $('turnStatus').textContent = status;
  refreshInsightPanel();
}
function updateThinkingIndicator() {
  $('thinkingOverlay').classList.toggle('hidden', !(isAiThinking && settings.thinking));
  updateAiAvatar();
}

function startClock() {
  stopClock(); clockLastTick = performance.now();
  if (!settings.clock || gameEnded) { updateClockUi(); return; }
  clockTimer = setInterval(tickClock, 100);
}
function stopClock() { if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } }
function tickClock() {
  if (!settings.clock || gameEnded) { clockLastTick = performance.now(); return; }
  const now = performance.now(), elapsed = now - clockLastTick; clockLastTick = now;
  const side = game.turn(); clocks[side] = Math.max(0, clocks[side] - elapsed); updateClockUi();
  if (clocks[side] <= 0) handleTimeout(side);
}
function handleTimeout(flagged) {
  if (gameEnded) return;
  gameEnded = true; isAiThinking = false; stopClock(); stopStockfishSearch(); updateAllUi();
  const winner = flagged === 'w' ? 'b' : 'w';
  if (game.isInsufficientMaterial()) showResult('TIME', 'Draw', 'Time expired in a position with insufficient mating material.');
  else showResult('TIME', winner === playerColor ? 'You Win!' : 'AI Wins', flagged === playerColor ? 'Your clock reached zero.' : 'The AI clock reached zero.');
  playSound('end');
}
function updateClockUi() {
  [['w', playerColor === 'w' ? $('playerClock') : $('aiClock')], ['b', playerColor === 'b' ? $('playerClock') : $('aiClock')]].forEach(([color, el]) => {
    if (!settings.clock) { el.textContent = 'No clock'; el.classList.add('disabled-clock'); el.classList.remove('active','low'); return; }
    el.classList.remove('disabled-clock'); el.textContent = formatTime(clocks[color]);
    el.classList.toggle('active', !gameEnded && game.turn() === color); el.classList.toggle('low', clocks[color] < 30000);
  });
}
function formatTime(ms) { const total = Math.max(0, Math.ceil(ms/1000)), m = Math.floor(total/60), s = total % 60; return `${m}:${String(s).padStart(2,'0')}`; }

async function openReviewModal() {
  openModal('reviewModal');
  $('reviewLoading').classList.remove('hidden');
  $('reviewContent').classList.add('hidden');
  $('coachHeadline').textContent = 'Let’s review your game.';
  $('coachSummary').textContent = 'I’m checking your decisions, your sharpest move, and your biggest improvement area.';
  try {
    if (!currentReview) currentReview = await analyzeCompletedGame();
    renderReview(currentReview);
  } catch (err) {
    console.error(err);
    $('coachHeadline').textContent = 'Review unavailable';
    $('coachSummary').textContent = 'I could not complete the review for this game.';
  } finally {
    $('reviewLoading').classList.add('hidden');
    $('reviewContent').classList.remove('hidden');
  }
}

async function analyzeCompletedGame() {
  const history = game.history({ verbose:true });
  const analyzer = new Chess();
  const stats = {
    w: createReviewBucket(),
    b: createReviewBucket(),
    keyMoments: [],
  };

  for (let idx = 0; idx < history.length; idx++) {
    const move = history[idx];
    const mover = analyzer.turn();
    const plyNumber = idx + 1;
    const legalMoves = analyzer.moves({ verbose:true });
    const openingMove = isBookMove(analyzer, move);
    let bestMove = move;
    let bestScore;
    let playedScore;
    let classification = 'book';

    if (!openingMove) {
      const depth = idx < 16 ? 2 : 3;
      const analysis = analyzePositionSync(analyzer, mover, depth);
      bestMove = analysis.bestMove || move;
      bestScore = analysis.bestScore;
      analyzer.move(toMoveInput(move));
      playedScore = evaluatePosition(analyzer, mover);
      analyzer.undo();
      classification = classifyMove(move, bestMove, bestScore, playedScore);
    }

    const note = buildReviewNote(classification, move, bestMove, bestScore, playedScore, mover);
    stats[mover].counts[classification] = (stats[mover].counts[classification] || 0) + 1;
    if (classification !== 'book') {
      const cpl = Math.max(0, Math.round((bestScore ?? 0) - (playedScore ?? 0)));
      stats[mover].totalCpl += cpl;
      stats[mover].reviewedMoves += 1;
      if (['brilliant','great','blunder','mistake','miss'].includes(classification)) {
        stats.keyMoments.push({ mover, move, plyNumber, classification, note });
      }
    }
    if (mover === playerColor) stats[mover].moves.push({ plyNumber, san: move.san, classification, note, bestSan: bestMove?.san || move.san });
    analyzer.move(toMoveInput(move));
    if (idx % 4 === 3) await idleYield();
  }

  ['w','b'].forEach(color => finalizeReviewBucket(stats[color], color));
  return buildReviewSummary(stats);
}

function createReviewBucket() {
  const counts = Object.fromEntries(REVIEW_ORDER.map(k => [k, 0]));
  return { counts, totalCpl: 0, reviewedMoves: 0, accuracy: 0, rating: 0, moves: [] };
}
function finalizeReviewBucket(bucket) {
  const avgCpl = bucket.reviewedMoves ? bucket.totalCpl / bucket.reviewedMoves : 0;
  const blunders = bucket.counts.blunder;
  const mistakes = bucket.counts.mistake;
  const inaccuracies = bucket.counts.inaccuracy;
  bucket.accuracy = clamp(35, 99, Math.round((100 - avgCpl * 0.11 - blunders * 6 - mistakes * 2.8 - inaccuracies * 1.2) * 10) / 10);
  bucket.rating = Math.round(clamp(100, 3000,
    250 + bucket.accuracy * 18 + bucket.counts.brilliant * 40 + bucket.counts.great * 24 + bucket.counts.best * 6 + bucket.counts.excellent * 4
      - bucket.counts.inaccuracy * 18 - bucket.counts.mistake * 45 - bucket.counts.blunder * 95));
}
function buildReviewSummary(stats) {
  const playerBucket = stats[playerColor];
  const aiBucket = stats[aiColor];
  const sortedMoments = stats.keyMoments.filter(x => x.mover === playerColor).sort((a,b) => reviewSeverityRank(a.classification) - reviewSeverityRank(b.classification));
  const bestMoment = sortedMoments.find(x => ['brilliant','great','best'].includes(x.classification)) || playerBucket.moves.find(x => ['best','excellent'].includes(x.classification));
  const worstMoment = sortedMoments.find(x => ['blunder','miss','mistake'].includes(x.classification));
  const coach = generateCoachText(playerBucket, bestMoment, worstMoment);
  return {
    player: playerBucket,
    ai: aiBucket,
    bestMoment,
    worstMoment,
    coach,
  };
}
function analyzePositionSync(chess, perspective, depth) {
  const moves = orderedMoves(chess.moves({ verbose:true }));
  let bestMove = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    chess.move(toMoveInput(move));
    const score = minimaxGeneric(chess, depth - 1, -Infinity, Infinity, perspective);
    chess.undo();
    if (score > bestScore) { bestScore = score; bestMove = move; }
  }
  return { bestMove, bestScore };
}
function minimaxGeneric(chess, depth, alpha, beta, perspective) {
  if (chess.isCheckmate()) return chess.turn() === perspective ? -100000 : 100000;
  if (chess.isDraw()) return 0;
  if (depth <= 0) return evaluatePosition(chess, perspective);
  const maximizing = chess.turn() === perspective;
  const moves = orderedMoves(chess.moves({ verbose:true }));
  if (maximizing) {
    let value = -Infinity;
    for (const m of moves) {
      chess.move(toMoveInput(m));
      value = Math.max(value, minimaxGeneric(chess, depth - 1, alpha, beta, perspective));
      chess.undo(); alpha = Math.max(alpha, value); if (alpha >= beta) break;
    }
    return value;
  }
  let value = Infinity;
  for (const m of moves) {
    chess.move(toMoveInput(m));
    value = Math.min(value, minimaxGeneric(chess, depth - 1, alpha, beta, perspective));
    chess.undo(); beta = Math.min(beta, value); if (alpha >= beta) break;
  }
  return value;
}
function isBookMove(chess, move) {
  const history = chess.history().length;
  if (history > 9) return false;
  const key = chess.history({ verbose: true }).map(m => `${m.from}${m.to}${m.promotion || ''}`.trim()).join(' ');
  const options = OPENING_BOOK[key] || [];
  const uci = `${move.from}${move.to}${move.promotion || ''}`;
  return options.some(([candidate]) => candidate === uci);
}
function classifyMove(move, bestMove, bestScore, playedScore) {
  const loss = Math.max(0, Math.round((bestScore ?? 0) - (playedScore ?? 0)));
  const isBestMove = bestMove && move.from === bestMove.from && move.to === bestMove.to && (move.promotion || '') === (bestMove.promotion || '');
  const sacrifice = !!move.captured ? false : PIECE_VALUE[move.piece] >= 3;
  if (isBestMove && sacrifice && (playedScore ?? 0) > (bestScore ?? 0) - 60 && move.san.includes('!')) return 'brilliant';
  if (isBestMove && loss <= 12) {
    if (move.san.includes('+') || move.san.includes('#')) return 'great';
    return 'best';
  }
  if (isBestMove && loss <= 35) return 'excellent';
  if (loss <= 45) return 'excellent';
  if (loss <= 95) return 'good';
  if (loss <= 170) return 'inaccuracy';
  if (loss <= 300) return 'mistake';
  if ((bestScore ?? 0) - (playedScore ?? 0) > 180 && (bestMove?.san?.includes('+') || false)) return 'miss';
  return 'blunder';
}
function buildReviewNote(classification, move, bestMove, bestScore, playedScore, mover) {
  if (classification === 'book') return 'This followed a strong opening path.';
  if (classification === 'brilliant') return `A creative resource. ${move.san} held up as one of the strongest continuations.`;
  if (classification === 'great') return `You found a forcing move at the right moment.`;
  if (classification === 'best') return `Strong choice. ${move.san} matched the engine’s preferred move.`;
  if (classification === 'excellent') return `Very solid. You stayed close to the best continuation.`;
  if (classification === 'good') return `Playable, but there was a cleaner option: ${bestMove?.san || move.san}.`;
  if (classification === 'inaccuracy') return `A small slip. ${bestMove?.san || move.san} kept a little more control.`;
  if (classification === 'mistake') return `This changed the position noticeably. ${bestMove?.san || move.san} was stronger.`;
  if (classification === 'miss') return `You missed a tactical opportunity. ${bestMove?.san || move.san} carried more punch.`;
  return `This was costly. ${bestMove?.san || move.san} would have preserved the position better.`;
}
function reviewSeverityRank(label) {
  return { brilliant: 1, great: 2, best: 3, excellent: 4, good: 5, book: 6, inaccuracy: 7, mistake: 8, miss: 9, blunder: 10 }[label] || 99;
}
function generateCoachText(playerBucket, bestMoment, worstMoment) {
  let headline = 'You played a thoughtful game.';
  let summary = '';
  if (playerBucket.accuracy >= 90) headline = 'That was a very clean performance.';
  else if (playerBucket.counts.blunder >= 2) headline = 'You created chances, but the big mistakes were costly.';
  else if (playerBucket.counts.mistake + playerBucket.counts.inaccuracy <= 2) headline = 'You stayed remarkably stable through most of the game.';
  const strengths = [];
  const improvements = [];
  if (playerBucket.counts.brilliant + playerBucket.counts.great > 0) strengths.push('you found tactical moments when they appeared');
  if (playerBucket.counts.best + playerBucket.counts.excellent >= 6) strengths.push('your move selection stayed close to the best line');
  if (playerBucket.counts.book >= 2) strengths.push('your opening choices were sound');
  if (playerBucket.counts.blunder > 0) improvements.push('reduce the blunders before looking for anything fancy');
  if (playerBucket.counts.mistake > 1) improvements.push('slow down on critical turns and check for loose pieces');
  if (!improvements.length) improvements.push('keep building on your consistency and converting advantages');
  summary = `I estimate your game rating at about ${playerBucket.rating}. `;
  if (strengths.length) summary += `Your strengths here were that ${strengths.join(', ')}. `;
  if (bestMoment) summary += `Your highlight was ${bestMoment.san || bestMoment.move?.san || ''}. `;
  if (worstMoment) summary += `The biggest swing came after ${worstMoment.san || worstMoment.move?.san || ''}. `;
  summary += `For the next game, ${improvements[0]}.`;
  return { headline, summary };
}

function renderReview(review) {
  $('coachHeadline').textContent = review.coach.headline;
  $('coachSummary').textContent = review.coach.summary;
  $('reviewPlayerRating').textContent = review.player.rating.toLocaleString();
  $('reviewPlayerAccuracy').textContent = `${review.player.accuracy.toFixed(1)}%`;
  $('reviewAiRating').textContent = review.ai.rating.toLocaleString();
  $('reviewAiAccuracy').textContent = `${review.ai.accuracy.toFixed(1)}%`;

  const counts = $('reviewCounts'); counts.innerHTML = '';
  REVIEW_ORDER.forEach(key => {
    const item = document.createElement('div'); item.className = 'review-count-item';
    item.innerHTML = `<span class="label">${REVIEW_TITLES[key]}</span><strong>${review.player.counts[key] || 0}</strong>`;
    counts.appendChild(item);
  });

  const keyMoments = $('reviewKeyMoments'); keyMoments.innerHTML = '';
  const moments = [review.bestMoment, review.worstMoment].filter(Boolean);
  if (!moments.length) {
    const empty = document.createElement('div'); empty.className = 'review-moment'; empty.innerHTML = '<p>No major turning points were detected in this game review.</p>'; keyMoments.appendChild(empty);
  } else {
    moments.forEach(m => {
      const row = document.createElement('div'); row.className = 'review-moment';
      row.innerHTML = `<div class="review-moment-title"><strong>${m.plyNumber ? `${Math.ceil(m.plyNumber/2)}${m.plyNumber % 2 ? '. White' : '... Black'}` : 'Key moment'} · ${m.move?.san || m.san}</strong><span class="review-badge ${m.classification}">${REVIEW_TITLES[m.classification]}</span></div><p>${m.note}</p>`;
      keyMoments.appendChild(row);
    });
  }

  const moveList = $('reviewMoveList'); moveList.innerHTML = '';
  review.player.moves.forEach(item => {
    const row = document.createElement('div'); row.className = 'review-move-item';
    row.innerHTML = `<div class="review-move-topline"><strong>${Math.ceil(item.plyNumber/2)}. ${item.san}</strong><span class="review-badge ${item.classification}">${REVIEW_TITLES[item.classification]}</span></div><p class="review-move-note">${item.note}${item.bestSan && item.bestSan !== item.san ? ` Best move: ${item.bestSan}.` : ''}</p>`;
    moveList.appendChild(row);
  });
}

function clamp(min, max, value) { return Math.min(max, Math.max(min, value)); }

function openModal(id) { $(id).classList.remove('hidden'); const focusable = $(id).querySelector('button, input, select'); focusable?.focus(); }
function closeModal(id) { $(id).classList.add('hidden'); }
function showToast(msg) {
  clearTimeout(toastTimer);
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3600);
}
function handleKeyboard(e) {
  if (e.key === 'Escape') { closeModal('settingsModal'); closeModal('reviewModal'); if (!pendingPromotion) closeModal('resultModal'); }
}

function playSound(type) {
  if (!settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    const spec = { move:[220,.035,.035], capture:[150,.06,.05], check:[330,.08,.045], checkmate:[120,.2,.07], start:[440,.09,.045], end:[180,.13,.05] }[type] || [220,.04,.03];
    osc.frequency.value = spec[0]; osc.type = type === 'check' ? 'triangle' : 'sine'; gain.gain.value = spec[2];
    osc.connect(gain); gain.connect(audioContext.destination); const now = audioContext.currentTime; gain.gain.setValueAtTime(spec[2], now); gain.gain.exponentialRampToValueAtTime(.001, now + spec[1]); osc.start(now); osc.stop(now + spec[1] + .01);
  } catch {}
}

init();
