'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

// Chance that a spawning piece carries a lightning mark.
const POWER_CHANCE = 0.15;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const powerEl = document.getElementById('power-count');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');

const THEME_KEY = 'tetris-theme';

let board, powerBoard, powerCharges, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, gridColor, powerColor;

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
    themeToggleBtn.textContent = '☀️';
    themeToggleBtn.setAttribute('aria-label', 'Switch to light theme');
  } else {
    document.body.removeAttribute('data-theme');
    themeToggleBtn.textContent = '🌙';
    themeToggleBtn.setAttribute('aria-label', 'Switch to dark theme');
  }
  const styles = getComputedStyle(document.body);
  gridColor = styles.getPropertyValue('--grid-line').trim();
  powerColor = styles.getPropertyValue('--power').trim();
}

function toggleTheme() {
  const next = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

applyTheme(localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light');
themeToggleBtn.addEventListener('click', toggleTheme);

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return {
    type,
    shape,
    x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
    y: 0,
    power: Math.random() < POWER_CHANCE ? pickPowerCell(shape) : null,
  };
}

function collide(shape, ox, oy) {
  return collides(board, shape, ox, oy);
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const rowsBefore = current.shape.length;   // the mark remap needs the pre-rotation height
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      if (current.power) current.power = rotatePowerCell(current.power, rowsBefore);
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c]) {
        board[current.y + r][current.x + c] = current.shape[r][c];
        if (current.power && current.power.r === r && current.power.c === c)
          powerBoard[current.y + r][current.x + c] = 1;
      }
}

function updateLevel() {
  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
}

/* Returns how many rows this clear removed, which is what the caller needs to
   keep the combo and max-clear statistics. */
function clearLines() {
  const { cleared, charges } = clearFullRows(board, powerBoard);
  if (!cleared) return 0;
  powerCharges += charges;
  lines += cleared;
  score += (LINE_SCORES[cleared] || 0) * level;
  updateLevel();
  updateHUD();
  return cleared;
}

function usePowerUp() {
  if (!powerCharges || paused || gameOver) return;
  powerCharges--;
  const reward = lightningReward(POWERUPS.lightning.apply(board, powerBoard), level);
  score += reward.points;
  lines += reward.lines;
  updateLevel();
  updateHUD();
}

function ghostY() {
  return dropPosition(board, current.shape, current.x, current.y);
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

/* Every lock passes through here, including the ones that clear nothing, which
   is what lets the combo run be broken as well as extended. */
function lockPiece() {
  merge();
  const cleared = clearLines();
  combo = nextCombo(combo, cleared);
  if (combo > bestCombo) bestCombo = combo;
  if (cleared > maxLines) maxLines = cleared;
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  powerEl.textContent = powerCharges;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawPowerMark(context, x, y, size) {
  context.fillStyle = powerColor;
  context.beginPath();
  context.arc(x * size + size / 2, y * size + size / 2, size * 0.18, 0, Math.PI * 2);
  context.fill();
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      drawBlock(ctx, c, r, board[r][c], BLOCK);
      if (powerBoard[r][c]) drawPowerMark(ctx, c, r, BLOCK);
    }

  // A finished game has no piece in play: the one that failed to spawn never became
  // part of the board, so the last frame shows the locked stack on its own.
  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.power)
    drawPowerMark(ctx, current.x + current.power.c, current.y + current.power.r, BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.power)
    drawPowerMark(nextCtx, offX + next.power.c, offY + next.power.r, NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  // The keypress paths (hard/soft drop) end the game outside loop(), so nothing would
  // render the piece that just locked. Draw here; in the loop path this is idempotent.
  draw();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Score: ${score.toLocaleString()}`;
  // The overlay is revealed first: the leaderboard moves focus into the name
  // input, and an element inside a display:none subtree cannot take focus.
  overlay.classList.remove('hidden');
  showGameOverLeaderboard();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSED';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (!shouldScheduleFrame({ gameOver, paused })) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard(ROWS, COLS);
  powerBoard = createBoard(ROWS, COLS);
  powerCharges = 0;
  score = 0;
  lines = 0;
  combo = 0;
  bestCombo = 0;
  maxLines = 0;
  paused = false;
  gameOver = false;
  updateLevel();
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  lbPanel.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // Nothing has been played yet: the start screen owns the page and there is no
  // piece for any key to act on.
  if (!current) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyZ':
      usePowerUp();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

/* ---- Leaderboard ----------------------------------------------------------
   The list rules are pure and live in engine.js; what is left here is storage,
   rendering and the game-over form. */

const LEADERBOARD_KEY = 'tetris-leaderboard';

const startScreen = document.getElementById('start-screen');
const startPlayBtn = document.getElementById('start-play-btn');
const startResetBtn = document.getElementById('start-reset-btn');
const startBody = document.getElementById('start-lb-body');
const startEmpty = document.getElementById('start-lb-empty');
const lbPanel = document.getElementById('lb-overlay-panel');
const lbForm = document.getElementById('lb-form');
const lbNameInput = document.getElementById('lb-name-input');
const lbOverlayBody = document.getElementById('lb-overlay-body');
const lbOverlayEmpty = document.getElementById('lb-overlay-empty');

let leaderboard, bestCombo, maxLines, combo;

/* Storage holds JSON written by an older version, another tab, or a user with a
   console, so both the parse and the read itself are treated as untrusted: a
   corrupt value costs the leaderboard, never the game. */
function loadLeaderboard() {
  try {
    return normalizeLeaderboard(JSON.parse(localStorage.getItem(LEADERBOARD_KEY)), LEADERBOARD_MAX);
  } catch (e) {
    return emptyLeaderboard();
  }
}

function saveLeaderboard() {
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard));
  } catch (e) {
    // A full or blocked storage only costs persistence; the game carries on.
  }
}

function renderLeaderboard(body, emptyEl, highlightIndex) {
  body.replaceChildren();
  emptyEl.classList.toggle('hidden', leaderboard.length > 0);
  leaderboard.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIndex) tr.classList.add('lb-row-current');
    const cells = [i + 1, entry.name, entry.score.toLocaleString(), entry.bestCombo, entry.maxLines];
    cells.forEach(value => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function renderStartLeaderboard() {
  renderLeaderboard(startBody, startEmpty, -1);
}

/* Shows the table under the GAME OVER banner, plus the name form when the run
   earned a place. The highlight only appears once the entry is actually saved. */
function showGameOverLeaderboard() {
  const qualifies = qualifiesForLeaderboard(leaderboard, score, LEADERBOARD_MAX);
  lbPanel.classList.remove('hidden');
  lbForm.classList.toggle('hidden', !qualifies);
  renderLeaderboard(lbOverlayBody, lbOverlayEmpty, -1);
  if (qualifies) {
    lbNameInput.value = '';
    lbNameInput.focus();
  }
}

lbForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = lbNameInput.value.trim() || LEADERBOARD_DEFAULT_NAME;
  const result = insertLeaderboardEntry(
    leaderboard, { name, score, bestCombo, maxLines }, LEADERBOARD_MAX);
  leaderboard = result.entries;
  saveLeaderboard();
  lbForm.classList.add('hidden');
  renderLeaderboard(lbOverlayBody, lbOverlayEmpty, result.index);
  renderStartLeaderboard();
  restartBtn.focus();
});

startPlayBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  init();
});

startResetBtn.addEventListener('click', () => {
  if (!confirm('Erase every saved score? This cannot be undone.')) return;
  leaderboard = emptyLeaderboard();
  saveLeaderboard();
  renderStartLeaderboard();
});

leaderboard = loadLeaderboard();
renderStartLeaderboard();
