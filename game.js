'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

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
const skinSelect = document.getElementById('skin-select');
const pauseMenu = document.getElementById('pause-menu');
const pauseMainView = document.getElementById('pause-main-view');
const pauseControlsView = document.getElementById('pause-controls-view');
const pauseResumeBtn = document.getElementById('pause-resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const pauseControlsBtn = document.getElementById('pause-controls-btn');
const pauseBackBtn = document.getElementById('pause-back-btn');
const pauseStartLevelSelect = document.getElementById('pause-start-level');

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';
const START_LEVEL_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 15;

/* Every mutable global lives here, in one place. They were split across two
   declarations while the leaderboard was being added, which worked only because
   init() is reached from the start button rather than at load: a top-level call
   would have hit the second group's temporal dead zone. One list costs nothing
   and removes the trap. */
let board, powerBoard, powerCharges, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, gridColor, powerColor, skin, menuOpen, startLevel, menuView, menuReturnFocus, leaderboard, bestCombo, maxLines, combo;

/* The canvas cannot read CSS variables while drawing, so the themed colours are
   cached here. Both the theme and the skin feed them, which is why every change
   to either one comes back through this function. */
function cacheCanvasColors() {
  const styles = getComputedStyle(document.body);
  gridColor = styles.getPropertyValue('--skin-grid-line').trim();
  powerColor = styles.getPropertyValue('--skin-power').trim();
}

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
  cacheCanvasColors();
  redraw();
}

function toggleTheme() {
  const next = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

/* Switching skin or theme must show at once, and the loop may not be running to
   do it — the game can be paused or over. At load there is nothing to paint yet:
   init() has not built the board, so this is a no-op until it has. */
function redraw() {
  if (!board || !current || !next) return;
  draw();
  drawNext();
}

function applySkin(id) {
  skin = resolveSkin(id);
  document.body.setAttribute('data-skin', skin.id);
  skinSelect.value = skin.id;
  cacheCanvasColors();
  redraw();
}

SKINS.forEach(entry => {
  const option = document.createElement('option');
  option.value = entry.id;
  option.textContent = entry.label;
  skinSelect.appendChild(option);
});

skinSelect.addEventListener('change', () => {
  localStorage.setItem(SKIN_KEY, skinSelect.value);
  applySkin(skinSelect.value);
});

// The skin goes on first: applyTheme re-reads the same variables afterwards, so
// whichever runs last leaves the cache correct for both.
applySkin(localStorage.getItem(SKIN_KEY));
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

/* Level is the chosen starting level plus one step per ten lines, so picking a
   higher start shifts the whole curve up instead of being erased by the first
   line clear. With the default start of 1 this is the original formula. */
function updateLevel() {
  level = startLevel + Math.floor(lines / 10);
  dropInterval = levelDropInterval(level);
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

/* Traces a rounded rectangle. roundRect is not in every browser this runs on and
   there is no build step to polyfill it, so the manual path is a fallback, not a
   micro-optimisation. Leaves the path current; the caller fills it. */
function roundedRectPath(context, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, radius);
    return;
  }
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

/* Checkerboard dither plus a hard outline. The cell size is derived from the
   block so the pattern reads the same on the board and in the NEXT preview. */
function drawPixelTexture(context, px, py, s) {
  const unit = Math.max(2, Math.round(s / 7));
  context.fillStyle = 'rgba(0,0,0,0.18)';
  for (let ry = 0; ry * unit < s; ry++)
    for (let rx = 0; rx * unit < s; rx++)
      if ((rx + ry) % 2 === 0)
        context.fillRect(
          px + rx * unit,
          py + ry * unit,
          Math.min(unit, s - rx * unit),
          Math.min(unit, s - ry * unit),
        );
  context.fillStyle = 'rgba(0,0,0,0.35)';
  context.fillRect(px, py, s, 1);
  context.fillRect(px, py + s - 1, s, 1);
  context.fillRect(px, py, 1, s);
  context.fillRect(px + s - 1, py, 1, s);
}

/* The single rendering primitive for both canvases, dispatched on the active
   skin. It still no-ops on an empty cell — skinColor returns null for index 0 —
   which is why the draw loops pass raw cell values without guarding. Every piece
   of context state it sets (alpha, shadow) is reset before it returns: a shadow
   left behind bleeds onto the grid, the ghost and the NEXT preview. */
function drawBlock(context, x, y, colorIndex, size, alpha) {
  const color = skinColor(skin, colorIndex);
  if (!color) return;
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;

  switch (skin.blockStyle) {
    case 'glow':
      context.shadowBlur = skin.glow;
      context.shadowColor = color;
      context.fillRect(px, py, s, s);
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      context.strokeStyle = 'rgba(255,255,255,0.7)';
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
      break;
    case 'rounded':
      roundedRectPath(context, px, py, s, s, skin.radius);
      context.fill();
      roundedRectPath(context, px + 2, py + 2, s - 4, Math.max(2, s * 0.3), skin.radius / 2);
      context.fillStyle = 'rgba(255,255,255,0.38)';
      context.fill();
      break;
    case 'pixel':
      context.fillRect(px, py, s, s);
      drawPixelTexture(context, px, py, s);
      break;
    default:
      context.fillRect(px, py, s, s);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px, py, s, 4);
  }
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

/* Suspends or resumes the fall. Resuming resets lastTime first: without that the
   whole time spent paused would arrive as one dt and drop the piece instantly. */
function setPaused(on) {
  if (paused === on || gameOver) return;
  paused = on;
  if (on) {
    cancelAnimationFrame(animId);
  } else {
    lastTime = performance.now();
    loop(lastTime);
  }
}

/* Swaps which of the menu's two views is on screen. Callers move focus afterwards,
   since only they know which control the player came from. */
function showMenuView(view) {
  menuView = view;
  pauseMainView.classList.toggle('hidden', view !== 'main');
  pauseControlsView.classList.toggle('hidden', view !== 'controls');
}

/* The controls a dialog currently offers Tab. The pause menu keeps both of its
   views in the DOM and hides one with display:none, so offsetParent is what
   separates them — a control in the hidden view must never receive focus. That
   filter also relies on nothing here being position:fixed, for which offsetParent
   is null even when visible. */
function dialogFocusables(dialog) {
  return [...dialog.querySelectorAll('button, select, input')]
    .filter(el => el.offsetParent !== null);
}

/* Keeps Tab inside a modal dialog, which is the promise aria-modal makes and the
   markup cannot keep on its own: the page behind keeps its tab order regardless.
   Returns whether it handled the key, so a caller can fall through when the
   dialog holds nothing focusable. */
function trapTab(e, dialog) {
  const items = dialogFocusables(dialog);
  const target = nextFocusIndex(items.length, items.indexOf(document.activeElement), e.shiftKey);
  if (target < 0) return false;
  e.preventDefault();
  items[target].focus();
  return true;
}

/* Hands focus back when the menu closes. Restoring blindly is worse than not
   restoring: both the start button and the menu's own Restart button are hidden
   by the time this runs, and focusing a hidden element drops focus somewhere the
   player cannot see. So the remembered element is used only while it is still on
   screen, and otherwise focus is simply released off the closing dialog. */
function releaseMenuFocus() {
  if (menuReturnFocus && menuReturnFocus.isConnected && menuReturnFocus.offsetParent !== null) {
    menuReturnFocus.focus();
  } else if (pauseMenu.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  menuReturnFocus = null;
}

function openMenu() {
  // `board` is undefined until init() runs, which is what marks a game as started.
  if (!canOpenPauseMenu({ started: Boolean(board), gameOver, menuOpen })) return;
  menuReturnFocus = document.activeElement;
  menuOpen = true;
  setPaused(true);
  showMenuView('main');
  pauseMenu.classList.remove('hidden');
  // The dialog itself takes focus rather than a button, so a stray Space or Enter
  // cannot activate an option the player never aimed at.
  pauseMenu.focus();
}

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  pauseMenu.classList.add('hidden');
  releaseMenuFocus();
  setPaused(false);
}

function toggleMenu() {
  if (gameOver) return;
  if (menuOpen) closeMenu();
  else openMenu();
}

function readStoredStartLevel() {
  return clampStartLevel(localStorage.getItem(START_LEVEL_KEY), MAX_START_LEVEL);
}

function buildStartLevelOptions() {
  for (let n = 1; n <= MAX_START_LEVEL; n++) {
    const option = document.createElement('option');
    option.value = n;
    option.textContent = n;
    pauseStartLevelSelect.appendChild(option);
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
  if (!shouldScheduleFrame({ gameOver, paused, menuOpen })) return;
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
  menuOpen = false;
  pauseMenu.classList.add('hidden');
  releaseMenuFocus();
  showMenuView('main');
  startLevel = readStoredStartLevel();
  pauseStartLevelSelect.value = startLevel;
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
  // piece for any key to act on. It is a modal like the pause menu, though, so Tab
  // still has to stay inside it. `startScreen` is declared further down the file
  // and is initialised by the time any key can arrive, since nothing dispatches
  // events while the script is still running.
  if (!current) {
    if (e.code === 'Tab' && !startScreen.classList.contains('hidden')) trapTab(e, startScreen);
    return;
  }
  // Escape backs out one step at a time: controls view first, then the menu itself.
  if (e.code === 'Escape') {
    if (menuOpen && menuView === 'controls') {
      showMenuView('main');
      pauseControlsBtn.focus();
    } else {
      toggleMenu();
    }
    return;
  }
  if (e.code === 'KeyP') { toggleMenu(); return; }
  if (menuOpen) {
    // The dialog says aria-modal, so Tab has to stay inside it. Without this the
    // page behind keeps its tab order and focus walks out of the modal onto
    // controls the player cannot see.
    if (e.code === 'Tab') {
      trapTab(e, pauseMenu);
      return;
    }
    // Space scrolls the page, but it also drives the menu's own controls
    // (activating a button, opening the select), so only swallow it when the
    // dialog shell itself holds focus.
    if (e.code === 'Space' && e.target === pauseMenu) e.preventDefault();
    return;
  }
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

pauseResumeBtn.addEventListener('click', closeMenu);
pauseRestartBtn.addEventListener('click', init);
pauseControlsBtn.addEventListener('click', () => {
  showMenuView('controls');
  pauseBackBtn.focus();
});
pauseBackBtn.addEventListener('click', () => {
  showMenuView('main');
  pauseControlsBtn.focus();
});

/* The starting level is a preference, not part of the running game: it is stored
   now and picked up by the next init(), so the game in progress keeps its level. */
pauseStartLevelSelect.addEventListener('change', () => {
  localStorage.setItem(START_LEVEL_KEY, pauseStartLevelSelect.value);
});

buildStartLevelOptions();

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
